-- Apply after MESSAGE-TEMPLATES-SETUP.sql. Existing messages remain intact.
begin;
create table if not exists public.mail_delivery_jobs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,
 source text not null check(source in ('tenant_message','owner_message')),message_id text not null,
 payload jsonb not null,to_recipients jsonb not null,cc_recipients jsonb not null default '[]',
 state text not null default 'queued',lease_until timestamptz,first_attempt_at timestamptz,next_run_at timestamptz not null default now(),
 error text,created_at timestamptz not null default now(),unique(workspace_id,source,message_id)
);
create table if not exists public.mail_recipient_deliveries (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.mail_delivery_jobs(id) on delete cascade,
 workspace_id uuid not null,email text not null,role text not null check(role in ('To','CC')),position integer not null,
 token text not null unique,provider_id text unique,state text not null default 'queued',sent_at timestamptz,delivered_at timestamptz,
 opened_at timestamptz,last_opened_at timestamptz,failed_at timestamptz,error text,
 unique(job_id,email),unique(job_id,position)
);
create index if not exists mail_delivery_pending on public.mail_delivery_jobs(state,next_run_at);
alter table public.mail_delivery_jobs enable row level security;
alter table public.mail_recipient_deliveries enable row level security;
revoke all on public.mail_delivery_jobs,public.mail_recipient_deliveries from public,anon,authenticated;
grant all on public.mail_delivery_jobs,public.mail_recipient_deliveries to service_role;

create or replace function public.mr4u_mail_prepare(p_workspace uuid,p_source text,p_message text,p_payload jsonb,p_recipients jsonb)
returns setof public.mail_delivery_jobs language plpgsql security definer set search_path=public as $$
declare job public.mail_delivery_jobs;item jsonb;pos integer:=0;
begin
 if p_source='tenant_message' then
  if not exists(select 1 from tenant_messages where workspace_id=p_workspace and id::text=p_message) then raise exception 'Message not found';end if;
 elsif p_source='owner_message' then
  if not exists(select 1 from owner_messages where workspace_id=p_workspace and id::text=p_message and deleted_at is null) then raise exception 'Message not found';end if;
 else raise exception 'Unknown message source';end if;
 if jsonb_typeof(p_recipients)<>'array' or jsonb_array_length(p_recipients) not between 1 and 50 then raise exception 'Choose 1 to 50 recipients';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||p_source||p_message,0));
 select * into job from mail_delivery_jobs where workspace_id=p_workspace and source=p_source and message_id=p_message;
 if found then return next job;return;end if;
 insert into mail_delivery_jobs(workspace_id,source,message_id,payload,to_recipients,cc_recipients)
 values(p_workspace,p_source,p_message,p_payload,coalesce(p_payload->'to','[]'),coalesce(p_payload->'cc','[]')) returning * into job;
 for item in select value from jsonb_array_elements(p_recipients) loop
  insert into mail_recipient_deliveries(job_id,workspace_id,email,role,position,token)
  values(job.id,p_workspace,lower(item->>'email'),item->>'role',pos,item->>'token');pos:=pos+1;
 end loop;
 return next job;
end $$;
create or replace function public.mr4u_mail_claim(p_id uuid)
returns setof public.mail_delivery_jobs language plpgsql security definer set search_path=public as $$
begin
 return query update mail_delivery_jobs set lease_until=now()+interval '2 minutes',state='sending',first_attempt_at=coalesce(first_attempt_at,now())
 where id=p_id and state in ('queued','sending','partial') and (lease_until is null or lease_until<now()) returning *;
end $$;
create or replace function public.mr4u_mail_event(p_token text,p_provider text,p_type text,p_time timestamptz default now())
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.mail_recipient_deliveries;j public.mail_delivery_jobs;stamp timestamptz:=least(p_time,now());first_event boolean;
begin
 if p_type not in ('opened','delivered','bounced','failed') then return false;end if;
 if p_token is not null then select * into d from mail_recipient_deliveries where token=p_token for update;
 else select * into d from mail_recipient_deliveries where provider_id=p_provider for update;end if;
 if not found then return false;end if;
 select * into j from mail_delivery_jobs where id=d.job_id;
 if p_type='opened' then
  first_event:=d.opened_at is null;
  update mail_recipient_deliveries set opened_at=least(coalesce(opened_at,stamp),stamp),last_opened_at=greatest(coalesce(last_opened_at,stamp),stamp) where id=d.id;
 elsif p_type='delivered' then
  first_event:=d.delivered_at is null;update mail_recipient_deliveries set delivered_at=least(coalesce(delivered_at,stamp),stamp) where id=d.id;
 else
  first_event:=d.failed_at is null;update mail_recipient_deliveries set failed_at=coalesce(failed_at,stamp),error='Recipient delivery '+p_type where id=d.id;
 end if;
 if first_event and j.source='tenant_message' and exists(select 1 from tenant_messages where id::text=j.message_id and workspace_id=j.workspace_id) then
  insert into tenant_message_events(workspace_id,message_id,event_type,metadata)
  values(j.workspace_id,j.message_id::bigint,p_type,jsonb_build_object('recipient_tracking',true,'delivery_id',d.id,'recipient',d.email,'to',jsonb_build_array(d.email),'detected_at',stamp));
 end if;
 if p_type='opened' and j.source='owner_message' then
  update owner_rent_reports set email_opened_at=coalesce(email_opened_at,stamp)
  where id in (select coalesce(report_id,context_report_id) from owner_messages where id::text=j.message_id and workspace_id=j.workspace_id) and workspace_id=j.workspace_id;
 end if;
 return true;
end $$;
create or replace function public.mr4u_mail_finish(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.mail_delivery_jobs;m public.tenant_messages;provider text;sent timestamptz;
begin
 select * into j from mail_delivery_jobs where id=p_id for update;
 if not found or exists(select 1 from mail_recipient_deliveries where job_id=p_id and sent_at is null) then return false;end if;
 select provider_id into provider from mail_recipient_deliveries where job_id=p_id order by position limit 1;
 select max(sent_at) into sent from mail_recipient_deliveries where job_id=p_id;
 if j.source='tenant_message' then
  select * into m from tenant_messages where workspace_id=j.workspace_id and id::text=j.message_id for update;
  if found then
   if m.sent_at is null then
    insert into tenant_message_events(workspace_id,message_id,event_type,metadata)
    values(j.workspace_id,m.id,'sent',jsonb_build_object('from',j.payload->>'from','to',j.to_recipients,'cc',j.cc_recipients,'reply_to',j.payload->>'reply_to','provider_message_id',provider,'recipient_tracking',true));
   end if;
   update tenant_messages set status='sent',sent_at=coalesce(sent_at,sent),provider_message_id=provider,to_recipients=j.to_recipients,cc_recipients=j.cc_recipients,updated_at=now() where id=m.id and workspace_id=j.workspace_id;
  end if;
 else
  update owner_messages set status='sent',provider_email_id=provider,to_recipients=j.to_recipients,cc_recipients=j.cc_recipients where id::text=j.message_id and workspace_id=j.workspace_id and deleted_at is null;
 end if;
 update mail_delivery_jobs set state='sent',lease_until=null,error=null where id=p_id;
 return true;
end $$;
create or replace function public.mr4u_owner_mail_open_counts(p_workspace uuid,p_owner bigint,p_ids text[])
returns table(message_id text,opened_count bigint) language sql security definer set search_path=public as $$
 select j.message_id,count(*) filter(where d.opened_at is not null)
 from mail_delivery_jobs j join mail_recipient_deliveries d on d.job_id=j.id and d.workspace_id=j.workspace_id
 join owner_messages m on m.id::text=j.message_id and m.workspace_id=j.workspace_id
 where j.workspace_id=p_workspace and j.source='owner_message' and m.owner_id=p_owner and m.deleted_at is null and j.message_id=any(p_ids)
 group by j.message_id
$$;
revoke all on function public.mr4u_mail_prepare(uuid,text,text,jsonb,jsonb),public.mr4u_mail_claim(uuid),public.mr4u_mail_finish(uuid),public.mr4u_owner_mail_open_counts(uuid,bigint,text[]),public.mr4u_mail_event(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.mr4u_mail_prepare(uuid,text,text,jsonb,jsonb),public.mr4u_mail_claim(uuid),public.mr4u_mail_finish(uuid),public.mr4u_owner_mail_open_counts(uuid,bigint,text[]),public.mr4u_mail_event(text,text,text,timestamptz) to service_role;
commit;
notify pgrst,'reload schema';

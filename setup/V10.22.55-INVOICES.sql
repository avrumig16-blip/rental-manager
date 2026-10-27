begin;
create table if not exists public.billing_schedules(
 id uuid primary key,workspace_id uuid not null,name text not null,enabled boolean not null default false,deleted_at timestamptz,
 start_date date not null,next_date date not null,end_date date,every integer not null check(every between 1 and 365),unit text not null check(unit in ('day','week','month','year')),
 mode text not null check(mode in ('draft','issue','send')),due_days integer not null check(due_days between 0 and 365),snapshot jsonb not null,version integer not null default 1,created_by uuid,created_at timestamptz not null default now());
create table if not exists public.billing_schedule_runs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,schedule_id uuid not null,run_date date not null,invoice_id uuid,
 config jsonb not null,mail_payload jsonb,state text not null default 'pending',attempts integer not null default 0,lease_token uuid,lease_until timestamptz,
 retry_at timestamptz,first_attempt_at timestamptz,error text,completed_at timestamptz,created_at timestamptz not null default now(),unique(schedule_id,run_date));
alter table public.billing_schedule_runs add column if not exists mail_payload jsonb;
create index if not exists billing_schedules_due on public.billing_schedules(next_date) where enabled and deleted_at is null;
create or replace function public.mr4u_billing_claim(p_id uuid,p_workspace uuid,p_today date) returns jsonb language plpgsql security definer set search_path=public as $$
declare s billing_schedules;r billing_schedule_runs;begin
 select * into s from billing_schedules where id=p_id and workspace_id=p_workspace for update;
 if not found or not s.enabled or s.deleted_at is not null or s.next_date>p_today or (s.end_date is not null and s.next_date>s.end_date) then return null;end if;
 insert into billing_schedule_runs(workspace_id,schedule_id,run_date,config) values(s.workspace_id,s.id,s.next_date,to_jsonb(s)) on conflict(schedule_id,run_date) do nothing;
 select * into r from billing_schedule_runs where schedule_id=s.id and run_date=s.next_date for update;
 if r.state in ('complete','review') or r.attempts>=5 or r.lease_until>now() or r.retry_at>now() then return null;end if;
 update billing_schedule_runs set attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,now()) where id=r.id returning * into r;
 return to_jsonb(r);end $$;
create or replace function public.mr4u_billing_run_invoice(p_run uuid,p_token uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r billing_schedule_runs;i billing_invoices;begin
 select * into r from billing_schedule_runs where id=p_run for update;
 if not found or r.lease_token is distinct from p_token or r.lease_until<now() or r.state<>'pending' then raise exception 'Recurring run lease expired';end if;
 if r.invoice_id is null then
 insert into billing_invoices(id,workspace_id,kind,snapshot,total_cents,created_by) values(gen_random_uuid(),r.workspace_id,'invoice',p_snapshot,(p_snapshot->>'total_cents')::bigint,(r.config->>'created_by')::uuid) returning * into i;
 update billing_schedule_runs set invoice_id=i.id where id=r.id;
 else select * into i from billing_invoices where id=r.invoice_id and workspace_id=r.workspace_id;if not found then raise exception 'Generated invoice was removed; review the run';end if;
 end if;return to_jsonb(i);end $$;
create or replace function public.mr4u_billing_payload(p_run uuid,p_token uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r billing_schedule_runs;begin
 select * into r from billing_schedule_runs where id=p_run for update;
 if not found or r.lease_token is distinct from p_token or r.lease_until<now() then raise exception 'Recurring lease expired';end if;
 update billing_schedule_runs set mail_payload=coalesce(mail_payload,p_payload) where id=p_run returning * into r;return r.mail_payload;end $$;
create or replace function public.mr4u_billing_finish(p_run uuid,p_token uuid,p_next date,p_error text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare r billing_schedule_runs;begin
 select * into r from billing_schedule_runs where id=p_run for update;
 if not found or r.lease_token is distinct from p_token then raise exception 'Recurring run lease changed';end if;
 if p_error is not null then
 update billing_schedule_runs set error=p_error,state=case when attempts>=5 or first_attempt_at<now()-interval '23 hours' then 'review' else 'pending' end,retry_at=now()+interval '15 minutes',lease_until=null,lease_token=null where id=r.id;
 if r.attempts>=5 or r.first_attempt_at<now()-interval '23 hours' then update billing_schedules set enabled=false,version=version+1 where id=r.schedule_id;end if;
 else
 update billing_schedule_runs set state='complete',error=null,completed_at=now(),lease_until=null,lease_token=null where id=r.id;
 update billing_schedules set next_date=p_next,enabled=enabled and (end_date is null or p_next<=end_date),version=version+1 where id=r.schedule_id and next_date=r.run_date;
 end if;return '{"ok":true}';end $$;
create or replace function public.mr4u_billing_skip(p_id uuid,p_workspace uuid,p_run uuid,p_next date) returns jsonb language plpgsql security definer set search_path=public as $$
declare s billing_schedules;r billing_schedule_runs;begin
 select * into s from billing_schedules where id=p_id and workspace_id=p_workspace for update;
 if not found then raise exception 'Schedule unavailable';end if;
 select * into r from billing_schedule_runs where id=p_run and workspace_id=p_workspace and schedule_id=p_id for update;
 if not found or r.state<>'review' or s.next_date<>r.run_date then raise exception 'Review run unavailable';end if;
 update billing_schedule_runs set state='skipped',completed_at=now() where id=r.id;
 update billing_schedules set next_date=p_next,enabled=false,version=version+1 where id=s.id;return '{"ok":true}';end $$;
-- Schedule edits do not change an already started run's frozen snapshot.
do $$declare t text;begin foreach t in array array['billing_schedules','billing_schedule_runs'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
revoke all on function public.mr4u_billing_claim(uuid,uuid,date),public.mr4u_billing_run_invoice(uuid,uuid,jsonb),public.mr4u_billing_finish(uuid,uuid,date,text),public.mr4u_billing_payload(uuid,uuid,jsonb),public.mr4u_billing_skip(uuid,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.mr4u_billing_claim(uuid,uuid,date),public.mr4u_billing_run_invoice(uuid,uuid,jsonb),public.mr4u_billing_finish(uuid,uuid,date,text),public.mr4u_billing_payload(uuid,uuid,jsonb),public.mr4u_billing_skip(uuid,uuid,uuid,date) to service_role;
commit;
notify pgrst,'reload schema';

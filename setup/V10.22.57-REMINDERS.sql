begin;
alter table public.tenant_messages add column if not exists to_recipients jsonb not null default '[]';
alter table public.tenant_messages add column if not exists cc_recipients jsonb not null default '[]';
alter table public.tenant_messages add column if not exists reminder_month text;
alter table public.tenant_messages add column if not exists reminder_kind text;
alter table public.tenant_messages add column if not exists reminder_payment_id text;
alter table public.tenant_messages add column if not exists reminder_request_id uuid;
create unique index if not exists tenant_message_reminder_request on public.tenant_messages(workspace_id,reminder_request_id);
create or replace function public.mr4u_quick_reminder(p_payload jsonb,p_explicit boolean,p_previous boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare m tenant_messages;begin
 perform pg_advisory_xact_lock(hashtextextended((p_payload->>'workspace_id')||'|'||(p_payload->>'tenant_id')||'|'||(p_payload->>'reminder_month'),0));
 select * into m from tenant_messages where workspace_id::text=p_payload->>'workspace_id' and reminder_request_id=(p_payload->>'reminder_request_id')::uuid;
 if found then return jsonb_build_object('message',to_jsonb(m));end if;
 if not p_explicit and (p_previous or exists(select 1 from tenant_messages where workspace_id::text=p_payload->>'workspace_id' and tenant_id::text=p_payload->>'tenant_id' and reminder_month=p_payload->>'reminder_month' and coalesce(status,'')<>'failed')) then return '{"needs_choice":true}';end if;
 insert into tenant_messages(workspace_id,tenant_id,subject,body,reply_mode,delivery_channel,status,tracking_token,to_recipients,cc_recipients,reminder_month,reminder_kind,reminder_payment_id,reminder_request_id)
 values((p_payload->>'workspace_id')::uuid,(p_payload->>'tenant_id')::bigint,p_payload->>'subject',p_payload->>'body','allow','email','queued',p_payload->>'tracking_token',p_payload->'to_recipients',p_payload->'cc_recipients',p_payload->>'reminder_month',p_payload->>'reminder_kind',p_payload->>'reminder_payment_id',(p_payload->>'reminder_request_id')::uuid) returning * into m;
 return jsonb_build_object('message',to_jsonb(m));end $$;
revoke all on function public.mr4u_quick_reminder(jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.mr4u_quick_reminder(jsonb,boolean,boolean) to service_role;
commit;
notify pgrst,'reload schema';

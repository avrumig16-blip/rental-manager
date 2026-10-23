begin;
create table if not exists public.signature_requests(
 id uuid primary key,workspace_id uuid not null,title text not null,source_object text not null,source_sha256 text not null,bytes bigint not null,
 result_object text,result_sha256 text,source_validated boolean not null default false,state text not null default 'draft',signers jsonb not null,events jsonb not null default '[]',expires_at timestamptz not null,created_by uuid,created_at timestamptz not null default now());
create index if not exists signature_requests_workspace on public.signature_requests(workspace_id,created_at);
create table if not exists public.billing_records(id uuid primary key,workspace_id uuid not null,kind text not null check(kind in ('settings','customer','product')),data jsonb not null,version integer not null default 1);
create index if not exists billing_records_workspace on public.billing_records(workspace_id,kind);
create unique index if not exists billing_one_settings on public.billing_records(workspace_id) where kind='settings';
create table if not exists public.billing_invoices(id uuid primary key,workspace_id uuid not null,kind text not null check(kind in ('invoice','credit')),number text,state text not null default 'draft',snapshot jsonb not null,total_cents bigint not null check(total_cents>=0),payments jsonb not null default '[]',payment_events jsonb not null default '[]',credited_cents bigint not null default 0,original_id uuid,version integer not null default 1,created_by uuid,created_at timestamptz not null default now(),issued_at timestamptz,sent_at timestamptz,external_reference text);
create unique index if not exists billing_invoice_number on public.billing_invoices(workspace_id,number) where number is not null;
create table if not exists public.billing_counters(workspace_id uuid not null,series text not null,next_number bigint not null default 1,primary key(workspace_id,series));
-- Row locks bind each code and signature to exactly one immutable PDF and signer.
create or replace function public.mr4u_sign_mutate(p_id uuid,p_op text,p_signer text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare r signature_requests; s jsonb; idx integer; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); event jsonb; begin
 select * into r from signature_requests where id=p_id for update;
 if not found then raise exception 'Signing request unavailable'; end if;
 if p_op='cancel' then
  if r.state='completed' then raise exception 'Completed signatures cannot be cancelled';end if;
  update signature_requests set state='cancelled',events=events||jsonb_build_array(jsonb_build_object('type','cancelled','at',stamp)) where id=p_id;return '{"ok":true}';
 end if;
 if r.state='cancelled' or r.expires_at<now() then raise exception 'Signing request cancelled or expired';end if;
 if p_op='activate' then
  if r.state='draft' then update signature_requests set state='active',source_validated=true where id=p_id;end if;return '{"ok":true}';
 end if;
 if r.state not in ('active','completed') then raise exception 'Finish uploading the document first';end if;
 select ordinality::integer-1,value into idx,s from jsonb_array_elements(r.signers) with ordinality where value->>'id'=p_signer;
 if s is null then raise exception 'Signer unavailable';end if;
 if p_op='opened' then
  if s->>'opened_at' is null then s:=s||jsonb_build_object('opened_at',stamp);else return '{"ok":true}';end if;
 elsif p_op='invited' then s:=s||jsonb_build_object('invited_at',stamp);
 elsif p_op='code' then
  if s->>'signed_at' is not null or s->>'declined_at' is not null then raise exception 'Signer already finished';end if;
  if coalesce((s->>'code_sent_at')::timestamptz,'1970-01-01')>now()-interval '60 seconds' then raise exception 'Wait one minute before requesting another code';end if;
  s:=s||jsonb_build_object('code_hash',p_data->>'hash','code_expires',now()+interval '10 minutes','code_sent_at',stamp,'attempts',0);
 elsif p_op in ('submit','decline') then
  if s->>'signed_at' is not null or s->>'declined_at' is not null then raise exception 'Signer already finished';end if;
  if coalesce((s->>'code_expires')::timestamptz,'1970-01-01')<now() or coalesce((s->>'attempts')::int,0)>=5 then raise exception 'Request a new email code';end if;
  if s->>'code_hash' is null or s->>'code_hash'<>p_data->>'code_hash' then
   s:=s||jsonb_build_object('attempts',coalesce((s->>'attempts')::int,0)+1);
   update signature_requests set signers=jsonb_set(signers,array[idx::text],s) where id=p_id;return '{"error":"Incorrect email code"}';
  end if;
  s:=s-'code_hash'-'code_expires';
  if p_op='submit' then s:=s||jsonb_build_object('signed_at',stamp,'evidence',p_data-'code_hash');else s:=s||jsonb_build_object('declined_at',stamp,'reason',p_data->>'reason');end if;
 else raise exception 'Unknown signing operation';end if;
 event:=jsonb_build_object('type',p_op,'at',stamp,'signer',p_signer);
 r.signers:=jsonb_set(r.signers,array[idx::text],s);
 update signature_requests set signers=r.signers,events=events||jsonb_build_array(event),state=case when not exists(select 1 from jsonb_array_elements(r.signers) x where x->>'signed_at' is null) then 'completed' else state end where id=p_id;
 return '{"ok":true}';end $$;
create or replace function public.mr4u_invoice_mutate(p_id uuid,p_workspace uuid,p_op text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare r billing_invoices; orig billing_invoices; v_series text; n bigint; paid bigint; begin
 select * into r from billing_invoices where id=p_id and workspace_id=p_workspace for update;
 if not found then raise exception 'Invoice unavailable';end if;
 if p_op='issue' then
  if r.state<>'draft' then return to_jsonb(r);end if;
  if r.kind='credit' then
   select * into orig from billing_invoices where id=r.original_id and workspace_id=p_workspace and kind='invoice' and state='issued' for update;
   if not found or r.total_cents>orig.total_cents-orig.credited_cents then raise exception 'Credit exceeds the original invoice remaining value';end if;
   if r.snapshot->'customer'<>orig.snapshot->'customer' or r.snapshot->'seller'<>orig.snapshot->'seller' then raise exception 'Credit note must use the original invoice parties';end if;
   update billing_invoices set credited_cents=credited_cents+r.total_cents,version=version+1 where id=orig.id;
  end if;
  v_series:=(case when r.kind='credit' then 'CN-' else 'INV-' end)||substring(r.snapshot->>'issue_date',1,4);
  insert into billing_counters(workspace_id,series) values(p_workspace,v_series) on conflict do nothing;
  update billing_counters set next_number=next_number+1 where workspace_id=p_workspace and billing_counters.series=v_series returning next_number-1 into n;
  update billing_invoices set number=v_series||'-'||lpad(n::text,6,'0'),state='issued',issued_at=now(),version=version+1 where id=p_id returning * into r;
 elsif p_op='payment' then
  if r.state<>'issued' or r.kind<>'invoice' then raise exception 'Record payments on an issued invoice';end if;
  if exists(select 1 from jsonb_array_elements(r.payments) p where p->>'id'=p_data->>'id') then return to_jsonb(r);end if;
  select coalesce(sum((p->>'cents')::bigint),0) into paid from jsonb_array_elements(r.payments) p;
  if (p_data->>'cents')::bigint<=0 or (p_data->>'cents')::bigint>r.total_cents-r.credited_cents-paid then raise exception 'Payment exceeds the outstanding amount';end if;
  update billing_invoices set payments=payments||jsonb_build_array(p_data),payment_events=payment_events||jsonb_build_array(jsonb_build_object('type','recorded','at',now(),'payment',p_data)),version=version+1 where id=p_id returning * into r;
 elsif p_op='reverse_payment' then
  if not exists(select 1 from jsonb_array_elements(r.payments) p where p->>'id'=p_data->>'id') then raise exception 'Payment unavailable';end if;
  update billing_invoices set payment_events=payment_events||jsonb_build_array(jsonb_build_object('type','reversed','at',now(),'payment',(select p from jsonb_array_elements(r.payments) p where p->>'id'=p_data->>'id'),'by',p_data->>'created_by')),payments=coalesce((select jsonb_agg(p) from jsonb_array_elements(payments) p where p->>'id'<>p_data->>'id'),'[]'),version=version+1 where id=p_id returning * into r;
 elsif p_op='sent' then
  if r.state<>'issued' then raise exception 'Issue the invoice first';end if;
  update billing_invoices set sent_at=now(),external_reference=coalesce(nullif(p_data->>'external_reference',''),external_reference),version=version+1 where id=p_id returning * into r;
 else raise exception 'Unknown invoice operation';end if;
 return to_jsonb(r);end $$;
do $$declare t text;begin foreach t in array array['signature_requests','billing_records','billing_invoices','billing_counters'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
revoke all on function public.mr4u_sign_mutate(uuid,text,text,jsonb),public.mr4u_invoice_mutate(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mr4u_sign_mutate(uuid,text,text,jsonb),public.mr4u_invoice_mutate(uuid,uuid,text,jsonb) to service_role;
commit;
notify pgrst,'reload schema';

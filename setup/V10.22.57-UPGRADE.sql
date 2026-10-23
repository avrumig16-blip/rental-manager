-- ManageRent4U V10.22.44: run this entire file in Supabase SQL Editor.
-- Includes the V10.22.43 corrections plus private signed files and utility handovers.
-- No existing business records are deleted.

-- ManageRent4U V10.22.43: run this entire file in Supabase SQL Editor.
-- Upgrades an already configured V10.22.42 database. No records are deleted.

-- SHARING-SETUP.sql
-- Optional compatibility for older share_links table constraints.
-- Existing allowed types and policies remain in place; add tenant support.
begin;
do $$ declare r record; expression text; begin
 for r in select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.share_links'::regclass and contype='c' and pg_get_constraintdef(oid) like '%entity_type%' loop
  expression:=regexp_replace(r.definition,'^CHECK \((.*)\)$','\1');
  execute format('alter table public.share_links drop constraint %I',r.conname);
  execute format('alter table public.share_links add constraint %I check ((%s) or entity_type=''tenant'')',r.conname,expression);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';


-- READ-ONLY-AND-NOTICES-SETUP.sql
-- Idempotent upgrade: protects viewer writes and stores contract reminder preferences.
begin;
create table if not exists public.lease_notice_preferences(
 workspace_id uuid primary key,enabled boolean not null default true,buffer_months integer not null default 1 check(buffer_months between 1 and 12),updated_at timestamptz not null default now());
create table if not exists public.lease_notice_plans(
 workspace_id uuid not null,tenant_id bigint not null,region text not null default 'unknown' check(region in ('unknown','flanders','brussels','wallonia','other')),
 primary_residence boolean not null default false,lease_kind text not null default 'review' check(lease_kind in ('short','nine_year','review')),
 signed_date date,start_date date,end_date date,notice_months integer not null default 6 check(notice_months between 1 and 24),buffer_months integer not null default 1 check(buffer_months between 1 and 12),
 enabled boolean not null default true,notice_served_at date,notice_end_date date,service_reference text not null default '',updated_at timestamptz not null default now(),primary key(workspace_id,tenant_id));
alter table public.lease_notice_preferences enable row level security;
alter table public.lease_notice_plans enable row level security;
revoke all on public.lease_notice_preferences,public.lease_notice_plans from anon,authenticated;
grant all on public.lease_notice_preferences,public.lease_notice_plans to service_role;

-- An additional write guard also covers existing permissive RLS policies and security-definer RPCs.
-- Service-role backend jobs retain their existing authorization checks.
create or replace function public.mr4u_viewer_write_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); wid uuid; old_wid uuid;
begin
 if actor is null then
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if TG_OP<>'INSERT' then old_wid:=(to_jsonb(OLD)->>'workspace_id')::uuid; end if;
 if TG_OP='DELETE' then wid:=old_wid; else wid:=(to_jsonb(NEW)->>'workspace_id')::uuid; end if;
 if exists(select 1 from public.platform_admins p where p.user_id=actor) then
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if wid is null or not (exists(select 1 from public.workspaces w where w.id=wid and w.owner_user_id=actor and w.status='active') or exists(select 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id where m.workspace_id=wid and m.user_id=actor and m.role in ('owner','admin','editor') and w.status='active')) then
  raise insufficient_privilege using message='Your workspace access is view only. No changes were saved';
 end if;
 if old_wid is not null and wid is distinct from old_wid then raise insufficient_privilege using message='Records cannot be moved between workspaces'; end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function public.mr4u_viewer_write_guard() from public,anon,authenticated;
do $$ declare tbl text; begin
 foreach tbl in array array['owners','owner_bank_accounts','buildings','units','tenants','tenant_units','payments','payment_entries','tenant_adjustments','tenant_indexations','utility_ean_codes','meter_readings','utility_tariffs','contract_intakes','tenant_messages','tenant_message_events','tenant_reminders','custom_reminders','expense_records','share_links','bank_connections','bank_accounts','bank_transactions'] loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=tbl and column_name='workspace_id') then
   execute format('drop trigger if exists mr4u_viewer_write_guard on public.%I',tbl);
   execute format('create trigger mr4u_viewer_write_guard before insert or update or delete on public.%I for each row execute function public.mr4u_viewer_write_guard()',tbl);
  end if;
 end loop;
end $$;
commit;
notify pgrst,'reload schema';


-- BACKUP-SNAPSHOT-FIX.sql
-- Fixes the admin snapshot record/trigger alias collision; no data is removed.
begin;
create or replace function public.mr4u_backup_snapshot(p_admin boolean,p_workspaces text[],p_user text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot_table record; rows jsonb; result jsonb:='{}'; predicate text; has_workspace boolean;
begin
 for snapshot_table in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition and c.relname not in ('mr4u_backup_jobs','mr4u_backup_worker_config','mr4u_receipt_worker_config') order by c.relname
 loop
  if p_admin then predicate:='true';
  elsif snapshot_table.relname='workspaces' then predicate:='to_jsonb(r)->>''id'' = any($1)';
  elsif snapshot_table.relname in ('user_profiles','mr4u_backup_preferences') then predicate:='to_jsonb(r)->>''user_id'' = $2';
  else
   select exists(select 1 from information_schema.columns where table_schema='public' and table_name=snapshot_table.relname and column_name='workspace_id') into has_workspace;
   if not has_workspace then continue; end if;
   predicate:='to_jsonb(r)->>''workspace_id'' = any($1)';
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where %s',snapshot_table.relname,predicate) into rows using p_workspaces,p_user;
  result:=result||jsonb_build_object(snapshot_table.relname,rows);
 end loop;
 return jsonb_build_object('tables',result,'captured_at',now(),
  'storage_objects',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from storage.objects o where o.bucket_id<>'mr4u-backups'),
  'storage_buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from storage.buckets b where b.id<>'mr4u-backups'),
  'auth_profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'phone',u.phone,'created_at',u.created_at,'email_confirmed_at',u.email_confirmed_at,'user_metadata',u.raw_user_meta_data,'app_metadata',u.raw_app_meta_data)),'[]') from auth.users u where p_admin or u.id::text=p_user or u.id::text in(select w.owner_user_id::text from public.workspaces w where w.id::text=any(p_workspaces))),
  'schema',case when p_admin then jsonb_build_object(
   'columns',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from information_schema.columns c where c.table_schema='public'),
   'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))),'[]') from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
   'indexes',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from pg_indexes i where i.schemaname='public'),
   'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from pg_policies p where p.schemaname in ('public','storage')),
   'functions',(select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
   'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'definition',pg_get_triggerdef(t.oid))),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal)
  ) else null end);
end;
$$;
revoke all on function public.mr4u_backup_snapshot(boolean,text[],text) from public,anon,authenticated;
grant execute on function public.mr4u_backup_snapshot(boolean,text[],text) to service_role;

commit;
notify pgrst,'reload schema';


begin;
create table if not exists public.utility_handovers(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,unit_id bigint not null,building_id bigint not null,owner_id bigint,
 handover_date date not null,region text not null check(region in ('flanders','brussels','wallonia')),language text not null default 'nl' check(language in ('nl','fr','en')),
 mode text not null check(mode in ('owner_to_tenant','tenant_to_tenant','tenant_to_owner')),outgoing_tenant_id bigint,incoming_tenant_id bigint,
 snapshot jsonb not null,created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz);
create index if not exists utility_handovers_unit on public.utility_handovers(workspace_id,unit_id,handover_date);
create table if not exists public.property_documents(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,tenant_id bigint,unit_id bigint,contract_id bigint,handover_id uuid,
 category text not null check(category in ('signed_contract','signed_handover','attachment')),title text not null,file_name text not null,mime_type text not null,
 bytes bigint not null check(bytes>0 and bytes<=26214400),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 storage_bucket text not null default 'mr4u-documents' check(storage_bucket='mr4u-documents'),storage_object text not null unique,
 state text not null default 'pending' check(state in ('pending','ready')),created_by uuid,created_at timestamptz not null default now(),completed_at timestamptz,deleted_at timestamptz,
 check(tenant_id is not null or handover_id is not null));
create index if not exists property_documents_tenant on public.property_documents(workspace_id,tenant_id);
create index if not exists property_documents_handover on public.property_documents(workspace_id,handover_id);
alter table public.property_documents enable row level security;
alter table public.utility_handovers enable row level security;
revoke all on public.property_documents,public.utility_handovers from anon,authenticated;
grant all on public.property_documents,public.utility_handovers to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('mr4u-documents','mr4u-documents',false,26214400,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Existing broad storage policies cannot make these documents public.
drop policy if exists mr4u_documents_private on storage.objects;
create policy mr4u_documents_private on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'mr4u-documents') with check(bucket_id<>'mr4u-documents');
commit;
notify pgrst,'reload schema';

begin;
alter table public.owners add column if not exists postal_address jsonb;
alter table public.buildings add column if not exists postal_address jsonb;
alter table public.tenants add column if not exists postal_address jsonb;
comment on column public.owners.postal_address is 'Canonical postal address: street, number, box, postal_code, city, country. Null preserves legacy address fallback.';
comment on column public.buildings.postal_address is 'Canonical property address. Unit box comes from the linked unit.';
comment on column public.tenants.postal_address is 'Canonical tenant correspondence/billing address; separate from the rented property address.';
alter table public.tenants add column if not exists lease_region text;
alter table public.tenants add column if not exists primary_residence boolean;
notify pgrst, 'reload schema';
commit;

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


-- V10.22.52 inline signature placement and request removal
begin;
alter table public.signature_requests add column if not exists layout_mode text not null default 'appendix';
alter table public.signature_requests add column if not exists source_context jsonb;
alter table public.signature_requests add column if not exists deleted_at timestamptz;
commit;
create or replace function public.mr4u_sign_mutate(p_id uuid,p_op text,p_signer text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare r signature_requests; s jsonb; idx integer; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); event jsonb; begin
 select * into r from signature_requests where id=p_id for update;
 if not found then raise exception 'Signing request unavailable'; end if;
 if p_op='delete' then update signature_requests set deleted_at=now(),events=events||jsonb_build_array(jsonb_build_object('type','removed','at',stamp)) where id=p_id;return '{"ok":true}';end if;
 if r.deleted_at is not null then raise exception 'Signing request removed';end if;
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
 if p_op='place' then
  if exists(select 1 from jsonb_array_elements(r.signers) x where x->>'signed_at' is not null or x->>'invited_at' is not null) then raise exception 'Signature boxes are locked after invitations are sent';end if;
  s:=s||jsonb_build_object('placement',p_data);
 elsif p_op='opened' then
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
notify pgrst,'reload schema';

-- Shared recurring worker prerequisites
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create table if not exists public.mr4u_receipt_worker_config(id boolean primary key default true check(id),url text not null,secret text not null);
alter table public.mr4u_receipt_worker_config enable row level security;
revoke all on public.mr4u_receipt_worker_config from anon,authenticated;
grant all on public.mr4u_receipt_worker_config to service_role;

create or replace function public.mr4u_receipt_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.mr4u_receipt_worker_config;
begin
 select * into cfg from public.mr4u_receipt_worker_config where id=true;
 if found then perform net.http_post(url:=cfg.url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cfg.secret),body:='{}'::jsonb,timeout_milliseconds:=55000); end if;
end;
$$;
revoke all on function public.mr4u_receipt_tick() from public,anon,authenticated;
grant execute on function public.mr4u_receipt_tick() to service_role;
select cron.schedule('managerent4u-payment-thanks','*/5 * * * *','select public.mr4u_receipt_tick();');
notify pgrst, 'reload schema';

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

-- V10.22.57 direct dashboard reminders
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

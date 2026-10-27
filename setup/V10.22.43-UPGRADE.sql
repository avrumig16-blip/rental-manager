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

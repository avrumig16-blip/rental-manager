-- Run once in the Supabase SQL editor as project owner.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create table if not exists public.mr4u_backup_preferences (
 user_id text primary key, enabled boolean not null default false, email text not null,
 every integer not null default 1 check (every between 1 and 1000), unit text not null default 'day' check (unit in ('day','week','month','year')),
 anchor_at timestamptz not null default now(), next_run_at timestamptz, last_success_at timestamptz, last_error text, updated_at timestamptz not null default now()
);
create table if not exists public.mr4u_backup_jobs (
 id uuid primary key default gen_random_uuid(), user_id text not null, email text, scheduled_for timestamptz,
 phase text not null default 'snapshot', state jsonb not null default '{}', scope_hash text, scope_label text,
 created_at timestamptz not null default now(), completed_at timestamptz, lease_until timestamptz,
 retry_at timestamptz, attempts integer not null default 0, error text, archive_path text, bytes bigint,
 email_part integer not null default 0
);
create unique index if not exists mr4u_backup_scheduled_unique on public.mr4u_backup_jobs(user_id,scheduled_for) where scheduled_for is not null;
create table if not exists public.mr4u_backup_worker_config(id boolean primary key default true check(id), url text not null, secret text not null);
alter table public.mr4u_backup_preferences enable row level security;
alter table public.mr4u_backup_jobs enable row level security;
alter table public.mr4u_backup_worker_config enable row level security;
revoke all on public.mr4u_backup_preferences,public.mr4u_backup_jobs,public.mr4u_backup_worker_config from anon,authenticated;
grant all on public.mr4u_backup_preferences,public.mr4u_backup_jobs,public.mr4u_backup_worker_config to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('mr4u-backups','mr4u-backups',false,536870912) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
-- No client access policy is added to this private bucket. Only authenticated server checks can issue short-lived download links.
create or replace function public.mr4u_backup_claim(p_id uuid) returns setof public.mr4u_backup_jobs
language sql security definer set search_path=public,pg_temp as $$
 update public.mr4u_backup_jobs set lease_until=now()+interval '90 seconds'
 where id=p_id and phase not in ('complete','failed') and (lease_until is null or lease_until<now()) returning *;
$$;
revoke all on function public.mr4u_backup_claim(uuid) from public,anon,authenticated;
grant execute on function public.mr4u_backup_claim(uuid) to service_role;

-- One transactional snapshot; no PostgREST 1,000-row truncation. All columns are retained.
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

create or replace function public.mr4u_backup_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.mr4u_backup_worker_config;
begin
 select * into cfg from public.mr4u_backup_worker_config where id=true;
 if found then perform net.http_post(url:=cfg.url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cfg.secret),body:='{"action":"cron"}'::jsonb,timeout_milliseconds:=55000); end if;
end;
$$;
revoke all on function public.mr4u_backup_tick() from public,anon,authenticated;
grant execute on function public.mr4u_backup_tick() to service_role;
select cron.schedule('managerent4u-backup-worker','*/5 * * * *','select public.mr4u_backup_tick();');
notify pgrst, 'reload schema';

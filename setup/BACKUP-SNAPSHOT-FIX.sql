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

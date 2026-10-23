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

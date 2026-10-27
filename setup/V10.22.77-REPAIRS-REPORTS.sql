-- Run after .76 and the existing private document/owner collaboration setup.
begin;
alter table public.bank_connections add column if not exists sync_resume jsonb;
create table if not exists public.maintenance_jobs77 (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),building_id bigint not null references public.buildings(id),unit_id bigint references public.units(id),tenant_id bigint references public.tenants(id),
 title text not null,description text not null default '',category text not null default 'Other',priority text not null default 'normal' check(priority in ('normal','high','urgent')),status text not null default 'new' check(status in ('new','awaiting_approval','scheduled','in_progress','completed','cancelled')),
 contractor_name text not null default '',contractor_email text not null default '',contractor_phone text not null default '',visit_start timestamptz,visit_end timestamptz,
 quote_labor numeric(12,2) not null default 0 check(quote_labor>=0),quote_parts numeric(12,2) not null default 0 check(quote_parts>=0),quote_includes_vat boolean not null default true,approved_budget numeric(12,2),internal_notes text not null default '',shared_with_owner boolean not null default false,
 approval_status text not null default 'not_requested',approval_message text,approved_quote jsonb,revision integer not null default 1,events jsonb not null default '[]',created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz
);
create table if not exists public.maintenance_files77 (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),job_id uuid not null references public.maintenance_jobs77(id),building_id bigint not null references public.buildings(id),kind text not null check(kind in ('photo','quote','attachment')),owner_visible boolean not null default false,file_name text not null,mime_type text not null,bytes integer not null,sha256 text not null,storage_bucket text not null default 'mr4u-documents',storage_object text not null,state text not null default 'pending',created_at timestamptz not null default now(),deleted_at timestamptz
);
create table if not exists public.maintenance_approvals77 (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),job_id uuid not null references public.maintenance_jobs77(id),owner_id bigint not null references public.owners(id),token_hash text not null unique,revision integer not null,expires_at timestamptz not null default now()+interval '14 days',revoked_at timestamptz,decision text check(decision in ('approved','declined')),message text,decided_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.building_reports77 (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),building_id bigint not null references public.buildings(id),owner_id bigint references public.owners(id),period text not null,snapshot jsonb not null,created_by uuid,created_at timestamptz not null default now(),deleted_at timestamptz
);
create index if not exists maintenance_jobs77_property on public.maintenance_jobs77(workspace_id,building_id,deleted_at);
create index if not exists building_reports77_property on public.building_reports77(workspace_id,building_id,created_at);
alter table public.maintenance_jobs77 enable row level security;
alter table public.maintenance_files77 enable row level security;
alter table public.maintenance_approvals77 enable row level security;
alter table public.building_reports77 enable row level security;
revoke all on public.maintenance_jobs77,public.maintenance_files77,public.maintenance_approvals77,public.building_reports77 from anon,authenticated;
grant all on public.maintenance_jobs77,public.maintenance_files77,public.maintenance_approvals77,public.building_reports77 to service_role;

create or replace function public.mr4u_repair_save77(p_workspace uuid,p_id uuid,p_revision integer,p_data jsonb,p_actor uuid) returns public.maintenance_jobs77 language plpgsql security definer set search_path=public,pg_temp as $$
declare r maintenance_jobs77; changed boolean;
begin
 select * into r from maintenance_jobs77 where workspace_id=p_workspace and id=p_id and deleted_at is null for update;
 if not found then
  if p_revision<>0 then raise exception 'Repair not found';end if;
  insert into maintenance_jobs77(id,workspace_id,building_id,created_by,title) values(p_id,p_workspace,(p_data->>'building_id')::bigint,p_actor,p_data->>'title') returning * into r;
 elsif r.revision<>p_revision then raise exception 'This repair changed. Reload before saving';end if;
 if r.building_id<>(p_data->>'building_id')::bigint then raise exception 'A saved repair cannot be moved to another property';end if;
 changed:=r.quote_labor<>(p_data->>'quote_labor')::numeric or r.quote_parts<>(p_data->>'quote_parts')::numeric or r.quote_includes_vat<>(p_data->>'quote_includes_vat')::boolean or r.contractor_name<>p_data->>'contractor_name';
 update maintenance_jobs77 set unit_id=(p_data->>'unit_id')::bigint,tenant_id=(p_data->>'tenant_id')::bigint,title=p_data->>'title',description=p_data->>'description',category=p_data->>'category',priority=p_data->>'priority',status=p_data->>'status',contractor_name=p_data->>'contractor_name',contractor_email=p_data->>'contractor_email',contractor_phone=p_data->>'contractor_phone',visit_start=(p_data->>'visit_start')::timestamptz,visit_end=(p_data->>'visit_end')::timestamptz,quote_labor=(p_data->>'quote_labor')::numeric,quote_parts=(p_data->>'quote_parts')::numeric,quote_includes_vat=(p_data->>'quote_includes_vat')::boolean,approved_budget=(p_data->>'approved_budget')::numeric,internal_notes=p_data->>'internal_notes',shared_with_owner=(p_data->>'shared_with_owner')::boolean,
 approval_status='not_requested',approved_quote=null,
 revision=r.revision+1,updated_at=now(),events=r.events||jsonb_build_array(jsonb_build_object('type',case when p_revision=0 then 'Repair created' else 'Repair updated' end,'at',now(),'actor',p_actor,'previous_approved_quote',r.approved_quote)) where id=p_id returning * into r;
 update maintenance_approvals77 set revoked_at=now() where job_id=p_id and revoked_at is null;
 if r.approval_status='pending' then update maintenance_jobs77 set approval_status='not_requested' where id=p_id returning * into r;end if;
 return r;
end;$$;
create or replace function public.mr4u_repair_request77(p_workspace uuid,p_job uuid,p_revision integer,p_owner bigint,p_hash text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r maintenance_jobs77; key_id uuid;
begin
 select * into r from maintenance_jobs77 where id=p_job and workspace_id=p_workspace and deleted_at is null for update;
 if not found or not r.shared_with_owner or r.revision<>p_revision or r.status in ('completed','cancelled') then raise exception 'Reload this shared repair before requesting approval';end if;
 if not exists(select 1 from buildings where id=r.building_id and workspace_id=p_workspace and owner_id=p_owner) then raise exception 'The property owner changed';end if;
 select id into key_id from maintenance_approvals77 where job_id=p_job and token_hash=p_hash and revision=r.revision and revoked_at is null and expires_at>now();
 if key_id is not null then return key_id;end if;
 update maintenance_approvals77 set revoked_at=now() where job_id=p_job and revoked_at is null;
 insert into maintenance_approvals77(workspace_id,job_id,owner_id,token_hash,revision) values(p_workspace,p_job,p_owner,p_hash,r.revision) returning id into key_id;
 update maintenance_jobs77 set approval_status='pending',status='awaiting_approval',events=events||jsonb_build_array(jsonb_build_object('type','Approval requested','at',now())),updated_at=now() where id=p_job;
 return key_id;
end;$$;
create or replace function public.mr4u_repair_decide77(p_hash text,p_revision integer,p_choice text,p_message text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a maintenance_approvals77;r maintenance_jobs77;
begin
 -- Always lock the job before its link, matching management save/request lock order.
 select * into a from maintenance_approvals77 where token_hash=p_hash;
 if not found then raise exception 'Approval link unavailable';end if;
 select * into r from maintenance_jobs77 where id=a.job_id for update;
 select * into a from maintenance_approvals77 where id=a.id for update;
 if a.revoked_at is not null or a.expires_at<now() or r.deleted_at is not null or not r.shared_with_owner or r.revision<>a.revision or p_revision<>a.revision or not exists(select 1 from workspaces where id=r.workspace_id and status='active') or not exists(select 1 from buildings where id=r.building_id and workspace_id=r.workspace_id and owner_id=a.owner_id) then raise exception 'This quote changed or the approval link expired. Ask management for a new link';end if;
 if p_choice not in ('approved','declined') or p_choice is null then raise exception 'Choose approve or decline';end if;
 if a.decision is not null then
  if a.decision<>p_choice then raise exception 'A decision is already saved';end if;
  return jsonb_build_object('ok',true,'already_recorded',true,'decision',a.decision);
 end if;
 update maintenance_approvals77 set decision=p_choice,message=left(p_message,3000),decided_at=now() where id=a.id;
 update maintenance_jobs77 set approval_status=p_choice,approval_message=left(p_message,3000),approved_quote=case when p_choice='approved' then jsonb_build_object('labor',r.quote_labor,'parts',r.quote_parts,'includes_vat',r.quote_includes_vat,'contractor',r.contractor_name,'revision',r.revision,'at',now()) else null end,events=events||jsonb_build_array(jsonb_build_object('type',case when p_choice='approved' then 'Quote approved through owner link' else 'Quote declined through owner link' end,'at',now())),updated_at=now() where id=r.id;
 return jsonb_build_object('ok',true,'decision',p_choice);
end;$$;
revoke all on function public.mr4u_repair_save77(uuid,uuid,integer,jsonb,uuid),public.mr4u_repair_request77(uuid,uuid,integer,bigint,text),public.mr4u_repair_decide77(text,integer,text,text) from public,anon,authenticated;
grant execute on function public.mr4u_repair_save77(uuid,uuid,integer,jsonb,uuid),public.mr4u_repair_request77(uuid,uuid,integer,bigint,text),public.mr4u_repair_decide77(text,integer,text,text) to service_role;
alter table public.bank_connections add column if not exists bank_sync_lease_until timestamptz;
alter table public.bank_connections add column if not exists bank_sync_lease_token uuid;
create or replace function public.mr4u_bank_claim77(p_workspace uuid,p_connection bigint) returns setof public.bank_connections language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query update public.bank_connections set bank_sync_lease_until=now()+interval '2 minutes',bank_sync_lease_token=gen_random_uuid() where workspace_id=p_workspace and id=p_connection and (bank_sync_lease_until is null or bank_sync_lease_until<now()) returning *;
end;$$;
revoke all on function public.mr4u_bank_claim77(uuid,bigint) from public,anon,authenticated;
grant execute on function public.mr4u_bank_claim77(uuid,bigint) to service_role;
alter table public.owner_messages add column if not exists attachments77 jsonb not null default '[]';
create or replace function public.mr4u_repair_file_state77(p_workspace uuid,p_file uuid,p_delete boolean,p_visible boolean default null) returns public.maintenance_files77 language plpgsql security definer set search_path=public,pg_temp as $$
declare d maintenance_files77;r maintenance_jobs77;
begin
 select * into d from maintenance_files77 where id=p_file and workspace_id=p_workspace and deleted_at is null;
 if not found then raise exception 'File unavailable';end if;
 select * into r from maintenance_jobs77 where id=d.job_id and deleted_at is null for update;
 select * into d from maintenance_files77 where id=p_file and workspace_id=p_workspace and deleted_at is null for update;
 if not found then raise exception 'File unavailable';end if;
 if r.id is null or ((d.owner_visible or coalesce(p_visible,false)) and r.approval_status in ('pending','approved')) then raise exception 'Edit repair before changing shared documents after requesting approval';end if;
 update maintenance_files77 set owner_visible=coalesce(p_visible,owner_visible),state=case when p_delete or p_visible is not null then state else 'ready' end,deleted_at=case when p_delete then now() else null end where id=p_file returning * into d;
 return d;
end;$$;
create or replace function public.mr4u_repair_event77(p_workspace uuid,p_job uuid,p_event jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update maintenance_jobs77 set events=events||jsonb_build_array(p_event),updated_at=now() where id=p_job and workspace_id=p_workspace and deleted_at is null and not exists(select 1 from jsonb_array_elements(events) x where x->>'provider_id'=p_event->>'provider_id');return found;
end;$$;
revoke all on function public.mr4u_repair_file_state77(uuid,uuid,boolean,boolean),public.mr4u_repair_event77(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mr4u_repair_file_state77(uuid,uuid,boolean,boolean),public.mr4u_repair_event77(uuid,uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';

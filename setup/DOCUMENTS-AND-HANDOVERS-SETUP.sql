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

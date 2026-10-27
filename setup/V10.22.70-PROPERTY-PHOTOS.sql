-- Run once in Supabase > SQL Editor > New query. Photos use the existing private document bucket.
begin;
create table if not exists public.property_photos (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 building_id bigint not null references public.buildings(id) on delete cascade,
 mime_type text not null check (mime_type in ('image/jpeg','image/png')),
 bytes integer not null check (bytes between 1 and 5242880),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 storage_bucket text not null default 'mr4u-documents', storage_object text not null unique,
 state text not null default 'pending' check(state in ('pending','ready')),
 active boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), completed_at timestamptz,
 check(not active or state='ready')
);
create unique index if not exists property_photos_one_active on public.property_photos(workspace_id,building_id) where active;
alter table public.property_photos enable row level security;
revoke all on public.property_photos from public,anon,authenticated;
grant all on public.property_photos to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mr4u-documents','mr4u-documents',false,26214400,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create or replace function public.mr4u_activate_property_photo(p_workspace uuid,p_building bigint,p_photo uuid)
returns setof public.property_photos language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text || ':' || p_building::text,0));
 if not exists(select 1 from public.buildings where id=p_building and workspace_id=p_workspace) then raise exception 'Property not found'; end if;
 if not exists(select 1 from public.property_photos where id=p_photo and workspace_id=p_workspace and building_id=p_building and state='pending') then raise exception 'Photo is no longer pending'; end if;
 update public.property_photos set active=false where workspace_id=p_workspace and building_id=p_building and active;
 return query update public.property_photos set active=true,state='ready',completed_at=now() where id=p_photo and workspace_id=p_workspace and building_id=p_building returning *;
end $$;
revoke all on function public.mr4u_activate_property_photo(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.mr4u_activate_property_photo(uuid,bigint,uuid) to service_role;
commit;

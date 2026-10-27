-- Per-owner communication, internal tasks and shared owner tasks.
begin;
create table if not exists public.owner_tasks(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,owner_id bigint not null,
 title text not null,description text not null default '',visibility text not null default 'internal' check(visibility in ('internal','shared')),
 assignee text not null default 'management' check(assignee in ('management','owner','together')),
 status text not null default 'todo' check(status in ('todo','in_progress','done')),due_date date,created_by uuid,
 notification_status text not null default 'not_sent',notification_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists owner_tasks_profile on public.owner_tasks(workspace_id,owner_id,created_at);
create table if not exists public.owner_messages(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,owner_id bigint not null,
 direction text not null check(direction in ('outgoing','incoming')),subject text not null default 'Property management',body text not null,
 sender_name text,sender_email text,status text not null default 'saved',tracking_token text unique,received_email_id text unique,
 provider_email_id text,error text,created_by uuid,created_at timestamptz not null default now());
create index if not exists owner_messages_profile on public.owner_messages(workspace_id,owner_id,created_at);
create table if not exists public.owner_collaboration_links(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,owner_id bigint not null,token text not null unique,
 revoked_at timestamptz,created_at timestamptz not null default now());
alter table public.owner_tasks enable row level security;
alter table public.owner_messages enable row level security;
alter table public.owner_collaboration_links enable row level security;
revoke all on public.owner_tasks,public.owner_messages,public.owner_collaboration_links from anon,authenticated;
grant all on public.owner_tasks,public.owner_messages,public.owner_collaboration_links to service_role;
commit;
notify pgrst,'reload schema';

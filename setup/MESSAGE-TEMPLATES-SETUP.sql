-- Run once in Supabase SQL Editor after your existing workspace setup.
begin;
create table if not exists public.message_templates (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 category text not null check(length(trim(category)) between 1 and 80),
 language text not null default 'en' check(language in ('en','fr','nl')),
 builtin_key text check(builtin_key in ('custom','rent_reminder','late_reminder','indexation','payment_details')),
 subject text not null default '' check(length(subject)<=300),
 body text not null check(length(trim(body)) between 1 and 30000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists message_templates_name on public.message_templates(workspace_id,lower(name),language);
create unique index if not exists message_templates_builtin on public.message_templates(workspace_id,builtin_key,language) where builtin_key is not null;
alter table public.message_templates enable row level security;
revoke all on public.message_templates from public,anon,authenticated;
grant all on public.message_templates to service_role;

-- Preserve the actual recipients on drafts, resends and recurring messages.
alter table public.tenant_messages add column if not exists to_recipients jsonb not null default '[]';
alter table public.tenant_messages add column if not exists cc_recipients jsonb not null default '[]';
alter table public.tenant_reminders add column if not exists to_recipients jsonb not null default '[]';
alter table public.tenant_reminders add column if not exists cc_recipients jsonb not null default '[]';
alter table public.owner_messages add column if not exists to_recipients jsonb not null default '[]';
alter table public.owner_messages add column if not exists cc_recipients jsonb not null default '[]';
commit;
notify pgrst,'reload schema';

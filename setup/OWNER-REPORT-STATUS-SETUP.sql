-- Run once after OWNER-COLLABORATION-SETUP.sql and OWNER-RENT-REPORTS-SETUP.sql.
-- Adds report activity tracking; existing messages, payments and reports are retained.
begin;
alter table public.owner_rent_reports add column if not exists email_opened_at timestamptz;
alter table public.owner_rent_reports add column if not exists report_viewed_at timestamptz;
alter table public.owner_rent_reports add column if not exists replied_at timestamptz;
alter table public.owner_messages add column if not exists report_id uuid;
create index if not exists owner_messages_report on public.owner_messages(workspace_id,owner_id,report_id);
create unique index if not exists owner_report_outgoing_message on public.owner_messages(report_id) where report_id is not null and direction='outgoing';
create index if not exists owner_reports_provider on public.owner_rent_reports(provider_id) where provider_id is not null;
commit;
notify pgrst,'reload schema';

-- Run once in the Supabase SQL Editor before using the new account controls.
-- Keeps original bank metadata and all saved payments / transactions.
begin;
alter table public.bank_accounts add column if not exists nickname text not null default '';
alter table public.bank_accounts add column if not exists selected boolean not null default true;
commit;

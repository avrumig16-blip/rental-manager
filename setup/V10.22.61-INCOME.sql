-- Other income stays separate from the tenant rent ledger. Run as project owner.
create table if not exists public.financial_income_records (
 id uuid primary key, workspace_id uuid not null, bank_transaction_id bigint,
 building_id bigint, owner_id bigint, payer text not null, category text not null default 'Other income',
 amount numeric(14,2) not null check(amount>0), income_date date not null, reference text not null default '', notes text not null default '',
 created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,bank_transaction_id)
);
alter table public.financial_income_records enable row level security;
revoke all on public.financial_income_records from anon,authenticated;
grant all on public.financial_income_records to service_role;
create index if not exists financial_income_workspace_date on public.financial_income_records(workspace_id,income_date);
create or replace function public.mr4u_income_bank_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare tx jsonb; bankid bigint;
begin
 if TG_OP='DELETE' then
  if OLD.bank_transaction_id is not null then
   perform pg_advisory_xact_lock(hashtextextended(OLD.workspace_id::text||'/bank/'||OLD.bank_transaction_id::text,0));
   update public.bank_transactions set match_status='unmatched' where workspace_id=OLD.workspace_id and id=OLD.bank_transaction_id and match_status='ignored';
  end if;return OLD;
 end if;
 if TG_OP='UPDATE' and (NEW.workspace_id is distinct from OLD.workspace_id or NEW.bank_transaction_id is distinct from OLD.bank_transaction_id) then raise exception 'The income source cannot be changed';end if;
 if NEW.bank_transaction_id is not null then
  bankid=NEW.bank_transaction_id;
  perform pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text||'/bank/'||bankid::text,0));
  select to_jsonb(b) into tx from public.bank_transactions b where b.workspace_id=NEW.workspace_id and b.id=bankid for update;
  if tx is null or (tx->>'amount')::numeric<=0 then raise exception 'Incoming bank transaction unavailable';end if;
  if tx->>'match_status'='matched' or exists(select 1 from public.payment_entries e where e.workspace_id=NEW.workspace_id and e.notes like 'Bank transaction #'||bankid::text||' · %') then raise exception 'This bank payment is already posted as rent';end if;
  NEW.amount=(tx->>'amount')::numeric;NEW.income_date=(tx->>'booking_date')::date;
  update public.bank_transactions set match_status='ignored',matched_tenant_id=null,matched_payment_id=null where workspace_id=NEW.workspace_id and id=bankid;
 end if;return NEW;
end $$;
drop trigger if exists mr4u_income_bank_guard on public.financial_income_records;
create trigger mr4u_income_bank_guard before insert or update on public.financial_income_records for each row execute function public.mr4u_income_bank_guard();
-- Deleting a classification restores the original receipt to review.
drop trigger if exists mr4u_income_bank_removed on public.financial_income_records;
create trigger mr4u_income_bank_removed after delete on public.financial_income_records for each row execute function public.mr4u_income_bank_guard();
create or replace function public.mr4u_rent_income_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare bankid bigint;
begin
 bankid=(substring(coalesce(NEW.notes,'') from '^Bank transaction #([0-9]+) · '))::bigint;
 if bankid is not null then
  perform pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text||'/bank/'||bankid::text,0));
  if exists(select 1 from public.financial_income_records r where r.workspace_id=NEW.workspace_id and r.bank_transaction_id=bankid) then raise exception 'This receipt is recorded as other income. Remove that classification before allocating rent.';end if;
 end if;return NEW;
end $$;
drop trigger if exists mr4u_rent_income_guard on public.payment_entries;
create trigger mr4u_rent_income_guard before insert or update on public.payment_entries for each row execute function public.mr4u_rent_income_guard();
create or replace function public.mr4u_income_status_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.match_status is distinct from 'ignored' and exists(select 1 from public.financial_income_records r where r.workspace_id=NEW.workspace_id and r.bank_transaction_id=NEW.id) then raise exception 'This bank receipt is classified as other income';end if;return NEW;
end $$;
drop trigger if exists mr4u_income_status_guard on public.bank_transactions;
create trigger mr4u_income_status_guard before update of match_status on public.bank_transactions for each row execute function public.mr4u_income_status_guard();
revoke all on function public.mr4u_income_bank_guard(),public.mr4u_rent_income_guard(),public.mr4u_income_status_guard() from public,anon,authenticated;
notify pgrst,'reload schema';

-- Run after the owner collaboration, rent reports and report status setup scripts.
begin;
alter table public.owner_rent_report_preferences add column if not exists followup_enabled boolean not null default false;
alter table public.owner_rent_report_preferences add column if not exists followup_days integer not null default 5 check(followup_days between 1 and 365);
alter table public.owner_rent_report_preferences add column if not exists completion_enabled boolean not null default true;
alter table public.owner_rent_reports add column if not exists deleted_at timestamptz;
alter table public.owner_rent_reports add column if not exists report_kind text not null default 'overview';
alter table public.owner_messages add column if not exists deleted_at timestamptz;
alter table public.owner_messages add column if not exists parent_id uuid;
alter table public.owner_messages add column if not exists context_report_id uuid;
create table if not exists public.owner_rent_report_cycles(
 workspace_id uuid not null,owner_id bigint not null,period text not null,source_report_id uuid not null,
 active boolean not null default true,last_contact_at timestamptz not null,next_check_at timestamptz not null default now(),
 lease_until timestamptz,followup_sequence integer not null default 0,completion_report_id uuid,completed_at timestamptz,error text,
 primary key(workspace_id,owner_id,period));
alter table public.owner_rent_report_cycles enable row level security;
revoke all on public.owner_rent_report_cycles from anon,authenticated;
grant all on public.owner_rent_report_cycles to service_role;
create or replace function public.mr4u_owner_cycle_claim(p_workspace uuid,p_owner bigint,p_period text) returns setof public.owner_rent_report_cycles language sql security definer set search_path=public,pg_temp as $$
 update owner_rent_report_cycles set lease_until=now()+interval '5 minutes' where workspace_id=p_workspace and owner_id=p_owner and period=p_period and active and next_check_at<=now() and (lease_until is null or lease_until<now()) returning *;
$$;
create or replace function public.mr4u_owner_report_claim(p_id uuid) returns setof public.owner_rent_reports language sql security definer set search_path=public,pg_temp as $$
 update owner_rent_reports set state='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) where id=p_id and deleted_at is null and state in ('queued','failed','sending') and attempts<5 and (lease_until is null or lease_until<now()) returning *;
$$;
create or replace function public.mr4u_owner_report_delete(p_workspace uuid,p_owner bigint,p_report uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r owner_rent_reports;
begin
 select * into r from owner_rent_reports where id=p_report and workspace_id=p_workspace and owner_id=p_owner for update;
 if not found then raise exception 'Report not found for this owner';end if;
 if r.state='sending' and r.lease_until>now() then raise exception 'This report is being sent. Wait a moment and try again';end if;
 update owner_rent_reports set deleted_at=coalesce(deleted_at,now()),state='cancelled',lease_until=null where id=r.id;
 if not exists(select 1 from owner_rent_reports where workspace_id=p_workspace and owner_id=p_owner and period=r.period and deleted_at is null) then update owner_rent_report_cycles set active=false,lease_until=null where workspace_id=p_workspace and owner_id=p_owner and period=r.period;end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.mr4u_owner_cycle_claim(uuid,bigint,text),public.mr4u_owner_report_delete(uuid,bigint,uuid),public.mr4u_owner_report_claim(uuid) from public,anon,authenticated;
grant execute on function public.mr4u_owner_cycle_claim(uuid,bigint,text),public.mr4u_owner_report_delete(uuid,bigint,uuid),public.mr4u_owner_report_claim(uuid) to service_role;
create or replace function public.mr4u_owner_report_answer(p_report uuid,p_payment bigint,p_due numeric,p_date date,p_choice text,p_amount numeric default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r owner_rent_reports;p payments;old owner_rent_report_answers;e payment_entries;paid numeric;missing numeric;st text;
begin
 select * into r from owner_rent_reports where id=p_report and deleted_at is null for update;
 if not found or not exists(select 1 from jsonb_array_elements(r.snapshot->'rows') x where x->>'payment_id'=p_payment::text and coalesce((x->>'confirmable')::boolean,false)) then raise exception 'This account cannot be confirmed in this owner report';end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-confirm:'||p_payment::text,0));
 select * into p from payments where id=p_payment and workspace_id=r.workspace_id for update;
 if not found or p.year::text||'-'||lpad(p.month::text,2,'0')<>r.period then raise exception 'Monthly account does not belong to this report';end if;
 select * into old from owner_rent_report_answers where report_id=p_report and payment_id=p_payment;
 if old.choice='paid' then return jsonb_build_object('ok',true,'already_recorded',true);end if;
 if p_choice not in ('paid','unpaid') then raise exception 'Choose paid or not paid';end if;
 if p_choice='unpaid' then insert into owner_rent_report_answers(report_id,payment_id,choice) values(p_report,p_payment,'unpaid') on conflict(report_id,payment_id) do update set choice='unpaid',answered_at=now();return jsonb_build_object('ok',true,'choice','unpaid');end if;
 if p_due<0 or p_due>100000000 or p_date is null or p_date>(now() at time zone 'Europe/Brussels')::date then raise exception 'Choose a valid received date and amount';end if;
 select coalesce(sum(amount),0) into paid from payment_entries where payment_id=p_payment and workspace_id=r.workspace_id;
 if p_amount is not null and (p_amount<=0 or p_amount>100000000 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity')) then raise exception 'Enter a positive payment amount with at most two decimals';end if;
 missing:=case when p_amount is null then round(greatest(0,p_due-paid),2) else p_amount end;
 if missing>0 then insert into payment_entries(workspace_id,payment_id,amount,payment_date,method,reference,notes) values(r.workspace_id,p_payment,missing,p_date,'owner_confirmation','Owner rent report '||r.period,'Confirmed by owner via report '||r.id) returning * into e;paid:=paid+missing;end if;
 st:=case when paid>=p_due-0.005 then 'paid' when paid>0 then 'partial' else 'unpaid' end;
 update payments set paid_amount=paid,status=st where id=p_payment and workspace_id=r.workspace_id;
 insert into owner_rent_report_answers(report_id,payment_id,choice,entry_id) values(p_report,p_payment,'paid',e.id) on conflict(report_id,payment_id) do update set choice='paid',entry_id=excluded.entry_id,answered_at=now();
 return jsonb_build_object('ok',true,'choice','paid','entry',case when e.id is null then null else to_jsonb(e) end,'recorded_amount',missing);
end; $$;

revoke all on function public.mr4u_owner_report_answer(uuid,bigint,numeric,date,text,numeric) from public,anon,authenticated;
grant execute on function public.mr4u_owner_report_answer(uuid,bigint,numeric,date,text,numeric) to service_role;
notify pgrst,'reload schema';

-- Owner rent bank details, reused by contracts and tenant messages.
alter table public.owner_bank_accounts add column if not exists account_holder text;
alter table public.owner_bank_accounts add column if not exists bic text;
create or replace function public.mr4u_owner_bank_save(p_workspace uuid,p_owner bigint,p_id bigint,p_label text,p_holder text,p_iban text,p_bic text,p_default boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||':owner-bank:'||p_owner::text,0));
 if not exists(select 1 from public.owners where id=p_owner and workspace_id=p_workspace) then raise exception 'Owner not found'; end if;
 if p_id is not null and not exists(select 1 from public.owner_bank_accounts where id=p_id and owner_id=p_owner and workspace_id=p_workspace) then raise exception 'Bank account not found for this owner'; end if;
 if p_default then update public.owner_bank_accounts set is_default=false where owner_id=p_owner and workspace_id=p_workspace; end if;
 if p_id is null then
 insert into public.owner_bank_accounts(workspace_id,owner_id,label,account_holder,iban,bic,is_default) values(p_workspace,p_owner,p_label,p_holder,p_iban,p_bic,p_default);
 else
 update public.owner_bank_accounts set label=p_label,account_holder=p_holder,iban=p_iban,bic=p_bic,is_default=p_default where id=p_id and owner_id=p_owner and workspace_id=p_workspace;
 end if;
end $$;
revoke all on function public.mr4u_owner_bank_save(uuid,bigint,bigint,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.mr4u_owner_bank_save(uuid,bigint,bigint,text,text,text,text,boolean) to service_role;

commit;

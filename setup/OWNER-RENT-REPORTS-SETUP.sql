-- Run after OWNER-COLLABORATION-SETUP.sql and STATEMENTS-SETUP.sql.
begin;
create table if not exists public.owner_rent_report_preferences(workspace_id uuid not null,owner_id bigint not null,enabled boolean not null default false,send_day int not null default 5 check(send_day between 1 and 31),next_run_at timestamptz,primary key(workspace_id,owner_id));
create table if not exists public.owner_rent_reports(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,owner_id bigint not null,period text not null,delivery_key text not null default 'monthly',snapshot jsonb not null,state text not null default 'queued',lease_until timestamptz,first_attempt_at timestamptz,attempts int not null default 0,provider_id text,error text,created_at timestamptz not null default now(),sent_at timestamptz,unique(workspace_id,owner_id,period,delivery_key));
create table if not exists public.owner_rent_report_answers(report_id uuid not null,payment_id bigint not null,choice text not null,entry_id bigint,answered_at timestamptz not null default now(),primary key(report_id,payment_id));
alter table public.owner_rent_reports add column if not exists email_opened_at timestamptz;
alter table public.owner_rent_reports add column if not exists report_viewed_at timestamptz;
alter table public.owner_rent_reports add column if not exists replied_at timestamptz;
alter table public.owner_messages add column if not exists report_id uuid;
create index if not exists owner_messages_report on public.owner_messages(workspace_id,owner_id,report_id);
create unique index if not exists owner_report_outgoing_message on public.owner_messages(report_id) where report_id is not null and direction='outgoing';
create index if not exists owner_reports_provider on public.owner_rent_reports(provider_id) where provider_id is not null;
alter table public.owner_rent_report_preferences enable row level security;
alter table public.owner_rent_reports enable row level security;
alter table public.owner_rent_report_answers enable row level security;
revoke all on public.owner_rent_report_preferences,public.owner_rent_reports,public.owner_rent_report_answers from anon,authenticated;
grant all on public.owner_rent_report_preferences,public.owner_rent_reports,public.owner_rent_report_answers to service_role;
create or replace function public.mr4u_owner_month_account(p_workspace uuid,p_tenant bigint,p_year int,p_month int,p_expected numeric) returns setof public.payments language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_year<>extract(year from now() at time zone 'Europe/Brussels')::int or p_month<>extract(month from now() at time zone 'Europe/Brussels')::int or p_expected<0 or p_expected>100000000 then raise exception 'Only a valid current monthly account can be created';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||':'||p_tenant::text||':'||p_year::text||'-'||p_month::text,0));
 if not exists(select 1 from payments where workspace_id=p_workspace and tenant_id=p_tenant and year=p_year and month=p_month) then insert into payments(workspace_id,tenant_id,year,month,expected_amount,paid_amount,status) values(p_workspace,p_tenant,p_year,p_month,p_expected,0,'pending');end if;
 return query select * from payments where workspace_id=p_workspace and tenant_id=p_tenant and year=p_year and month=p_month order by id limit 1;
end; $$;
revoke all on function public.mr4u_owner_month_account(uuid,bigint,int,int,numeric) from public,anon,authenticated;
grant execute on function public.mr4u_owner_month_account(uuid,bigint,int,int,numeric) to service_role;
create or replace function public.mr4u_owner_report_claim(p_id uuid) returns setof public.owner_rent_reports language sql security definer set search_path=public,pg_temp as $$
 update owner_rent_reports set state='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) where id=p_id and state in ('queued','failed','sending') and attempts<5 and (lease_until is null or lease_until<now()) returning *;
$$;
drop function if exists public.mr4u_owner_report_answer(uuid,bigint,numeric,date,text);
create or replace function public.mr4u_owner_report_answer(p_report uuid,p_payment bigint,p_due numeric,p_date date,p_choice text,p_amount numeric default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r owner_rent_reports;p payments;old owner_rent_report_answers;e payment_entries;paid numeric;missing numeric;st text;
begin
 select * into r from owner_rent_reports where id=p_report;
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
revoke all on function public.mr4u_owner_report_claim(uuid),public.mr4u_owner_report_answer(uuid,bigint,numeric,date,text,numeric) from public,anon,authenticated;
grant execute on function public.mr4u_owner_report_claim(uuid),public.mr4u_owner_report_answer(uuid,bigint,numeric,date,text,numeric) to service_role;
commit;
notify pgrst,'reload schema';

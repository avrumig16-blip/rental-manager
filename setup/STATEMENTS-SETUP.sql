-- Run once in Supabase SQL editor as project owner. Does not alter existing balances.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
alter table public.payments add column if not exists is_historical boolean not null default false;
create table if not exists public.mr4u_payment_receipts (
 id uuid primary key default gen_random_uuid(), workspace_id text not null, tenant_id text not null,
 entry_id text not null, payment_id text not null, message_id text,
 state text not null default 'queued' check(state in ('queued','sending','sent','failed','uncertain','cancelled')),
 payload jsonb, created_at timestamptz not null default now(), sent_at timestamptz, provider_id text,
 lease_until timestamptz, retry_at timestamptz, first_attempt_at timestamptz,
 attempts integer not null default 0, error text,
 unique(workspace_id,entry_id)
);
alter table public.mr4u_payment_receipts enable row level security;
revoke all on public.mr4u_payment_receipts from anon,authenticated;
grant all on public.mr4u_payment_receipts to service_role;
create table if not exists public.mr4u_receipt_worker_config(id boolean primary key default true check(id),url text not null,secret text not null);
alter table public.mr4u_receipt_worker_config enable row level security;
revoke all on public.mr4u_receipt_worker_config from anon,authenticated;
grant all on public.mr4u_receipt_worker_config to service_role;

create or replace function public.mr4u_receipt_claim(p_id uuid) returns setof public.mr4u_payment_receipts
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query update public.mr4u_payment_receipts set state='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1
 where id=p_id and state in ('queued','failed','sending') and attempts<6
 and (lease_until is null or lease_until<now()) and (retry_at is null or retry_at<=now()) returning *;
end;
$$;
revoke all on function public.mr4u_receipt_claim(uuid) from public,anon,authenticated;
grant execute on function public.mr4u_receipt_claim(uuid) to service_role;

create or replace function public.mr4u_historical_accounts(p_workspace text,p_tenant text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tenants%rowtype; p public.payments%rowtype; e public.payment_entries%rowtype;
 r jsonb; yr integer; mo integer; due numeric; paid numeric; pd date; month_key text;
 ps jsonb:='[]'; es jsonb:='[]'; seen text[]:='{}';
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>120 then raise exception 'Add between 1 and 120 historical months'; end if;
 select * into t from public.tenants where id::text=p_tenant and workspace_id::text=p_workspace;
 if not found then raise exception 'Tenant not found in this account'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  yr:=(r->>'year')::integer; mo:=(r->>'month')::integer;due:=round((r->>'due')::numeric,2);paid:=round((r->>'paid')::numeric,2);
  if yr is null or mo is null or yr<1900 or mo<1 or mo>12 or make_date(yr,mo,1)>=date_trunc('month',now() at time zone 'Europe/Brussels')::date then raise exception 'Choose a month before the current month'; end if;
  if due is null or paid is null or due<0 or paid<0 or due>100000000 or paid>100000000 then raise exception 'Enter valid amounts due and paid'; end if;
  pd:=nullif(r->>'payment_date','')::date;
  if paid>0 and (pd is null or pd>(now() at time zone 'Europe/Brussels')::date) then raise exception 'Add the actual past payment date'; end if;
  month_key:=yr::text||'-'||mo::text;
  if month_key=any(seen) then raise exception 'A month is listed twice'; end if; seen:=array_append(seen,month_key);
  perform pg_advisory_xact_lock(hashtextextended(p_workspace||'/'||p_tenant||'/'||month_key,0));
  if exists(select 1 from public.payments where tenant_id=t.id and workspace_id=t.workspace_id and year=yr and month=mo) then raise exception 'This month already exists. Open it to record or edit its payments'; end if;
  insert into public.payments(workspace_id,tenant_id,year,month,expected_amount,paid_amount,status,is_historical)
  values(t.workspace_id,t.id,yr,mo,due,paid,case when paid>=due then 'paid' when paid>0 then 'partial' else 'pending' end,true) returning * into p;
  ps:=ps||jsonb_build_array(to_jsonb(p));
  if paid>0 then
   insert into public.payment_entries(workspace_id,payment_id,amount,payment_date,method,reference,notes)
   values(t.workspace_id,p.id,paid,pd,coalesce(nullif(r->>'method',''),'bank'),'Historical payment','Historical payment recorded from prior records') returning * into e;
   es:=es||jsonb_build_array(to_jsonb(e));
  end if;
 end loop;
 return jsonb_build_object('ok',true,'payments',ps,'entries',es);
end;
$$;
revoke all on function public.mr4u_historical_accounts(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mr4u_historical_accounts(text,text,jsonb) to service_role;

create or replace function public.mr4u_receipt_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.mr4u_receipt_worker_config;
begin
 select * into cfg from public.mr4u_receipt_worker_config where id=true;
 if found then perform net.http_post(url:=cfg.url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cfg.secret),body:='{}'::jsonb,timeout_milliseconds:=55000); end if;
end;
$$;
revoke all on function public.mr4u_receipt_tick() from public,anon,authenticated;
grant execute on function public.mr4u_receipt_tick() to service_role;
select cron.schedule('managerent4u-payment-thanks','*/5 * * * *','select public.mr4u_receipt_tick();');
notify pgrst, 'reload schema';

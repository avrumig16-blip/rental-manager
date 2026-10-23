-- Run once as project owner. Adds atomic, retry-safe manual payments. No existing balances changed.
create table if not exists public.mr4u_manual_payment_requests (
 workspace_id text not null, request_id uuid not null, tenant_id text not null,
 fingerprint text not null, entry_ids text[] not null, created_at timestamptz not null default now(),
 primary key(workspace_id,request_id)
);
alter table public.mr4u_manual_payment_requests enable row level security;
revoke all on public.mr4u_manual_payment_requests from public,anon,authenticated;
grant all on public.mr4u_manual_payment_requests to service_role;
create or replace function public.mr4u_manual_payment_post(p_workspace text,p_tenant text,p_request uuid,p_fingerprint text,p_date date,p_method text,p_reference text,p_notes text,p_allocations jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tenants%rowtype; p public.payments%rowtype; e public.payment_entries%rowtype; req public.mr4u_manual_payment_requests%rowtype;
 r jsonb; es jsonb:='[]'; ps jsonb:='[]'; ids text[]:='{}'; seen text[]:='{}'; key text; amt numeric; yr integer; mo integer; expected numeric; paid numeric; due numeric;
begin
 if p_request is null or length(coalesce(p_fingerprint,''))<>64 then raise exception 'Invalid payment request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace||'/manual/'||p_request::text,0));
 select * into req from public.mr4u_manual_payment_requests where workspace_id=p_workspace and request_id=p_request;
 if found then
  if req.tenant_id<>p_tenant or req.fingerprint<>p_fingerprint then raise exception 'Payment request already used with different details. Refresh and review payments before recording another.'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into es from public.payment_entries x where x.workspace_id::text=p_workspace and x.id::text=any(req.entry_ids);
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into ps from public.payments x where x.workspace_id::text=p_workspace and x.id in (select payment_id from public.payment_entries where workspace_id::text=p_workspace and id::text=any(req.entry_ids));
  return jsonb_build_object('ok',true,'already_posted',true,'entries',es,'payments',ps);
 end if;
 select * into t from public.tenants where id::text=p_tenant and workspace_id::text=p_workspace for update;
 if not found then raise exception 'Tenant not found in this account'; end if;
 if p_allocations is null or jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)<1 or jsonb_array_length(p_allocations)>24 then raise exception 'Select between 1 and 24 months'; end if;
 if p_date is null or p_date>(now() at time zone 'Europe/Brussels')::date or p_date<date '1900-01-01' then raise exception 'Enter the actual payment date'; end if;
 if p_method not in ('bank','cash','manual','other') then raise exception 'Choose a payment method'; end if;
 for r in select value from jsonb_array_elements(p_allocations) loop
  amt:=(r->>'amount')::numeric;
  if amt is null or amt<=0 or amt>100000000 or amt<>round(amt,2) then raise exception 'Enter a positive amount with at most two decimals'; end if;
  if coalesce(r->>'payment_id','')<>'' then
   select * into p from public.payments where workspace_id=t.workspace_id and tenant_id=t.id and id::text=r->>'payment_id' for update;
   if not found then raise exception 'Monthly account does not belong to this tenant'; end if;
  else
   yr:=(r->>'year')::integer; mo:=(r->>'month')::integer; expected:=(r->>'expected_amount')::numeric;
   if yr is null or mo is null or yr<1900 or yr>2200 or mo<1 or mo>12 or expected is null or expected<0 or expected>100000000 then raise exception 'Invalid monthly account'; end if;
   if make_date(yr,mo,1)<>date_trunc('month',now() at time zone 'Europe/Brussels')::date then raise exception 'Add past months through Historical months before recording a payment'; end if;
   select * into p from public.payments where workspace_id=t.workspace_id and tenant_id=t.id and year=yr and month=mo for update;
   if not found then insert into public.payments(workspace_id,tenant_id,year,month,expected_amount,paid_amount,status) values(t.workspace_id,t.id,yr,mo,expected,0,'pending') returning * into p; end if;
  end if;
  key:=p.id::text; if key=any(seen) then raise exception 'A monthly account is listed twice'; end if; seen:=array_append(seen,key);
  insert into public.payment_entries(workspace_id,payment_id,amount,payment_date,method,reference,notes)
  values(t.workspace_id,p.id,amt,p_date,p_method,left(coalesce(p_reference,''),500),left(coalesce(p_notes,''),1000)) returning * into e;
  ids:=array_append(ids,e.id::text); es:=es||jsonb_build_array(to_jsonb(e));
  select coalesce(sum(amount),0) into paid from public.payment_entries where workspace_id=t.workspace_id and payment_id=p.id;
  select greatest(0,p.expected_amount+coalesce(sum(case when adjustment_type='charge' then amount else -amount end),0)) into due from public.tenant_adjustments where workspace_id=t.workspace_id and payment_id=p.id and coalesce(status,'approved')<>'rejected';
  update public.payments set paid_amount=paid,status=case when paid>=due-0.005 then 'paid' when paid>0 then 'partial' else 'pending' end where id=p.id and workspace_id=t.workspace_id returning * into p;
  ps:=ps||jsonb_build_array(to_jsonb(p));
 end loop;
 insert into public.mr4u_manual_payment_requests(workspace_id,request_id,tenant_id,fingerprint,entry_ids) values(p_workspace,p_request,p_tenant,p_fingerprint,ids);
 return jsonb_build_object('ok',true,'already_posted',false,'payments',ps,'entries',es);
end;
$$;
revoke all on function public.mr4u_manual_payment_post(text,text,uuid,text,date,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mr4u_manual_payment_post(text,text,uuid,text,date,text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';

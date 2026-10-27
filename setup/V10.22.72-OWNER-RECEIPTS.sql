-- Run once after the existing OWNER-FOLLOWUPS-SETUP.sql. Existing payments are unchanged.
-- Keep method='owner_confirmation' so bank matching continues to prevent double posting.
alter table public.payment_entries add column if not exists owner_report_method text;
create or replace function public.mr4u_owner_report_answer_details(p_report uuid,p_payment bigint,p_due numeric,p_date date,p_choice text,p_amount numeric,p_method text,p_reference text,p_expected_balance numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r owner_rent_reports; p payments; a owner_rent_report_answers; e payment_entries; result_json jsonb; paid numeric;
begin
 select * into r from owner_rent_reports where id=p_report and deleted_at is null for update;
 if not found then raise exception 'Owner report unavailable'; end if;
 select * into p from payments where id=p_payment and workspace_id=r.workspace_id for update;
 if not found then raise exception 'Monthly account unavailable'; end if;
 select * into a from owner_rent_report_answers where report_id=p_report and payment_id=p_payment;
 if a.choice='paid' then
  select * into e from payment_entries where id=a.entry_id and workspace_id=r.workspace_id;
  return jsonb_build_object('ok',true,'already_recorded',true,'entry',case when e.id is null then null else to_jsonb(e) end);
 end if;
 if p_choice='paid' then
  if p_method is null or p_method not in ('bank','cash','other') then raise exception 'Choose a payment method'; end if;
  if length(coalesce(p_reference,''))>500 then raise exception 'Payment reference is too long'; end if;
  if p_date is null or p_date<date '1900-01-01' or p_date>(now() at time zone 'Europe/Brussels')::date then raise exception 'Choose the actual received date'; end if;
  select coalesce(sum(amount),0) into paid from payment_entries where payment_id=p_payment and workspace_id=r.workspace_id;
  if p_expected_balance is null or abs(greatest(0,round(p_due-paid,2))-p_expected_balance)>0.005 then raise exception 'The balance changed. Refresh the report and review before confirming.'; end if;
 end if;
 result_json:=public.mr4u_owner_report_answer(p_report,p_payment,p_due,p_date,p_choice,p_amount);
 if p_choice='paid' and result_json->'entry' is not null and result_json->'entry'<>'null'::jsonb then
  update payment_entries set owner_report_method=p_method,reference=coalesce(nullif(trim(p_reference),''),reference)
  where id::text=result_json->'entry'->>'id' and workspace_id=r.workspace_id returning * into e;
  result_json:=jsonb_set(result_json,'{entry}',to_jsonb(e));
 end if;
 return result_json;
end;
$$;
revoke all on function public.mr4u_owner_report_answer_details(uuid,bigint,numeric,date,text,numeric,text,text,numeric) from public,anon,authenticated;
grant execute on function public.mr4u_owner_report_answer_details(uuid,bigint,numeric,date,text,numeric,text,text,numeric) to service_role;
notify pgrst,'reload schema';

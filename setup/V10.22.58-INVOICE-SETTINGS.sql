begin;
alter table public.workspaces add column if not exists date_format text not null default 'DD/MM/YYYY';
alter table public.workspaces add column if not exists invoice_due_days integer not null default 14;
alter table public.billing_invoices add column if not exists payment_due_date date;
alter table public.billing_invoices add column if not exists due_events jsonb not null default '[]';
create or replace function public.mr4u_invoice_due(p_id uuid,p_workspace uuid,p_version integer,p_due date,p_user uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r billing_invoices;old_date date;begin
 select * into r from billing_invoices where id=p_id and workspace_id=p_workspace for update;
 if not found or r.state<>'issued' or r.kind<>'invoice' then raise exception 'Choose an issued invoice';end if;
 if r.version is distinct from p_version then raise exception 'Invoice changed. Refresh first';end if;
 if p_due is null or p_due<(r.snapshot->>'issue_date')::date then raise exception 'Payment deadline must be on or after the issue date';end if;
 old_date:=coalesce(r.payment_due_date,(r.snapshot->>'due_date')::date);
 if old_date=p_due then return to_jsonb(r);end if;
 update billing_invoices set payment_due_date=p_due,due_events=due_events||jsonb_build_array(jsonb_build_object('from',old_date,'to',p_due,'by',p_user,'at',now())),version=version+1 where id=p_id returning * into r;return to_jsonb(r);end $$;
revoke all on function public.mr4u_invoice_due(uuid,uuid,integer,date,uuid) from public,anon,authenticated;
grant execute on function public.mr4u_invoice_due(uuid,uuid,integer,date,uuid) to service_role;
commit;
notify pgrst,'reload schema';

-- Detailed workspace update. Run after the existing tenant-intake, user/role and .74 setup.
-- The existing intake RPC remains responsible for invitation expiry, upload paths and submission.
alter table public.contract_intakes add column if not exists application_address jsonb;
alter table public.contract_intakes add column if not exists application_household jsonb;
alter table public.contract_intakes add column if not exists application_move_in_date date;

create or replace function public.mr4u_intake_call76(p_action text,p_token text,p_payload jsonb default null,p_complete boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_token is null or length(p_token)>128 then raise exception 'Invalid invitation'; end if;
 if p_action='load' then
  if to_regprocedure('public.get_contract_intake_public(uuid)') is not null then execute 'select to_jsonb(public.get_contract_intake_public($1::uuid))' into result using p_token;
  elsif to_regprocedure('public.get_contract_intake_public(text)') is not null then execute 'select to_jsonb(public.get_contract_intake_public($1))' into result using p_token;
  else raise exception 'Install the original tenant-intake setup first'; end if;
 elsif p_action='save' then
  if to_regprocedure('public.save_contract_intake_public(uuid,jsonb,boolean)') is not null then execute 'select to_jsonb(public.save_contract_intake_public($1::uuid,$2,$3))' into result using p_token,p_payload,p_complete;
  elsif to_regprocedure('public.save_contract_intake_public(text,jsonb,boolean)') is not null then execute 'select to_jsonb(public.save_contract_intake_public($1,$2,$3))' into result using p_token,p_payload,p_complete;
  else raise exception 'Install the original tenant-intake setup first'; end if;
 else raise exception 'Unknown intake operation'; end if;
 if result is null or result='null'::jsonb then raise exception 'This invitation is unavailable'; end if;
 return result;
end; $$;
revoke all on function public.mr4u_intake_call76(text,text,jsonb,boolean) from public,anon,authenticated;

create or replace function public.mr4u_intake_load76(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; r public.contract_intakes;
begin
 result:=public.mr4u_intake_call76('load',p_token);
 select * into r from public.contract_intakes where public_token::text=p_token;
 if not found or jsonb_typeof(result)<>'object' or result->>'id' is distinct from r.id::text then raise exception 'Invitation unavailable'; end if;
 return result||jsonb_build_object('application_address',r.application_address,'application_household',r.application_household,'application_move_in_date',r.application_move_in_date,'application_property',jsonb_build_object('address',(select coalesce(b.address,b.name) from public.buildings b where b.id=r.building_id and b.workspace_id=r.workspace_id),'unit',(select u.unit_number from public.units u where u.id=r.unit_id and u.workspace_id=r.workspace_id),'rent',r.monthly_rent,'costs',r.additional_costs));
end; $$;

create or replace function public.mr4u_intake_save76(p_token text,p_payload jsonb,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contract_intakes; result jsonb; address jsonb; household jsonb; k text; adults integer; children integer; move_in date;
begin
 if p_token is null or length(p_token)>128 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid invitation data'; end if;
 select * into r from public.contract_intakes where public_token::text=p_token for update;
 if not found or r.status in ('submitted','assigned','contract_ready','completed','archived') then raise exception 'This application is locked or unavailable'; end if;
 address:=coalesce(p_payload->'application_address',r.application_address,'{}'::jsonb);
 if jsonb_typeof(address)<>'object' then raise exception 'Check the current address'; end if;
 for k in select jsonb_object_keys(address) loop
  if k not in ('street','number','box','postal_code','city','region','country') or jsonb_typeof(address->k) not in ('string','null') or length(coalesce(address->>k,''))>500 then raise exception 'Check the address fields'; end if;
 end loop;
 if p_complete and (nullif(btrim(address->>'street'),'') is null or nullif(btrim(address->>'city'),'') is null or nullif(btrim(address->>'country'),'') is null) then raise exception 'Complete street, city and country'; end if;
 household:=coalesce(p_payload->'application_household',r.application_household,'{}'::jsonb);
 if jsonb_typeof(household)<>'object' then raise exception 'Check household details'; end if;
 if household ? 'adults' or household ? 'children' then
  if coalesce(household->>'adults','') !~ '^[0-9]{1,3}$' or coalesce(household->>'children','') !~ '^[0-9]{1,3}$' then raise exception 'Check household counts'; end if;
  adults:=(household->>'adults')::integer;children:=(household->>'children')::integer;
  if adults<1 or adults>100 or children>100 then raise exception 'Check household counts'; end if;
  household:=jsonb_build_object('adults',adults,'children',children);
  p_payload:=p_payload||jsonb_build_object('occupant_count',adults+children);
 end if;
 move_in:=nullif(p_payload->>'application_move_in_date','')::date;
 -- Calling the original RPC inside this transaction preserves its checks and rollback semantics.
 result:=public.mr4u_intake_call76('save',p_token,p_payload- 'application_address'- 'application_household'- 'application_move_in_date',p_complete);
 if jsonb_typeof(result)<>'object' or result->>'id' is distinct from r.id::text then raise exception 'Application could not be saved'; end if;
 update public.contract_intakes set application_address=address,application_household=household,application_move_in_date=move_in where id=r.id;
 return result||jsonb_build_object('application_address',address,'application_household',household,'application_move_in_date',move_in);
end; $$;
revoke all on function public.mr4u_intake_load76(text) from public;
revoke all on function public.mr4u_intake_save76(text,jsonb,boolean) from public;
grant execute on function public.mr4u_intake_load76(text),public.mr4u_intake_save76(text,jsonb,boolean) to anon,authenticated,service_role;

-- Keep membership role and auth scope metadata in one transaction.
create or replace function public.mr4u_member_access76(p_workspace uuid,p_actor uuid,p_user uuid,p_role text,p_scope text,p_buildings bigint[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.workspaces; actor_role text; actor_meta jsonb; target_meta jsonb;
begin
 select * into w from public.workspaces where id=p_workspace and status='active' for share;
 if not found then raise exception 'Workspace unavailable'; end if;
 select role into actor_role from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor;
 select raw_user_meta_data into actor_meta from auth.users where id=p_actor;
 if not exists(select 1 from public.platform_admins where user_id=p_actor) and w.owner_user_id<>p_actor and (coalesce(actor_role,'') not in ('owner','admin') or coalesce(actor_meta->'mr4u_access'->p_workspace::text->>'scope','all')='buildings') then raise exception 'Whole-workspace administrator access required'; end if;
 if p_user=w.owner_user_id or p_user=p_actor then raise exception 'Owner and your own access cannot be changed here'; end if;
 if p_role not in ('admin','editor','viewer') or p_scope not in ('all','buildings') then raise exception 'Choose a valid role and scope'; end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_user for update;
 if not found then raise exception 'Workspace member unavailable'; end if;
 if p_scope='buildings' and (coalesce(cardinality(p_buildings),0)=0 or exists(select 1 from unnest(p_buildings) b where b is null or not exists(select 1 from public.buildings x where x.id=b and x.workspace_id=p_workspace))) then raise exception 'Choose properties in this workspace'; end if;
 select coalesce(raw_user_meta_data,'{}'::jsonb) into target_meta from auth.users where id=p_user for update;
 if not found then raise exception 'User unavailable'; end if;
 target_meta:=jsonb_set(target_meta,'{mr4u_access}',coalesce(target_meta->'mr4u_access','{}'::jsonb)||jsonb_build_object(p_workspace::text,jsonb_build_object('role',p_role,'scope',p_scope,'building_ids',case when p_scope='buildings' then to_jsonb(p_buildings) else '[]'::jsonb end)));
 update auth.users set raw_user_meta_data=target_meta where id=p_user;
 update public.workspace_memberships set role=p_role where workspace_id=p_workspace and user_id=p_user;
 return '{"ok":true}'::jsonb;
end; $$;
revoke all on function public.mr4u_member_access76(uuid,uuid,uuid,text,text,bigint[]) from public,anon,authenticated;
grant execute on function public.mr4u_member_access76(uuid,uuid,uuid,text,text,bigint[]) to service_role;
notify pgrst,'reload schema';

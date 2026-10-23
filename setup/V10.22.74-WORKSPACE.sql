-- Run after OWNER-COLLABORATION-SETUP.sql and the existing signing setup.
-- Task context is retained after deletion, so old task messages cannot become general owner messages.
alter table public.owner_messages add column if not exists context_task_id uuid;
create index if not exists owner_messages_task_context on public.owner_messages(workspace_id,owner_id,context_task_id);
create or replace function public.mr4u_sign_remove_placement(p_id uuid,p_signer text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r signature_requests; i integer; s jsonb;
begin
 select * into r from signature_requests where id=p_id and deleted_at is null for update;
 if not found or r.state<>'active' or r.expires_at<now() then raise exception 'Signing request unavailable'; end if;
 if exists(select 1 from jsonb_array_elements(r.signers) x where x->>'signed_at' is not null or x->>'invited_at' is not null) then raise exception 'Signature boxes are locked after invitations are sent'; end if;
 select ordinality::integer-1,value into i,s from jsonb_array_elements(r.signers) with ordinality where value->>'id'=p_signer;
 if s is null then raise exception 'Signer unavailable'; end if;
 update signature_requests set signers=jsonb_set(signers,array[i::text],s-'placement'),events=events||jsonb_build_array(jsonb_build_object('type','placement_removed','signer',p_signer,'at',now())) where id=p_id;
 return '{"ok":true}'::jsonb;
end; $$;
revoke all on function public.mr4u_sign_remove_placement(uuid,text) from public,anon,authenticated;
grant execute on function public.mr4u_sign_remove_placement(uuid,text) to service_role;
notify pgrst,'reload schema';

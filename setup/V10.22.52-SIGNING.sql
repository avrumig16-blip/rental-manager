begin;
alter table public.signature_requests add column if not exists layout_mode text not null default 'appendix';
alter table public.signature_requests add column if not exists source_context jsonb;
alter table public.signature_requests add column if not exists deleted_at timestamptz;
commit;
create or replace function public.mr4u_sign_mutate(p_id uuid,p_op text,p_signer text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare r signature_requests; s jsonb; idx integer; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); event jsonb; begin
 select * into r from signature_requests where id=p_id for update;
 if not found then raise exception 'Signing request unavailable'; end if;
 if p_op='delete' then update signature_requests set deleted_at=now(),events=events||jsonb_build_array(jsonb_build_object('type','removed','at',stamp)) where id=p_id;return '{"ok":true}';end if;
 if r.deleted_at is not null then raise exception 'Signing request removed';end if;
 if p_op='cancel' then
  if r.state='completed' then raise exception 'Completed signatures cannot be cancelled';end if;
  update signature_requests set state='cancelled',events=events||jsonb_build_array(jsonb_build_object('type','cancelled','at',stamp)) where id=p_id;return '{"ok":true}';
 end if;
 if r.state='cancelled' or r.expires_at<now() then raise exception 'Signing request cancelled or expired';end if;
 if p_op='activate' then
  if r.state='draft' then update signature_requests set state='active',source_validated=true where id=p_id;end if;return '{"ok":true}';
 end if;
 if r.state not in ('active','completed') then raise exception 'Finish uploading the document first';end if;
 select ordinality::integer-1,value into idx,s from jsonb_array_elements(r.signers) with ordinality where value->>'id'=p_signer;
 if s is null then raise exception 'Signer unavailable';end if;
 if p_op='place' then
  if exists(select 1 from jsonb_array_elements(r.signers) x where x->>'signed_at' is not null or x->>'invited_at' is not null) then raise exception 'Signature boxes are locked after invitations are sent';end if;
  s:=s||jsonb_build_object('placement',p_data);
 elsif p_op='opened' then
  if s->>'opened_at' is null then s:=s||jsonb_build_object('opened_at',stamp);else return '{"ok":true}';end if;
 elsif p_op='invited' then s:=s||jsonb_build_object('invited_at',stamp);
 elsif p_op='code' then
  if s->>'signed_at' is not null or s->>'declined_at' is not null then raise exception 'Signer already finished';end if;
  if coalesce((s->>'code_sent_at')::timestamptz,'1970-01-01')>now()-interval '60 seconds' then raise exception 'Wait one minute before requesting another code';end if;
  s:=s||jsonb_build_object('code_hash',p_data->>'hash','code_expires',now()+interval '10 minutes','code_sent_at',stamp,'attempts',0);
 elsif p_op in ('submit','decline') then
  if s->>'signed_at' is not null or s->>'declined_at' is not null then raise exception 'Signer already finished';end if;
  if coalesce((s->>'code_expires')::timestamptz,'1970-01-01')<now() or coalesce((s->>'attempts')::int,0)>=5 then raise exception 'Request a new email code';end if;
  if s->>'code_hash' is null or s->>'code_hash'<>p_data->>'code_hash' then
   s:=s||jsonb_build_object('attempts',coalesce((s->>'attempts')::int,0)+1);
   update signature_requests set signers=jsonb_set(signers,array[idx::text],s) where id=p_id;return '{"error":"Incorrect email code"}';
  end if;
  s:=s-'code_hash'-'code_expires';
  if p_op='submit' then s:=s||jsonb_build_object('signed_at',stamp,'evidence',p_data-'code_hash');else s:=s||jsonb_build_object('declined_at',stamp,'reason',p_data->>'reason');end if;
 else raise exception 'Unknown signing operation';end if;
 event:=jsonb_build_object('type',p_op,'at',stamp,'signer',p_signer);
 r.signers:=jsonb_set(r.signers,array[idx::text],s);
 update signature_requests set signers=r.signers,events=events||jsonb_build_array(event),state=case when not exists(select 1 from jsonb_array_elements(r.signers) x where x->>'signed_at' is null) then 'completed' else state end where id=p_id;
 return '{"ok":true}';end $$;
notify pgrst,'reload schema';

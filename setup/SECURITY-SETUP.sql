-- Run once AFTER the other setup scripts. Optional login verification; defaults OFF.
begin;
create table if not exists public.mr4u_login_security(user_id uuid primary key, enabled boolean not null default false, email text);
create table if not exists public.mr4u_login_proofs(user_id uuid not null, session_id text not null, verified_at timestamptz not null default now(), expires_at timestamptz not null, primary key(user_id,session_id));
create table if not exists public.mr4u_login_challenges(id uuid primary key, user_id uuid not null, session_id text not null, kind text not null, secret text not null, created_at timestamptz not null default now(), expires_at timestamptz not null, attempts int not null default 0, used_at timestamptz);
create table if not exists public.mr4u_passkeys(id text primary key, user_id uuid not null, public_key text not null, counter bigint not null default 0, transports jsonb not null default '[]', name text not null default 'My passkey', created_at timestamptz not null default now());
alter table public.mr4u_login_security enable row level security;
alter table public.mr4u_login_proofs enable row level security;
alter table public.mr4u_login_challenges enable row level security;
alter table public.mr4u_passkeys enable row level security;
revoke all on public.mr4u_login_security,public.mr4u_login_proofs,public.mr4u_login_challenges,public.mr4u_passkeys from anon,authenticated;
grant all on public.mr4u_login_security,public.mr4u_login_proofs,public.mr4u_login_challenges,public.mr4u_passkeys to service_role;
create or replace function public.mr4u_login_allowed(p_user uuid,p_session text,p_recent boolean default false) returns boolean language sql security definer set search_path=public,pg_temp as $$
 select (not p_recent and not exists(select 1 from mr4u_login_security where user_id=p_user and enabled)) or exists(select 1 from mr4u_login_proofs where user_id=p_user and session_id=p_session and expires_at>now() and (not p_recent or verified_at>now()-interval '5 minutes'));
$$;
create or replace function public.mr4u_login_issue(p_id uuid,p_user uuid,p_session text,p_kind text,p_secret text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if exists(select 1 from mr4u_login_challenges where user_id=p_user and kind=p_kind and created_at>now()-interval '60 seconds') then raise exception 'Please wait 60 seconds before requesting another code or challenge'; end if;
 update mr4u_login_challenges set used_at=now() where user_id=p_user and session_id=p_session and kind=p_kind and used_at is null;
 insert into mr4u_login_challenges(id,user_id,session_id,kind,secret,expires_at) values(p_id,p_user,p_session,p_kind,p_secret,now()+interval '10 minutes');
end; $$;
create or replace function public.mr4u_login_consume(p_id uuid,p_user uuid,p_session text,p_kind text,p_secret text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r mr4u_login_challenges;
begin
 select * into r from mr4u_login_challenges where id=p_id and user_id=p_user and session_id=p_session and kind=p_kind for update;
 if not found or r.used_at is not null or r.expires_at<=now() or r.attempts>=5 then return false; end if;
 update mr4u_login_challenges set attempts=attempts+1 where id=p_id;
 if r.secret<>p_secret then return false; end if;
 update mr4u_login_challenges set used_at=now() where id=p_id;
 return true;
end; $$;
create or replace function public.mr4u_login_pre_request() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
begin
 if j->>'role'='authenticated' and not mr4u_login_allowed((j->>'sub')::uuid,j->>'session_id') then raise insufficient_privilege using message='Complete your login verification first'; end if;
end; $$;
revoke all on function public.mr4u_login_allowed(uuid,text,boolean),public.mr4u_login_issue(uuid,uuid,text,text,text),public.mr4u_login_consume(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mr4u_login_allowed(uuid,text,boolean),public.mr4u_login_issue(uuid,uuid,text,text,text),public.mr4u_login_consume(uuid,uuid,text,text,text) to service_role;
grant execute on function public.mr4u_login_pre_request() to anon,authenticated,service_role;
-- PostgREST checks BEFORE every table request and RPC, including security-definer RPCs.
-- Do not silently replace an existing deployment's pre-request hook.
do $$ declare existing text; begin
 select split_part(v,'=',2) into existing from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) v where r.rolname='authenticator' and v like 'pgrst.db_pre_request=%' limit 1;
 if existing is not null and existing<>'' and existing<>'public.mr4u_login_pre_request' then raise exception 'Existing PostgREST pre-request hook: %. Combine it with mr4u_login_pre_request before enabling login verification.',existing; end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.mr4u_login_pre_request';
-- Storage uses its own API, so apply the same gate alongside existing permissions.
create or replace function public.mr4u_storage_login_allowed() returns boolean language sql security definer set search_path=public,pg_temp as $$ select public.mr4u_login_allowed(auth.uid(),auth.jwt()->>'session_id'); $$;
revoke all on function public.mr4u_storage_login_allowed() from public,anon;
grant execute on function public.mr4u_storage_login_allowed() to authenticated;
drop policy if exists mr4u_login_verified on storage.objects;
create policy mr4u_login_verified on storage.objects as restrictive for all to authenticated using(public.mr4u_storage_login_allowed()) with check(public.mr4u_storage_login_allowed());
commit;
notify pgrst,'reload config';
notify pgrst,'reload schema';

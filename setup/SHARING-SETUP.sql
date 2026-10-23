-- Optional compatibility for older share_links table constraints.
-- Existing allowed types and policies remain in place; add tenant support.
begin;
do $$ declare r record; expression text; begin
 for r in select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.share_links'::regclass and contype='c' and pg_get_constraintdef(oid) like '%entity_type%' loop
  expression:=regexp_replace(r.definition,'^CHECK \((.*)\)$','\1');
  execute format('alter table public.share_links drop constraint %I',r.conname);
  execute format('alter table public.share_links add constraint %I check ((%s) or entity_type=''tenant'')',r.conname,expression);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';

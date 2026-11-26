-- ManageRent4U V146. Run once in Supabase SQL Editor; safe to rerun.
-- Deposit records stay on the tenant and use the existing tenant access policy.
BEGIN;
ALTER TABLE public.tenants
 ADD COLUMN IF NOT EXISTS security_deposit146 jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS deposit_received_amount numeric,
 ADD COLUMN IF NOT EXISTS deposit_returned_amount numeric;
COMMIT;
NOTIFY pgrst, 'reload schema';

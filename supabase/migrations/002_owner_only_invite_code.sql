-- ==============================================================================
-- Migration: 002_owner_only_invite_code.sql
-- Description: Restrict modifications to the `invite_code` column on `public.trips`
--              strictly to the trip's `owner_id`.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_owner_only_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if invite_code is being modified (regenerated, changed, or revoked)
  IF NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
    -- Check if the requesting authenticated user is the trip owner
    IF auth.uid() IS NULL OR auth.uid()::text <> OLD.owner_id THEN
      RAISE EXCEPTION 'Permission Denied: Only the trip owner can modify, regenerate, or revoke the invite code.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if present to ensure clean idempotency
DROP TRIGGER IF EXISTS trg_owner_only_invite_code ON public.trips;

-- Create BEFORE UPDATE trigger on public.trips
CREATE TRIGGER trg_owner_only_invite_code
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_owner_only_invite_code();

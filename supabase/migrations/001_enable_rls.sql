-- ==============================================================================
-- Migration: 001_enable_rls.sql
-- Description: Enable Row Level Security (RLS) on all core application tables
--              and enforce strict user-isolation policies.
-- ==============================================================================

-- 1. Enable Row Level Security on all core tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activities ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper function to check if current authenticated user is a member of a trip
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_trip_member(check_trip_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = check_trip_id
      AND auth.uid() IS NOT NULL
      AND (
        t.owner_id = auth.uid()::text
        OR t.member_user_ids @> to_jsonb(auth.uid()::text)
        OR EXISTS (
          SELECT 1 FROM public.trip_members tm
          WHERE tm.trip_id = check_trip_id
            AND (tm.user_id = auth.uid()::text OR tm.id = auth.uid()::text)
        )
      )
  );
$$;

-- ==============================================================================
-- 2. POLICIES FOR `public.users`
-- ==============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND (id = auth.uid()::text OR id::uuid = auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND (id = auth.uid()::text OR id::uuid = auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND (id = auth.uid()::text OR id::uuid = auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (id = auth.uid()::text OR id::uuid = auth.uid()));

-- ==============================================================================
-- 3. POLICIES FOR `public.trips`
-- ==============================================================================
DROP POLICY IF EXISTS "Members can select trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can insert trips" ON public.trips;
DROP POLICY IF EXISTS "Members can update trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can delete trips" ON public.trips;

CREATE POLICY "Members can select trips"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      owner_id = auth.uid()::text
      OR member_user_ids @> to_jsonb(auth.uid()::text)
    )
  );

CREATE POLICY "Owners can insert trips"
  ON public.trips
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()::text
  );

CREATE POLICY "Members can update trips"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      owner_id = auth.uid()::text
      OR member_user_ids @> to_jsonb(auth.uid()::text)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      owner_id = auth.uid()::text
      OR member_user_ids @> to_jsonb(auth.uid()::text)
    )
  );

CREATE POLICY "Owners can delete trips"
  ON public.trips
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()::text
  );

-- ==============================================================================
-- 4. POLICIES FOR `public.trip_members`
-- ==============================================================================
DROP POLICY IF EXISTS "Members can select trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can insert trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can update trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can delete trip_members" ON public.trip_members;

CREATE POLICY "Members can select trip_members"
  ON public.trip_members
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can insert trip_members"
  ON public.trip_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update trip_members"
  ON public.trip_members
  FOR UPDATE
  TO authenticated
  USING (public.is_trip_member(trip_id))
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can delete trip_members"
  ON public.trip_members
  FOR DELETE
  TO authenticated
  USING (public.is_trip_member(trip_id));

-- ==============================================================================
-- 5. POLICIES FOR `public.expenses`
-- ==============================================================================
DROP POLICY IF EXISTS "Members can select expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can delete expenses" ON public.expenses;

CREATE POLICY "Members can select expenses"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can insert expenses"
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update expenses"
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (public.is_trip_member(trip_id))
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can delete expenses"
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (public.is_trip_member(trip_id));

-- ==============================================================================
-- 6. POLICIES FOR `public.payments`
-- ==============================================================================
DROP POLICY IF EXISTS "Members can select payments" ON public.payments;
DROP POLICY IF EXISTS "Members can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Members can update payments" ON public.payments;
DROP POLICY IF EXISTS "Members can delete payments" ON public.payments;

CREATE POLICY "Members can select payments"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can insert payments"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update payments"
  ON public.payments
  FOR UPDATE
  TO authenticated
  USING (public.is_trip_member(trip_id))
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can delete payments"
  ON public.payments
  FOR DELETE
  TO authenticated
  USING (public.is_trip_member(trip_id));

-- ==============================================================================
-- 7. POLICIES FOR `public.activities`
-- ==============================================================================
DROP POLICY IF EXISTS "Members can select activities" ON public.activities;
DROP POLICY IF EXISTS "Members can insert activities" ON public.activities;
DROP POLICY IF EXISTS "Members can update activities" ON public.activities;
DROP POLICY IF EXISTS "Members can delete activities" ON public.activities;

CREATE POLICY "Members can select activities"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can insert activities"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update activities"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (public.is_trip_member(trip_id))
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can delete activities"
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (public.is_trip_member(trip_id));

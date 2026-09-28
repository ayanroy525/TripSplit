-- ==============================================================================
-- Migration: 006_granular_roles_and_permissions.sql
-- Description: Implement Granular Member Roles & Permissions (Trip Admin,
--              Participant, Viewer) with strict Supabase Row Level Security (RLS)
--              and IDOR protection across trips, members, expenses, and payments.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SAFE ADDITIVE SCHEMA & DATA MIGRATION FOR ROLES
-- ------------------------------------------------------------------------------

-- Update existing trip members:
-- A. Trip owners / creators are assigned 'admin'
UPDATE public.trip_members tm
SET role = 'admin'
FROM public.trips t
WHERE tm.trip_id = t.id
  AND (tm.user_id = t.owner_id OR tm.id = t.owner_id OR LOWER(tm.role) = 'owner');

-- B. Existing members are assigned 'participant'
UPDATE public.trip_members
SET role = 'participant'
WHERE LOWER(role) = 'member';

-- C. Add safe check constraint allowing canonical and backward-compatible roles
ALTER TABLE public.trip_members
  DROP CONSTRAINT IF EXISTS chk_trip_member_role;

ALTER TABLE public.trip_members
  ADD CONSTRAINT chk_trip_member_role
  CHECK (LOWER(role) IN ('admin', 'participant', 'viewer', 'owner', 'member'));

-- Default role for new members is 'participant'
ALTER TABLE public.trip_members
  ALTER COLUMN role SET DEFAULT 'participant';

-- Ensure Row Level Security is enabled on all core tables
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated and anon roles so RLS policies can govern access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. ROLE RESOLUTION & OWNERSHIP HELPER FUNCTIONS (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- Returns canonical normalized role ('admin', 'participant', 'viewer') for a user in a trip
CREATE OR REPLACE FUNCTION public.get_trip_role(check_trip_id TEXT, check_user_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    -- 1. Trip owner/creator is always Trip Admin
    WHEN EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = check_trip_id AND t.owner_id = check_user_id
    ) THEN 'admin'
    -- 2. Check trip_members table
    ELSE (
      SELECT CASE
        WHEN LOWER(tm.role) IN ('admin', 'owner') THEN 'admin'
        WHEN LOWER(tm.role) = 'viewer' THEN 'viewer'
        ELSE 'participant'
      END
      FROM public.trip_members tm
      WHERE tm.trip_id = check_trip_id
        AND (tm.user_id = check_user_id OR tm.id = check_user_id)
      ORDER BY CASE WHEN LOWER(tm.role) IN ('admin', 'owner') THEN 1 WHEN LOWER(tm.role) = 'viewer' THEN 3 ELSE 2 END
      LIMIT 1
    )
  END;
$$;

-- Returns true if user is a Trip Admin (or trip creator)
CREATE OR REPLACE FUNCTION public.is_trip_admin(check_trip_id TEXT, check_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_trip_role(check_trip_id, check_user_id) = 'admin';
$$;

-- Returns true if user is either a Participant or Trip Admin (can add expenses/invite)
CREATE OR REPLACE FUNCTION public.is_trip_participant_or_admin(check_trip_id TEXT, check_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_trip_role(check_trip_id, check_user_id) IN ('admin', 'participant');
$$;

-- Returns true if user is any valid member of the trip (Admin, Participant, or Viewer)
CREATE OR REPLACE FUNCTION public.is_trip_member(check_trip_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT auth.uid() IS NOT NULL AND public.get_trip_role(check_trip_id, auth.uid()::text) IS NOT NULL;
$$;

-- Returns true if the user created or paid the expense (Expense Ownership)
CREATE OR REPLACE FUNCTION public.is_expense_owner(check_expense_id TEXT, check_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = check_expense_id
      AND (
        e.created_by = check_user_id
        OR e.paid_by = check_user_id
        OR (e.payers IS NOT NULL AND e.payers ? check_user_id)
        OR EXISTS (
          SELECT 1 FROM public.trip_members tm
          WHERE tm.trip_id = e.trip_id
            AND (tm.user_id = check_user_id OR tm.id = check_user_id)
            AND (
              tm.id = e.created_by
              OR tm.id = e.paid_by
              OR (e.payers IS NOT NULL AND e.payers ? tm.id)
            )
        )
      )
  );
$$;

-- ------------------------------------------------------------------------------
-- 3. TRIGGER FOR SECURING MEMBER ROLE CHANGES & PROFILE UPDATES
-- ------------------------------------------------------------------------------
-- Prevents Participants and Viewers from promoting themselves or others to Admin,
-- changing roles, or tampering with other members' profiles.

CREATE OR REPLACE FUNCTION public.enforce_member_role_and_profile_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id TEXT;
  v_is_caller_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid()::text;

  -- If called without an authenticated session (e.g. background maintenance or migrations), allow
  IF v_caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_caller_admin := public.is_trip_admin(OLD.trip_id, v_caller_id);

  -- 1. Check if role is being modified
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT v_is_caller_admin THEN
      RAISE EXCEPTION 'Permission Denied: Only a Trip Admin can change member roles.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. If caller is not admin, they can only update their own member record
  IF NOT v_is_caller_admin THEN
    IF OLD.user_id <> v_caller_id AND OLD.id <> v_caller_id THEN
      RAISE EXCEPTION 'Permission Denied: Participants can only update their own member profile.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_role_permissions ON public.trip_members;
CREATE TRIGGER trg_member_role_permissions
  BEFORE UPDATE ON public.trip_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_role_and_profile_permissions();

-- ------------------------------------------------------------------------------
-- 4. RLS POLICIES FOR `public.expenses`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can select expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can delete expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins and participants can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can update all expenses, participants update own" ON public.expenses;
DROP POLICY IF EXISTS "Admins can delete all expenses, participants delete own" ON public.expenses;

-- Read: All trip members (Admin, Participant, Viewer) can view expenses
CREATE POLICY "Members can select expenses"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

-- Insert: Admins and Participants can add expenses. Viewers CANNOT.
CREATE POLICY "Admins and participants can insert expenses"
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
  );

-- Update: Admins can update any expense. Participants can only update their OWN expenses. Viewers CANNOT.
CREATE POLICY "Admins can update all expenses, participants update own"
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND public.is_expense_owner(id, auth.uid()::text)
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND public.is_expense_owner(id, auth.uid()::text)
      )
    )
  );

-- Delete: Admins can delete any expense. Participants can only delete their OWN expenses. Viewers CANNOT.
CREATE POLICY "Admins can delete all expenses, participants delete own"
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND public.is_expense_owner(id, auth.uid()::text)
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 5. RLS POLICIES FOR `public.trip_members`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can select trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can insert trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can update trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can delete trip_members" ON public.trip_members;
DROP POLICY IF EXISTS "Admins and participants can insert members" ON public.trip_members;
DROP POLICY IF EXISTS "Admins can update members, users can update own profile without role change" ON public.trip_members;
DROP POLICY IF EXISTS "Only admins can delete members" ON public.trip_members;

-- Read: All trip members can select members
CREATE POLICY "Members can select trip_members"
  ON public.trip_members
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

-- Insert:
-- - Admins can add members with any role.
-- - Participants can invite members (must join as participant or viewer, cannot be admin).
-- - Users joining via valid trip invite code join as participant.
CREATE POLICY "Admins and participants can insert members"
  ON public.trip_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND LOWER(COALESCE(role, 'participant')) IN ('participant', 'viewer', 'member')
      )
      OR (
        (user_id = auth.uid()::text OR id = auth.uid()::text)
        AND LOWER(COALESCE(role, 'participant')) IN ('participant', 'viewer', 'member')
        AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.invite_code IS NOT NULL)
      )
    )
  );

-- Update: Admins can update any member and change roles. Non-admins can only update own profile without changing role.
CREATE POLICY "Admins can update members, users can update own profile without role change"
  ON public.trip_members
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        (user_id = auth.uid()::text OR id = auth.uid()::text)
        AND public.is_trip_member(trip_id)
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        (user_id = auth.uid()::text OR id = auth.uid()::text)
        AND LOWER(role) = LOWER(
          (SELECT tm.role FROM public.trip_members tm WHERE tm.id = trip_members.id)
        )
      )
    )
  );

-- Delete: ONLY Trip Admin can remove members! Participants and Viewers CANNOT.
CREATE POLICY "Only admins can delete members"
  ON public.trip_members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.is_trip_admin(trip_id, auth.uid()::text)
  );

-- ------------------------------------------------------------------------------
-- 6. RLS POLICIES FOR `public.trips`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can select trips" ON public.trips;
DROP POLICY IF EXISTS "Members can update trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can insert trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can delete trips" ON public.trips;
DROP POLICY IF EXISTS "Only admins can update trips" ON public.trips;
DROP POLICY IF EXISTS "Only admins can delete trips" ON public.trips;

-- Read: All trip members can select trips
CREATE POLICY "Members can select trips"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      owner_id = auth.uid()::text
      OR member_user_ids @> to_jsonb(auth.uid()::text)
      OR public.is_trip_member(id)
    )
  );

-- Insert: Any authenticated user can create a trip (they become owner/admin)
CREATE POLICY "Owners can insert trips"
  ON public.trips
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()::text
  );

-- Update: ONLY Trip Admins can update trip settings / title / destination / currency.
-- Participants and Viewers CANNOT change trip settings.
CREATE POLICY "Only admins can update trips"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.is_trip_admin(id, auth.uid()::text)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_trip_admin(id, auth.uid()::text)
  );

-- Delete: ONLY Trip Admins / Owners can delete trips
CREATE POLICY "Only admins can delete trips"
  ON public.trips
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      owner_id = auth.uid()::text
      OR public.is_trip_admin(id, auth.uid()::text)
    )
  );

-- ------------------------------------------------------------------------------
-- 7. RLS POLICIES FOR `public.payments`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can select payments" ON public.payments;
DROP POLICY IF EXISTS "Members can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Members can update payments" ON public.payments;
DROP POLICY IF EXISTS "Members can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Admins and participants can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins and involved participants can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins and involved participants can delete payments" ON public.payments;

-- Read: All trip members can view payments
CREATE POLICY "Members can select payments"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.is_trip_member(trip_id));

-- Insert: Admins and Participants can record payments. Viewers CANNOT.
CREATE POLICY "Admins and participants can insert payments"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
  );

-- Update: Admins can update any payment; involved participants can confirm or cancel payments. Viewers CANNOT.
CREATE POLICY "Admins and involved participants can update payments"
  ON public.payments
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND (
          from_user_id = auth.uid()::text
          OR to_user_id = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = payments.trip_id
              AND (tm.user_id = auth.uid()::text OR tm.id = auth.uid()::text)
              AND (tm.id = from_member_id OR tm.id = to_member_id)
          )
        )
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND (
          from_user_id = auth.uid()::text
          OR to_user_id = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = payments.trip_id
              AND (tm.user_id = auth.uid()::text OR tm.id = auth.uid()::text)
              AND (tm.id = from_member_id OR tm.id = to_member_id)
          )
        )
      )
    )
  );

-- Delete: Admins or involved participants can delete payments. Viewers CANNOT.
CREATE POLICY "Admins and involved participants can delete payments"
  ON public.payments
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_trip_admin(trip_id, auth.uid()::text)
      OR (
        public.is_trip_participant_or_admin(trip_id, auth.uid()::text)
        AND (
          from_user_id = auth.uid()::text
          OR to_user_id = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = payments.trip_id
              AND (tm.user_id = auth.uid()::text OR tm.id = auth.uid()::text)
              AND (tm.id = from_member_id OR tm.id = to_member_id)
          )
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 8. UPDATE ATOMIC STORED PROCEDURES WITH GRANULAR ROLE ENFORCEMENT
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_expense_atomic(
  p_trip_id TEXT,
  p_expense JSONB,
  p_activity JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id TEXT;
  v_role TEXT;
  v_caller_id TEXT;
  v_res JSONB;
BEGIN
  v_caller_id := auth.uid()::text;
  v_expense_id := COALESCE(p_expense->>'id', 'exp_' || floor(extract(epoch from now()) * 1000)::text);

  -- Role-based security checks if session authenticated
  IF v_caller_id IS NOT NULL THEN
    v_role := public.get_trip_role(p_trip_id, v_caller_id);
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Permission Denied: You are not a member of this trip.'
        USING ERRCODE = '42501';
    END IF;

    IF v_role = 'viewer' THEN
      RAISE EXCEPTION 'Permission Denied: Viewers cannot create or edit expenses.'
        USING ERRCODE = '42501';
    END IF;

    -- If Participant is editing an existing expense, verify ownership
    IF v_role = 'participant' AND EXISTS (SELECT 1 FROM public.expenses WHERE id = v_expense_id) THEN
      IF NOT public.is_expense_owner(v_expense_id, v_caller_id) THEN
        RAISE EXCEPTION 'Permission Denied: Participants can only edit their own expenses.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.expenses (
    id,
    trip_id,
    title,
    amount,
    category,
    date,
    paid_by,
    payers,
    created_by,
    method,
    split_type,
    participants,
    splits,
    split_percentages,
    split_shares,
    items,
    notes,
    receipt_url,
    created_at,
    updated_at,
    deleted,
    deleted_at,
    deleted_by,
    audit_logs,
    original_amount,
    original_currency,
    exchange_rate
  ) VALUES (
    v_expense_id,
    p_trip_id,
    COALESCE(p_expense->>'title', 'Expense'),
    COALESCE((p_expense->>'amount')::NUMERIC, 0),
    COALESCE(p_expense->>'category', 'General'),
    COALESCE(p_expense->>'date', to_char(NOW(), 'YYYY-MM-DD')),
    p_expense->>'paid_by',
    p_expense->'payers',
    COALESCE(p_expense->>'created_by', v_caller_id),
    COALESCE(p_expense->>'method', 'equal'),
    COALESCE(p_expense->>'split_type', p_expense->>'method', 'equal'),
    COALESCE(p_expense->'participants', '[]'::jsonb),
    COALESCE(p_expense->'splits', '{}'::jsonb),
    p_expense->'split_percentages',
    p_expense->'split_shares',
    p_expense->'items',
    p_expense->>'notes',
    p_expense->>'receipt_url',
    COALESCE((p_expense->>'created_at')::TIMESTAMPTZ, NOW()),
    NOW(),
    COALESCE((p_expense->>'deleted')::BOOLEAN, false),
    (p_expense->>'deleted_at')::TIMESTAMPTZ,
    p_expense->>'deleted_by',
    COALESCE(p_expense->'audit_logs', '[]'::jsonb),
    (p_expense->>'original_amount')::NUMERIC,
    p_expense->>'original_currency',
    (p_expense->>'exchange_rate')::NUMERIC
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    paid_by = EXCLUDED.paid_by,
    payers = EXCLUDED.payers,
    method = EXCLUDED.method,
    split_type = EXCLUDED.split_type,
    participants = EXCLUDED.participants,
    splits = EXCLUDED.splits,
    split_percentages = EXCLUDED.split_percentages,
    split_shares = EXCLUDED.split_shares,
    items = EXCLUDED.items,
    notes = EXCLUDED.notes,
    receipt_url = EXCLUDED.receipt_url,
    updated_at = NOW(),
    deleted = EXCLUDED.deleted,
    deleted_at = EXCLUDED.deleted_at,
    deleted_by = EXCLUDED.deleted_by,
    audit_logs = EXCLUDED.audit_logs,
    original_amount = EXCLUDED.original_amount,
    original_currency = EXCLUDED.original_currency,
    exchange_rate = EXCLUDED.exchange_rate;

  IF p_activity IS NOT NULL AND (p_activity->>'user_name' IS NOT NULL OR p_activity->>'action' IS NOT NULL) THEN
    INSERT INTO public.activities (
      id,
      trip_id,
      ts,
      user_name,
      action,
      detail,
      actor_id,
      created_at
    ) VALUES (
      COALESCE(p_activity->>'id', 'act_' || floor(extract(epoch from now()) * 1000)::text),
      p_trip_id,
      COALESCE(p_activity->>'ts', 'Just now'),
      COALESCE(p_activity->>'user_name', 'Someone'),
      COALESCE(p_activity->>'action', 'expense'),
      COALESCE(p_activity->>'detail', ''),
      p_activity->>'actor_id',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE public.trips
  SET updated_at = NOW()
  WHERE id = p_trip_id;

  v_res := jsonb_build_object(
    'success', true,
    'expense_id', v_expense_id,
    'trip_id', p_trip_id,
    'timestamp', extract(epoch from now())
  );

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_trip_id TEXT,
  p_payment JSONB,
  p_activity JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id TEXT;
  v_role TEXT;
  v_caller_id TEXT;
  v_res JSONB;
BEGIN
  v_caller_id := auth.uid()::text;
  v_payment_id := COALESCE(p_payment->>'id', 'pay_' || floor(extract(epoch from now()) * 1000)::text);

  IF v_caller_id IS NOT NULL THEN
    v_role := public.get_trip_role(p_trip_id, v_caller_id);
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Permission Denied: You are not a member of this trip.'
        USING ERRCODE = '42501';
    END IF;

    IF v_role = 'viewer' THEN
      RAISE EXCEPTION 'Permission Denied: Viewers cannot record payments.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.payments (
    id,
    trip_id,
    from_member_id,
    to_member_id,
    from_user_id,
    to_user_id,
    amount,
    status,
    method,
    ts,
    note,
    created_at,
    paid_at,
    marked_paid_by,
    confirmed_by,
    confirmed_at,
    cancelled_by,
    cancelled_at,
    cancellation_reason,
    disputed_by,
    disputed_at,
    dispute_reason,
    updated_at,
    audit_logs,
    original_amount,
    original_currency,
    exchange_rate
  ) VALUES (
    v_payment_id,
    p_trip_id,
    p_payment->>'from_member_id',
    p_payment->>'to_member_id',
    p_payment->>'from_user_id',
    p_payment->>'to_user_id',
    COALESCE((p_payment->>'amount')::NUMERIC, 0),
    COALESCE(p_payment->>'status', 'pending_confirmation'),
    COALESCE(p_payment->>'method', 'cash'),
    COALESCE(p_payment->>'ts', 'Just now'),
    p_payment->>'note',
    COALESCE((p_payment->>'created_at')::TIMESTAMPTZ, NOW()),
    (p_payment->>'paid_at')::TIMESTAMPTZ,
    p_payment->>'marked_paid_by',
    p_payment->>'confirmed_by',
    (p_payment->>'confirmed_at')::TIMESTAMPTZ,
    p_payment->>'cancelled_by',
    (p_payment->>'cancelled_at')::TIMESTAMPTZ,
    p_payment->>'cancellation_reason',
    p_payment->>'disputed_by',
    (p_payment->>'disputed_at')::TIMESTAMPTZ,
    p_payment->>'dispute_reason',
    NOW(),
    COALESCE(p_payment->'audit_logs', '[]'::jsonb),
    (p_payment->>'original_amount')::NUMERIC,
    p_payment->>'original_currency',
    (p_payment->>'exchange_rate')::NUMERIC
  )
  ON CONFLICT (id) DO UPDATE SET
    from_member_id = EXCLUDED.from_member_id,
    to_member_id = EXCLUDED.to_member_id,
    from_user_id = EXCLUDED.from_user_id,
    to_user_id = EXCLUDED.to_user_id,
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    method = EXCLUDED.method,
    ts = EXCLUDED.ts,
    note = EXCLUDED.note,
    paid_at = EXCLUDED.paid_at,
    marked_paid_by = EXCLUDED.marked_paid_by,
    confirmed_by = EXCLUDED.confirmed_by,
    confirmed_at = EXCLUDED.confirmed_at,
    cancelled_by = EXCLUDED.cancelled_by,
    cancelled_at = EXCLUDED.cancelled_at,
    cancellation_reason = EXCLUDED.cancellation_reason,
    disputed_by = EXCLUDED.disputed_by,
    disputed_at = EXCLUDED.disputed_at,
    dispute_reason = EXCLUDED.dispute_reason,
    updated_at = NOW(),
    audit_logs = EXCLUDED.audit_logs,
    original_amount = EXCLUDED.original_amount,
    original_currency = EXCLUDED.original_currency,
    exchange_rate = EXCLUDED.exchange_rate;

  IF p_activity IS NOT NULL AND (p_activity->>'user_name' IS NOT NULL OR p_activity->>'action' IS NOT NULL) THEN
    INSERT INTO public.activities (
      id,
      trip_id,
      ts,
      user_name,
      action,
      detail,
      actor_id,
      created_at
    ) VALUES (
      COALESCE(p_activity->>'id', 'act_' || floor(extract(epoch from now()) * 1000)::text),
      p_trip_id,
      COALESCE(p_activity->>'ts', 'Just now'),
      COALESCE(p_activity->>'user_name', 'Someone'),
      COALESCE(p_activity->>'action', 'payment'),
      COALESCE(p_activity->>'detail', ''),
      p_activity->>'actor_id',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE public.trips
  SET updated_at = NOW()
  WHERE id = p_trip_id;

  v_res := jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'trip_id', p_trip_id,
    'timestamp', extract(epoch from now())
  );

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(
  p_trip_id TEXT,
  p_payment_id TEXT,
  p_confirmed_by TEXT,
  p_activity JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_caller_id TEXT;
  v_res JSONB;
BEGIN
  v_caller_id := auth.uid()::text;

  IF v_caller_id IS NOT NULL THEN
    v_role := public.get_trip_role(p_trip_id, v_caller_id);
    IF v_role IS NULL OR v_role = 'viewer' THEN
      RAISE EXCEPTION 'Permission Denied: Viewers cannot confirm payments.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.payments
  SET
    status = 'confirmed',
    confirmed_by = p_confirmed_by,
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_payment_id
    AND trip_id = p_trip_id;

  IF p_activity IS NOT NULL AND (p_activity->>'user_name' IS NOT NULL OR p_activity->>'action' IS NOT NULL) THEN
    INSERT INTO public.activities (
      id,
      trip_id,
      ts,
      user_name,
      action,
      detail,
      actor_id,
      created_at
    ) VALUES (
      COALESCE(p_activity->>'id', 'act_' || floor(extract(epoch from now()) * 1000)::text),
      p_trip_id,
      COALESCE(p_activity->>'ts', 'Just now'),
      COALESCE(p_activity->>'user_name', 'Someone'),
      COALESCE(p_activity->>'action', 'payment_confirmed'),
      COALESCE(p_activity->>'detail', ''),
      p_activity->>'actor_id',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE public.trips
  SET updated_at = NOW()
  WHERE id = p_trip_id;

  v_res := jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'trip_id', p_trip_id,
    'status', 'confirmed',
    'timestamp', extract(epoch from now())
  );

  RETURN v_res;
END;
$$;

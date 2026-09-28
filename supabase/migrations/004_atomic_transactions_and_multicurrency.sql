-- ==============================================================================
-- Migration: 004_atomic_transactions_and_multicurrency.sql
-- Description: 
--   1. Add multi-currency tracking columns to expenses and payments
--   2. Implement atomic PostgreSQL RPC procedures for transaction safety:
--      - record_payment_atomic: Atomically saves payment & activity & updates trip
--      - save_expense_atomic: Atomically saves expense & activity & updates trip
--      - confirm_payment_atomic: Atomically updates payment status & records activity
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD MULTI-CURRENCY COLUMNS
-- ------------------------------------------------------------------------------

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC PAYMENT STORED PROCEDURE (RPC)
-- ------------------------------------------------------------------------------

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
  v_res JSONB;
BEGIN
  -- 1. Extract payment ID or generate one
  v_payment_id := COALESCE(p_payment->>'id', 'pay_' || floor(extract(epoch from now()) * 1000)::text);

  -- 2. Upsert payment atomically
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
    COALESCE(p_payment->>'status', 'confirmed'),
    COALESCE(p_payment->>'method', 'Cash'),
    p_payment->>'ts',
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

  -- 3. If activity is provided, record it atomically
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

  -- 4. Bump trip updated_at timestamp to sync subscribers
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

-- ------------------------------------------------------------------------------
-- 3. ATOMIC EXPENSE STORED PROCEDURE (RPC)
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
  v_res JSONB;
BEGIN
  v_expense_id := COALESCE(p_expense->>'id', 'exp_' || floor(extract(epoch from now()) * 1000)::text);

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
    p_expense->>'created_by',
    COALESCE(p_expense->>'method', 'equal'),
    COALESCE(p_expense->>'split_type', p_expense->>'method', 'equal'),
    COALESCE(p_expense->'participants', '[]'::jsonb),
    COALESCE(p_expense->'splits', '{}'::jsonb),
    p_expense->'split_percentages',
    p_expense->'split_shares',
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

-- ------------------------------------------------------------------------------
-- 4. ATOMIC PAYMENT CONFIRMATION STORED PROCEDURE (RPC)
-- ------------------------------------------------------------------------------

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
  v_res JSONB;
BEGIN
  UPDATE public.payments
  SET
    status = 'confirmed',
    confirmed_by = p_confirmed_by,
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_payment_id AND trip_id = p_trip_id;

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
    'status', 'confirmed',
    'timestamp', extract(epoch from now())
  );

  RETURN v_res;
END;
$$;

-- Grant execution permissions to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(TEXT, JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_expense_atomic(TEXT, JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- Migration 005: Itemized splits line-items column on expenses table
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS items JSONB DEFAULT NULL;

-- Update save_expense_atomic to preserve receipt line items
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
    p_expense->>'created_by',
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

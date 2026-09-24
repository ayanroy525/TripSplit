-- ==============================================================================
-- Migration: 003_data_integrity_constraints.sql
-- Description: Add database CHECK constraints and validation triggers to enforce
--              data integrity for expenses, splits, and payments.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CONSTRAINTS ON `public.expenses`
-- ------------------------------------------------------------------------------

-- Amount must be strictly positive
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS chk_expense_amount_positive;

ALTER TABLE public.expenses
  ADD CONSTRAINT chk_expense_amount_positive
  CHECK (amount > 0);

-- Split type must be one of the application's supported split strategies
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS chk_expense_split_type;

ALTER TABLE public.expenses
  ADD CONSTRAINT chk_expense_split_type
  CHECK (
    split_type IS NULL
    OR LOWER(split_type) IN (
      'equal',
      'custom',
      'percentage',
      'shares',
      'selected',
      'exact'
    )
  );

-- Participants list must not be empty on active (non-deleted) expenses
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS chk_expense_participants_not_empty;

ALTER TABLE public.expenses
  ADD CONSTRAINT chk_expense_participants_not_empty
  CHECK (
    deleted IS TRUE
    OR (
      participants IS NOT NULL
      AND (
        (jsonb_typeof(participants) = 'array' AND jsonb_array_length(participants) > 0)
        OR (jsonb_typeof(participants) <> 'array')
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 2. CONSTRAINTS ON `public.payments`
-- ------------------------------------------------------------------------------

-- Amount must be strictly positive
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payment_amount_positive;

ALTER TABLE public.payments
  ADD CONSTRAINT chk_payment_amount_positive
  CHECK (amount > 0);

-- Status must match valid lifecycle values
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payment_status;

ALTER TABLE public.payments
  ADD CONSTRAINT chk_payment_status
  CHECK (
    status IS NULL
    OR LOWER(status) IN (
      'pending_confirmation',
      'confirmed',
      'paid',
      'pending',
      'cancelled',
      'disputed',
      'marked_paid',
      'unpaid'
    )
  );

-- ------------------------------------------------------------------------------
-- 3. SPLITS SUM VALIDATION TRIGGER ON `public.expenses`
-- ------------------------------------------------------------------------------
-- Validates that the sum of numeric values in the `splits` JSONB object equals
-- the `amount` within a 0.05 currency tolerance for cent/paisa rounding.

CREATE OR REPLACE FUNCTION public.validate_expense_splits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  split_sum NUMERIC := 0;
  split_val_text TEXT;
BEGIN
  -- Only validate active (non-deleted) expenses that have a non-empty splits object
  IF (NEW.deleted IS NOT TRUE) AND (NEW.splits IS NOT NULL) AND (NEW.splits <> '{}'::jsonb) THEN
    FOR split_val_text IN SELECT value FROM jsonb_each_text(NEW.splits)
    LOOP
      split_sum := split_sum + COALESCE(split_val_text::numeric, 0);
    END LOOP;

    -- Enforce sum match within 0.05 tolerance
    IF ABS(split_sum - NEW.amount) > 0.05 THEN
      RAISE EXCEPTION 'Constraint Violation: Sum of splits (%) does not match expense amount (%).', split_sum, NEW.amount
        USING ERRCODE = '23514'; -- check_violation
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_expense_splits ON public.expenses;

CREATE TRIGGER trg_validate_expense_splits
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_expense_splits();

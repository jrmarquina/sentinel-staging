-- =============================================================
-- Migration 056: Normalize NULL auth token columns for crios
--
-- Migration 054 inserted the crios auth.users row directly (bypassing
-- the GoTrue admin API). GoTrue's login query scans several token
-- columns (confirmation_token, recovery_token, email_change, …) into
-- non-nullable Go strings; when those columns are NULL the login fails
-- with HTTP 500 "Database error querying schema".
--
-- This coalesces every such column to '' for the crios user. It is
-- defensive (only touches columns that exist in this GoTrue version)
-- and idempotent (COALESCE leaves already-empty values unchanged).
-- =============================================================

DO $$
DECLARE
  v_uid   UUID;
  v_col   TEXT;
  v_text_cols TEXT[] := ARRAY[
    'confirmation_token', 'recovery_token',
    'email_change_token_new', 'email_change', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ];
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'crios@guaynabocity.gov.pr';
  IF v_uid IS NULL THEN
    RAISE NOTICE '056: crios user not found — skipping';
    RETURN;
  END IF;

  FOREACH v_col IN ARRAY v_text_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = v_col
    ) THEN
      EXECUTE format(
        'UPDATE auth.users SET %I = COALESCE(%I, %L) WHERE id = $1',
        v_col, v_col, ''
      ) USING v_uid;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users'
      AND column_name = 'email_change_confirm_status'
  ) THEN
    UPDATE auth.users
    SET email_change_confirm_status = COALESCE(email_change_confirm_status, 0)
    WHERE id = v_uid;
  END IF;

  RAISE NOTICE '056: normalized auth token columns for crios (%).', v_uid;
END $$;

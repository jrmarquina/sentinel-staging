-- =============================================================
-- Migration 054: Provision the Property Supervisor login
--                (crios@guaynabocity.gov.pr)
--
-- Creates the auth user for the Property Supervisor role added in
-- migration 053. The trg_on_auth_user_created trigger then creates
-- the profile + user_roles (role_definition = property_supervisor,
-- capability org_manager, legacy app_role supervisor).
--
-- SECURITY / OPERATIONS NOTES:
--   · encrypted_password below is a BCRYPT HASH, not a plaintext
--     secret. It corresponds to a TEMPORARY bootstrap password that
--     is handed to the user out-of-band and MUST be changed on first
--     login. Rotate it immediately after bootstrap.
--   · Idempotent: does nothing if the email already exists, so it is
--     safe to re-run on every deploy and across environments.
--   · Atomic: the user and its identity are created in one DO block,
--     so a failure leaves no half-provisioned account.
-- =============================================================

SET search_path = public, extensions, auth;

DO $$
DECLARE
  v_org   UUID;
  v_uid   UUID := gen_random_uuid();
  v_email TEXT := 'crios@guaynabocity.gov.pr';
  -- bcrypt($2b$) hash of the temporary bootstrap password (rotate on first login)
  v_hash  TEXT := '$2b$10$2GT6AwyHeEYIYRHyFkR4b.hrEG5A07dVChU/NSEXcFOFb5pj95rti';
BEGIN
  SELECT id INTO v_org FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    RAISE NOTICE 'No organization found — skipping property supervisor provisioning';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE NOTICE 'User % already exists — skipping.', v_email;
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_email,
    v_hash, NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name',       'Property Supervisor',
      'org_id',          v_org,
      'department_slug', 'fm',
      'invited_role',    'property_supervisor'
    ),
    NOW(), NOW()
  );

  -- Email/password identity (required by GoTrue v2 for password login).
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid, v_uid::text, 'email',
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    NOW(), NOW(), NOW()
  );

  RAISE NOTICE 'Provisioned % as Property Supervisor (id %).', v_email, v_uid;
END $$;

-- Safety net: ensure the role row points at property_supervisor even if the
-- trigger resolved a fallback (e.g. ordering differences across environments).
UPDATE user_roles ur
SET role_definition_id = rd.id,
    department_id      = rd.department_id,
    role               = 'supervisor'
FROM org_role_definitions rd
JOIN auth.users u ON u.email = 'crios@guaynabocity.gov.pr'
WHERE ur.user_id = u.id
  AND rd.org_id = ur.org_id
  AND rd.slug = 'property_supervisor';

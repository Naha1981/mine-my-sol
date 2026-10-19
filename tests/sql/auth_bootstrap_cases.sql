\set ON_ERROR_STOP on

-- A signup without a code, or with the admin marker in user-editable metadata, must fail.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (
      '10000000-0000-4000-8000-000000000001',
      'uninvited@example.com',
      '{"full_name":"Uninvited Person","minemysol_initial_admin":true}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Signup without an invitation was unexpectedly accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'User-editable metadata granted administrator access';
  END IF;
END $$;

-- Only trusted app_metadata may initialise the first administrator.
INSERT INTO auth.users(id, email, raw_user_meta_data, raw_app_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000002',
  'admin@example.com',
  '{"full_name":"Initial Administrator","phone":"0712345678"}'::jsonb,
  '{"minemysol_initial_admin":true}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = '10000000-0000-4000-8000-000000000002' AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Trusted initial administrator bootstrap did not grant the admin role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = '10000000-0000-4000-8000-000000000002' AND o.kind = 'buyer'
  ) THEN
    RAISE EXCEPTION 'Initial administrator was not attached to the buyer organization';
  END IF;
END $$;

-- The trusted bootstrap marker cannot be reused to create another admin.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_app_meta_data)
    VALUES (
      '10000000-0000-4000-8000-000000000003',
      'second-admin@example.com',
      '{"minemysol_initial_admin":true}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Second initial administrator bootstrap was unexpectedly accepted';
  END IF;
END $$;

-- A wrong-email invitation must fail and remain pending.
INSERT INTO public.invitations(email, organization_name, code, expires_at)
VALUES ('contractor@example.com', 'Contractor Limited', 'VALID123', now() + interval '1 day');

DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (
      '10000000-0000-4000-8000-000000000004',
      'attacker@example.com',
      '{"full_name":"Wrong Email","phone":"0712345678","invite_code":"VALID123"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'An invitation was accepted for the wrong email address';
  END IF;
  IF (SELECT status FROM public.invitations WHERE code = 'VALID123') <> 'pending' THEN
    RAISE EXCEPTION 'Rejected signup consumed the invitation';
  END IF;
END $$;

-- A valid code is bound to its invited email, consumed once, and creates a contractor.
INSERT INTO auth.users(id, email, raw_user_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000005',
  'Contractor@Example.com',
  '{"full_name":"Approved Contractor","phone":"0712345678","invite_code":"valid123"}'::jsonb
);

DO $$
DECLARE org_id uuid;
BEGIN
  SELECT accepted_org_id INTO org_id FROM public.invitations WHERE code = 'VALID123';
  IF org_id IS NULL OR (SELECT status FROM public.invitations WHERE code = 'VALID123') <> 'accepted' THEN
    RAISE EXCEPTION 'Valid invitation was not consumed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = '10000000-0000-4000-8000-000000000005' AND role = 'contractor'
  ) THEN
    RAISE EXCEPTION 'Valid invited user did not receive the contractor role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contractor_profiles WHERE organization_id = org_id
  ) THEN
    RAISE EXCEPTION 'Contractor profile was not created';
  END IF;
END $$;

-- An accepted/used invitation cannot be replayed.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (
      '10000000-0000-4000-8000-000000000006',
      'contractor@example.com',
      '{"full_name":"Replay Attempt","phone":"0712345678","invite_code":"VALID123"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Reused invitation code was unexpectedly accepted';
  END IF;
END $$;

-- Even after bootstrap, no-code signup must still be rejected.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (
      '10000000-0000-4000-8000-000000000007',
      'another@example.com',
      '{"full_name":"Another Person","phone":"0712345678"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'No-code signup was accepted after administrator bootstrap';
  END IF;
END $$;

SELECT 'Auth bootstrap and invitation tests passed' AS result;

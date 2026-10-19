-- Secure MineMySol account provisioning.
-- Public signup can never assign an administrator role. Contractor accounts require
-- a valid, unexpired invitation whose email matches the Auth user's email.
--
-- Controlled first-admin bootstrap:
-- A trusted server-side Supabase Auth Admin API call may create exactly one initial
-- administrator with app_metadata.minemysol_initial_admin = true. This is Auth
-- app_metadata (raw_app_meta_data), not user_metadata (raw_user_meta_data), because
-- clients can set user_metadata during signup but cannot set app_metadata themselves.
-- Never put the service-role key in client code or VITE_* environment variables.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations;
  org_id uuid;
  v_code text;
  v_hp text;
BEGIN
  -- Preserve the registration honeypot check.
  v_hp := coalesce(NEW.raw_user_meta_data->>'website', '');
  IF v_hp <> '' THEN
    RAISE EXCEPTION 'Registration rejected';
  END IF;

  -- The bootstrap marker is trusted only in Supabase Auth app_metadata.
  -- Lock this section so two concurrent initial-admin attempts cannot race.
  IF coalesce(NEW.raw_app_meta_data->>'minemysol_initial_admin', 'false') = 'true' THEN
    PERFORM pg_advisory_xact_lock(19370122, 1);

    IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
      RAISE EXCEPTION 'The initial administrator has already been configured';
    END IF;

    SELECT id
      INTO org_id
      FROM public.organizations
     WHERE kind = 'buyer'
     ORDER BY created_at
     LIMIT 1;

    IF org_id IS NULL THEN
      INSERT INTO public.organizations(name, kind)
      VALUES ('MySol', 'buyer')
      RETURNING id INTO org_id;
    END IF;

    INSERT INTO public.profiles(id, full_name, email, phone)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');

    INSERT INTO public.memberships(user_id, organization_id)
    VALUES (NEW.id, org_id);

    INSERT INTO public.user_roles(user_id, role)
    VALUES (NEW.id, 'admin');

    RETURN NEW;
  END IF;

  -- Normal public signup is invitation-only; no first-user administrator shortcut.
  v_code := upper(trim(coalesce(NEW.raw_user_meta_data->>'invite_code', '')));
  IF v_code = '' THEN
    RAISE EXCEPTION 'A valid invitation code for this email address is required to register';
  END IF;

  -- Lock the invitation row so concurrent signups cannot redeem the same code.
  SELECT i.*
    INTO inv
    FROM public.invitations i
   WHERE i.code = v_code
     AND i.status = 'pending'
     AND i.expires_at > now()
     AND lower(i.email) = lower(coalesce(NEW.email, ''))
   LIMIT 1
   FOR UPDATE;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'That invitation code does not match this email address or has expired';
  END IF;

  INSERT INTO public.profiles(id, full_name, email, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');

  INSERT INTO public.organizations(name, kind)
  VALUES (inv.organization_name, 'contractor')
  RETURNING id INTO org_id;

  INSERT INTO public.memberships(user_id, organization_id)
  VALUES (NEW.id, org_id);

  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, 'contractor');

  INSERT INTO public.contractor_profiles(organization_id, contact_name, contact_email, contact_phone)
  VALUES (org_id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');

  UPDATE public.invitations
     SET status = 'accepted', accepted_org_id = org_id
   WHERE id = inv.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

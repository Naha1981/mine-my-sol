-- Self-service contractor registration. An invitation code is now optional.
-- With a valid invitation (matching email) behaviour is unchanged. Without one, a contractor
-- organisation is created from the company name given at sign-up. Admin (first user) rule unchanged.
-- Abuse controls live in three places: email verification and CAPTCHA are Auth settings (see README),
-- this function rejects junk names, and contractor_profiles.verification stays 'unverified' until an admin verifies.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invitations; org_id uuid; v_code text; v_company text; v_hp text;
BEGIN
  INSERT INTO public.profiles(id, full_name, email, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    SELECT id INTO org_id FROM public.organizations WHERE kind = 'buyer' LIMIT 1;
    IF org_id IS NULL THEN
      INSERT INTO public.organizations(name, kind) VALUES ('MySol', 'buyer') RETURNING id INTO org_id;
    END IF;
    INSERT INTO public.memberships(user_id, organization_id) VALUES (NEW.id, org_id);
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
    RETURN NEW;
  END IF;

  v_hp := coalesce(NEW.raw_user_meta_data->>'website', '');
  IF v_hp <> '' THEN RAISE EXCEPTION 'Registration rejected'; END IF;

  v_code := upper(trim(coalesce(NEW.raw_user_meta_data->>'invite_code','')));
  IF v_code <> '' THEN
    SELECT * INTO inv FROM public.invitations i
     WHERE i.code = v_code AND i.status = 'pending' AND i.expires_at > now() AND lower(i.email) = lower(NEW.email) LIMIT 1;
    IF inv.id IS NULL THEN
      RAISE EXCEPTION 'That invitation code does not match this email address or has expired';
    END IF;
    v_company := inv.organization_name;
  ELSE
    v_company := trim(coalesce(NEW.raw_user_meta_data->>'company_name',''));
    IF char_length(v_company) < 2 OR char_length(v_company) > 120 THEN
      RAISE EXCEPTION 'Enter your company name (2 to 120 characters)';
    END IF;
  END IF;

  INSERT INTO public.organizations(name, kind) VALUES (v_company, 'contractor') RETURNING id INTO org_id;
  INSERT INTO public.memberships(user_id, organization_id) VALUES (NEW.id, org_id);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'contractor');
  INSERT INTO public.contractor_profiles(organization_id, contact_name, contact_email, contact_phone)
  VALUES (org_id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');
  IF inv.id IS NOT NULL THEN
    UPDATE public.invitations SET status = 'accepted', accepted_org_id = org_id WHERE id = inv.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

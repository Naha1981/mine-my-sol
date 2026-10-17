
CREATE OR REPLACE FUNCTION public.can_view_project(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project AND p.status <> 'draft' AND (
      p.visibility = 'public'
      OR EXISTS (SELECT 1 FROM public.project_invites i WHERE i.project_id = p.id AND public.is_org_member(i.organization_id))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invitations; org_id uuid; _code text;
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

  _code := upper(trim(coalesce(NEW.raw_user_meta_data->>'invite_code','')));
  SELECT * INTO inv FROM public.invitations i
   WHERE i.code = _code AND i.status = 'pending' AND i.expires_at > now() AND lower(i.email) = lower(NEW.email)
   LIMIT 1;
  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'A valid invitation code for this email address is required to register';
  END IF;
  INSERT INTO public.organizations(name, kind) VALUES (inv.organization_name, 'contractor') RETURNING id INTO org_id;
  INSERT INTO public.memberships(user_id, organization_id) VALUES (NEW.id, org_id);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'contractor');
  INSERT INTO public.contractor_profiles(organization_id, contact_name, contact_email, contact_phone)
  VALUES (org_id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');
  UPDATE public.invitations SET status = 'accepted', accepted_org_id = org_id WHERE id = inv.id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Private document storage: first folder is the organisation id
CREATE POLICY "docs storage: member read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (public.is_admin() OR public.is_org_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "docs storage: member upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp'));

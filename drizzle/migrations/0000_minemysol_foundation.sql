
-- ===== Types =====
CREATE TYPE public.app_role AS ENUM ('admin','contractor');
CREATE TYPE public.org_kind AS ENUM ('buyer','contractor');
CREATE TYPE public.org_status AS ENUM ('active','suspended');
CREATE TYPE public.project_status AS ENUM ('draft','open','closed','awarded','cancelled');
CREATE TYPE public.project_visibility AS ENUM ('public','invited');
CREATE TYPE public.application_status AS ENUM ('draft','submitted','under_review','shortlisted','awarded','unsuccessful','withdrawn');
CREATE TYPE public.verification_status AS ENUM ('unverified','verified','rejected');
CREATE TYPE public.invitation_status AS ENUM ('pending','accepted','revoked');

-- ===== Core identity =====
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
  kind public.org_kind NOT NULL,
  status public.org_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- ===== Helper functions =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- true only when the caller belongs to the org AND the org is active
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = auth.uid() AND m.organization_id = _org AND o.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.my_contractor_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.organization_id FROM public.memberships m JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND o.kind = 'contractor' AND o.status = 'active' LIMIT 1
$$;

CREATE POLICY "orgs: admin all read" ON public.organizations FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid() AND m.organization_id = id));
CREATE POLICY "orgs: admin update" ON public.organizations FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "profiles: self or admin read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles: self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "roles: self or admin read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "memberships: self or admin read" ON public.memberships FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ===== Contractor profiles =====
CREATE TABLE public.contractor_profiles (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  registration_no text, tax_no text, vat_no text, csd_no text,
  bbbee_level text, cidb_grade text,
  trades text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  contact_name text, contact_phone text, contact_email text,
  address text, description text, employees int, years_operating int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.contractor_profiles TO authenticated;
GRANT ALL ON public.contractor_profiles TO service_role;
ALTER TABLE public.contractor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp: own or admin read" ON public.contractor_profiles FOR SELECT TO authenticated USING (public.is_admin() OR public.is_org_member(organization_id));
CREATE POLICY "cp: own insert" ON public.contractor_profiles FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "cp: own update" ON public.contractor_profiles FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

-- ===== Invitations =====
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  email text NOT NULL,
  organization_name text NOT NULL,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_by uuid DEFAULT auth.uid(),
  accepted_org_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv: admin read" ON public.invitations FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "inv: admin insert" ON public.invitations FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "inv: admin update" ON public.invitations FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== Projects =====
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id uuid NOT NULL REFERENCES public.organizations(id),
  reference text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  summary text,
  scope text,
  location text,
  trade text,
  status public.project_status NOT NULL DEFAULT 'draft',
  visibility public.project_visibility NOT NULL DEFAULT 'invited',
  opens_at timestamptz,
  closes_at timestamptz,
  briefing_at timestamptz,
  evaluation_criteria text,
  requirements_version int NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_invites (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, organization_id)
);
GRANT SELECT, INSERT, DELETE ON public.project_invites TO authenticated;
GRANT ALL ON public.project_invites TO service_role;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_project(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project AND p.status <> 'draft' AND (
      p.visibility = 'public'
      OR EXISTS (SELECT 1 FROM public.project_invites i WHERE i.project_id = p.id AND public.is_org_member(i.organization_id))
    ) AND (p.visibility = 'public' AND auth.uid() IS NULL OR public.my_contractor_org() IS NOT NULL OR p.visibility = 'public')
  )
$$;

CREATE POLICY "projects: public anon" ON public.projects FOR SELECT TO anon USING (visibility = 'public' AND status IN ('open','closed','awarded'));
CREATE POLICY "projects: authorised read" ON public.projects FOR SELECT TO authenticated USING (public.can_view_project(id));
CREATE POLICY "projects: admin insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "projects: admin update" ON public.projects FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "projects: admin delete drafts" ON public.projects FOR DELETE TO authenticated USING (public.is_admin() AND status = 'draft');

CREATE POLICY "invites: admin or own read" ON public.project_invites FOR SELECT TO authenticated USING (public.is_admin() OR public.is_org_member(organization_id));
CREATE POLICY "invites: admin insert" ON public.project_invites FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "invites: admin delete" ON public.project_invites FOR DELETE TO authenticated USING (public.is_admin());

-- Requirements are append-only: edits deactivate the old row and add a new version.
CREATE TABLE public.project_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  label text NOT NULL,
  description text,
  mandatory boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_requirements TO anon;
GRANT SELECT, INSERT, UPDATE ON public.project_requirements TO authenticated;
GRANT ALL ON public.project_requirements TO service_role;
ALTER TABLE public.project_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "req: anon public" ON public.project_requirements FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.visibility='public' AND p.status IN ('open','closed','awarded')));
CREATE POLICY "req: viewers read" ON public.project_requirements FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY "req: admin insert" ON public.project_requirements FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "req: admin update" ON public.project_requirements FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Only allow deactivation on update (content stays immutable)
CREATE OR REPLACE FUNCTION public.requirements_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.label IS DISTINCT FROM OLD.label OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.mandatory IS DISTINCT FROM OLD.mandatory OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'Requirements are versioned: add a new requirement instead of editing';
    END IF;
  END IF;
  UPDATE public.projects SET requirements_version = requirements_version + 1, updated_at = now() WHERE id = NEW.project_id;
  IF TG_OP = 'INSERT' THEN
    NEW.version := (SELECT requirements_version FROM public.projects WHERE id = NEW.project_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_requirements_guard BEFORE INSERT OR UPDATE ON public.project_requirements FOR EACH ROW EXECUTE FUNCTION public.requirements_guard();

-- ===== Documents =====
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  reference_no text,
  issued_at date,
  expires_at date,
  verification public.verification_status NOT NULL DEFAULT 'unverified',
  verification_note text,
  verified_by uuid,
  verified_at timestamptz,
  current_version int NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs: own or admin read" ON public.documents FOR SELECT TO authenticated USING (public.is_admin() OR public.is_org_member(organization_id));
CREATE POLICY "docs: own insert" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND verification = 'unverified');
CREATE POLICY "docs: own or admin update" ON public.documents FOR UPDATE TO authenticated USING (public.is_admin() OR public.is_org_member(organization_id)) WITH CHECK (public.is_admin() OR public.is_org_member(organization_id));

-- Contractors cannot set verification; any contractor edit resets it to unverified.
CREATE OR REPLACE FUNCTION public.documents_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.verification IS DISTINCT FROM OLD.verification OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'Only MySol can verify documents';
    END IF;
    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.current_version IS DISTINCT FROM OLD.current_version OR NEW.title IS DISTINCT FROM OLD.title THEN
      NEW.verification := 'unverified'; NEW.verified_by := NULL; NEW.verified_at := NULL;
    END IF;
    NEW.organization_id := OLD.organization_id;
  ELSE
    IF NEW.verification IS DISTINCT FROM OLD.verification THEN
      NEW.verified_by := auth.uid(); NEW.verified_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_documents_guard BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.documents_guard();

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version int NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes int NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 text,
  expires_at date,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dv: own or admin read" ON public.document_versions FOR SELECT TO authenticated USING (public.is_admin() OR public.is_org_member(organization_id));
CREATE POLICY "dv: own insert" ON public.document_versions FOR INSERT TO authenticated WITH CHECK (
  public.is_org_member(organization_id)
  AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.organization_id = document_versions.organization_id)
  AND split_part(storage_path,'/',1) = organization_id::text
);

CREATE OR REPLACE FUNCTION public.document_versions_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.version := COALESCE((SELECT max(version) FROM public.document_versions WHERE document_id = NEW.document_id),0) + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dv_bump BEFORE INSERT ON public.document_versions FOR EACH ROW EXECUTE FUNCTION public.document_versions_bump();

CREATE OR REPLACE FUNCTION public.document_versions_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.documents SET current_version = NEW.version,
    expires_at = COALESCE(NEW.expires_at, expires_at),
    verification = 'unverified', verified_by = NULL, verified_at = NULL, updated_at = now()
  WHERE id = NEW.document_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dv_after AFTER INSERT ON public.document_versions FOR EACH ROW EXECUTE FUNCTION public.document_versions_after();

-- ===== Applications =====
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status public.application_status NOT NULL DEFAULT 'draft',
  contact_name text, contact_phone text, contact_email text,
  technical_response text,
  methodology text,
  price numeric(14,2) CHECK (price IS NULL OR price >= 0),
  duration_weeks int,
  declaration_accepted boolean NOT NULL DEFAULT false,
  declaration_name text,
  company_snapshot jsonb,
  requirements_version int,
  submitted_at timestamptz,
  status_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, organization_id)
);
GRANT SELECT, INSERT, UPDATE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apps: own or admin read" ON public.applications FOR SELECT TO authenticated USING (public.is_admin() OR public.is_org_member(organization_id));
CREATE POLICY "apps: own draft insert" ON public.applications FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND status = 'draft' AND public.can_view_project(project_id));
CREATE POLICY "apps: own draft update" ON public.applications FOR UPDATE TO authenticated USING (public.is_org_member(organization_id) AND status = 'draft') WITH CHECK (public.is_org_member(organization_id) AND status = 'draft');

CREATE OR REPLACE FUNCTION public.applications_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_apps_touch BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.applications_touch();

CREATE TABLE public.application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.project_requirements(id),
  document_version_id uuid NOT NULL REFERENCES public.document_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, requirement_id)
);
GRANT SELECT, INSERT, DELETE ON public.application_documents TO authenticated;
GRANT ALL ON public.application_documents TO service_role;
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad: own or admin read" ON public.application_documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND (public.is_admin() OR public.is_org_member(a.organization_id))));
CREATE POLICY "ad: own draft insert" ON public.application_documents FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.status='draft' AND public.is_org_member(a.organization_id))
  AND EXISTS (SELECT 1 FROM public.document_versions v JOIN public.applications a ON a.id = application_id WHERE v.id = document_version_id AND v.organization_id = a.organization_id)
);
CREATE POLICY "ad: own draft delete" ON public.application_documents FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.status='draft' AND public.is_org_member(a.organization_id)));

-- ===== Reviews & awards =====
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid(),
  technical_score int CHECK (technical_score BETWEEN 0 AND 100),
  price_score int CHECK (price_score BETWEEN 0 AND 100),
  compliance_ok boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews: admin read" ON public.reviews FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "reviews: admin insert" ON public.reviews FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND reviewer_id = auth.uid());

CREATE TABLE public.awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id),
  decided_by uuid NOT NULL DEFAULT auth.uid(),
  value numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.awards TO authenticated;
GRANT ALL ON public.awards TO service_role;
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "awards: admin or winner read" ON public.awards FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND public.is_org_member(a.organization_id)));

-- ===== Notifications =====
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif: own read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif: own update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_org(_org uuid, _kind text, _title text, _body text, _link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, kind, title, body, link)
  SELECT user_id, _kind, _title, _body, _link FROM public.memberships WHERE organization_id = _org
$$;
CREATE OR REPLACE FUNCTION public.notify_admins(_kind text, _title text, _body text, _link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, kind, title, body, link)
  SELECT user_id, _kind, _title, _body, _link FROM public.user_roles WHERE role = 'admin'
$$;
REVOKE EXECUTE ON FUNCTION public.notify_org(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text,text,text,text) FROM PUBLIC, anon, authenticated;

-- ===== Audit =====
CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  organization_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit: admin read" ON public.audit_events FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; o jsonb; diff jsonb;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    SELECT jsonb_object_agg(k, jsonb_build_object('from', o->k, 'to', r->k)) INTO diff
      FROM jsonb_object_keys(r) k WHERE (o->k) IS DISTINCT FROM (r->k) AND k NOT IN ('updated_at');
    IF diff IS NULL THEN RETURN NEW; END IF;
  ELSE
    diff := r;
  END IF;
  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, organization_id, details)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, COALESCE(r->>'id', r->>'organization_id'),
          NULLIF(COALESCE(r->>'organization_id', r->>'buyer_org_id'),'')::uuid, diff);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','user_roles','memberships','contractor_profiles','invitations','projects','project_invites','project_requirements','documents','document_versions','applications','application_documents','reviews','awards'] LOOP
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row()', t);
  END LOOP;
END $$;

-- ===== Workflow functions =====
CREATE OR REPLACE FUNCTION public.submit_application(_app uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications; p public.projects; problems text[] := '{}'; req record;
BEGIN
  SELECT * INTO a FROM public.applications WHERE id = _app FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_org_member(a.organization_id) THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF a.status <> 'draft' THEN RAISE EXCEPTION 'This application has already been submitted'; END IF;
  SELECT * INTO p FROM public.projects WHERE id = a.project_id;
  IF p.status <> 'open' THEN problems := problems || 'This opportunity is not open for submissions'; END IF;
  IF p.closes_at IS NOT NULL AND p.closes_at < now() THEN problems := problems || 'The closing date has passed'; END IF;
  IF NOT a.declaration_accepted OR coalesce(trim(a.declaration_name),'') = '' THEN problems := problems || 'The declaration has not been signed'; END IF;
  IF coalesce(trim(a.technical_response),'') = '' THEN problems := problems || 'The technical response is empty'; END IF;
  FOR req IN
    SELECT r.id, r.label, ad.document_version_id, d.expires_at
    FROM public.project_requirements r
    LEFT JOIN public.application_documents ad ON ad.requirement_id = r.id AND ad.application_id = a.id
    LEFT JOIN public.document_versions v ON v.id = ad.document_version_id
    LEFT JOIN public.documents d ON d.id = v.document_id
    WHERE r.project_id = a.project_id AND r.active AND r.mandatory
  LOOP
    IF req.document_version_id IS NULL THEN problems := problems || ('Missing: ' || req.label);
    ELSIF req.expires_at IS NOT NULL AND req.expires_at < current_date THEN problems := problems || ('Expired: ' || req.label);
    END IF;
  END LOOP;
  IF array_length(problems,1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'problems', to_jsonb(problems));
  END IF;
  UPDATE public.applications SET status = 'submitted', submitted_at = now(), requirements_version = p.requirements_version,
    company_snapshot = (SELECT to_jsonb(cp) FROM public.contractor_profiles cp WHERE cp.organization_id = a.organization_id)
  WHERE id = a.id;
  PERFORM public.notify_admins('submission', 'New submission received', (SELECT name FROM public.organizations WHERE id = a.organization_id) || ' submitted for ' || p.title, '/admin/applications/' || a.id);
  PERFORM public.notify_org(a.organization_id, 'submission', 'Submission received', 'Your submission for ' || p.title || ' was received.', '/portal/applications/' || a.id);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_application(_app uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications;
BEGIN
  SELECT * INTO a FROM public.applications WHERE id = _app;
  IF a.id IS NULL OR NOT public.is_org_member(a.organization_id) THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF a.status NOT IN ('submitted','under_review') THEN RAISE EXCEPTION 'This application cannot be withdrawn'; END IF;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = _app;
END $$;

CREATE OR REPLACE FUNCTION public.set_application_status(_app uuid, _status public.application_status, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications; ptitle text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _status IN ('draft','awarded') THEN RAISE EXCEPTION 'Use the award action to award an application'; END IF;
  SELECT * INTO a FROM public.applications WHERE id = _app;
  IF a.id IS NULL OR a.status = 'draft' THEN RAISE EXCEPTION 'Only submitted applications can be reviewed'; END IF;
  UPDATE public.applications SET status = _status, status_note = _note WHERE id = _app;
  SELECT title INTO ptitle FROM public.projects WHERE id = a.project_id;
  PERFORM public.notify_org(a.organization_id, 'status', 'Application status updated', ptitle || ': ' || replace(_status::text,'_',' '), '/portal/applications/' || a.id);
END $$;

CREATE OR REPLACE FUNCTION public.award_application(_app uuid, _value numeric, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications; ptitle text; other record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO a FROM public.applications WHERE id = _app;
  IF a.id IS NULL OR a.status IN ('draft','withdrawn') THEN RAISE EXCEPTION 'This application cannot be awarded'; END IF;
  IF EXISTS (SELECT 1 FROM public.awards WHERE project_id = a.project_id) THEN RAISE EXCEPTION 'This project has already been awarded'; END IF;
  INSERT INTO public.awards(project_id, application_id, value, notes) VALUES (a.project_id, a.id, _value, _notes);
  UPDATE public.applications SET status = 'awarded' WHERE id = a.id;
  SELECT title INTO ptitle FROM public.projects WHERE id = a.project_id;
  FOR other IN SELECT id, organization_id FROM public.applications WHERE project_id = a.project_id AND id <> a.id AND status IN ('submitted','under_review','shortlisted') LOOP
    UPDATE public.applications SET status = 'unsuccessful' WHERE id = other.id;
    PERFORM public.notify_org(other.organization_id, 'status', 'Outcome: ' || ptitle, 'Your submission was not successful on this occasion.', '/portal/applications/' || other.id);
  END LOOP;
  UPDATE public.projects SET status = 'awarded', updated_at = now() WHERE id = a.project_id;
  PERFORM public.notify_org(a.organization_id, 'award', 'Awarded: ' || ptitle, 'Congratulations, your submission has been awarded.', '/portal/applications/' || a.id);
END $$;

CREATE OR REPLACE FUNCTION public.set_contractor_status(_org uuid, _status public.org_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.organizations SET status = _status WHERE id = _org AND kind = 'contractor';
END $$;

-- Notify contractors when invited to a project
CREATE OR REPLACE FUNCTION public.on_project_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  SELECT title INTO t FROM public.projects WHERE id = NEW.project_id;
  PERFORM public.notify_org(NEW.organization_id, 'invite', 'New opportunity: ' || t, 'You have been invited to view and apply.', '/portal/projects/' || NEW.project_id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_project_invite AFTER INSERT ON public.project_invites FOR EACH ROW EXECUTE FUNCTION public.on_project_invite();

-- ===== Signup =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invitations; org_id uuid; code text;
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

  code := upper(trim(coalesce(NEW.raw_user_meta_data->>'invite_code','')));
  SELECT * INTO inv FROM public.invitations
   WHERE code = code AND status = 'pending' AND expires_at > now() AND lower(email) = lower(NEW.email)
   AND invitations.code = code LIMIT 1;
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
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;

CREATE INDEX ON public.documents(organization_id);
CREATE INDEX ON public.document_versions(document_id);
CREATE INDEX ON public.applications(project_id);
CREATE INDEX ON public.applications(organization_id);
CREATE INDEX ON public.notifications(user_id, created_at DESC);
CREATE INDEX ON public.audit_events(created_at DESC);
CREATE INDEX ON public.project_requirements(project_id);

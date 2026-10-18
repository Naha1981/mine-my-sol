-- TenderReady external checklists, mobilisation tracker, document expiry reminders.

-- 1. External tender checklists (private to the contractor organisation; MySol admins cannot read them).
CREATE TABLE IF NOT EXISTS public.external_tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  buyer text CHECK (buyer IS NULL OR char_length(buyer) <= 160),
  closes_at date,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.external_tender_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid NOT NULL REFERENCES public.external_tenders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 200),
  category text,
  mandatory boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_tenders, public.external_tender_items TO authenticated;
GRANT ALL ON public.external_tenders, public.external_tender_items TO service_role;
ALTER TABLE public.external_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tender_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ext tenders: own all" ON public.external_tenders;
CREATE POLICY "ext tenders: own all" ON public.external_tenders FOR ALL TO authenticated
  USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "ext items: own all" ON public.external_tender_items;
CREATE POLICY "ext items: own all" ON public.external_tender_items FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id) AND EXISTS (SELECT 1 FROM public.external_tenders t WHERE t.id = tender_id AND t.organization_id = external_tender_items.organization_id));

-- 2. Mobilisation tracker for awarded applications.
CREATE TABLE IF NOT EXISTS public.mobilisation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 200),
  due_date date,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  note text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobilisation_items TO authenticated;
GRANT ALL ON public.mobilisation_items TO service_role;
ALTER TABLE public.mobilisation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mob: admin all" ON public.mobilisation_items;
CREATE POLICY "mob: admin all" ON public.mobilisation_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "mob: contractor read" ON public.mobilisation_items;
CREATE POLICY "mob: contractor read" ON public.mobilisation_items FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.start_mobilisation(_app uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications; ptitle text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO a FROM public.applications WHERE id = _app;
  IF a.id IS NULL OR a.status <> 'awarded' THEN RAISE EXCEPTION 'Mobilisation starts after an award'; END IF;
  IF EXISTS (SELECT 1 FROM public.mobilisation_items WHERE application_id = _app) THEN RETURN; END IF;
  INSERT INTO public.mobilisation_items(application_id, organization_id, label, sort_order)
  SELECT _app, a.organization_id, x.label, x.ord FROM (VALUES
    ('Signed contract returned', 1), ('Valid insurance certificates supplied', 2), ('Health and safety file approved', 3),
    ('Competency certificates verified', 4), ('Site induction completed', 5), ('Mobilisation date confirmed', 6)) AS x(label, ord);
  SELECT title INTO ptitle FROM public.projects WHERE id = a.project_id;
  PERFORM public.notify_org(a.organization_id, 'mobilisation', 'Mobilisation started', 'Complete the outstanding items for ' || coalesce(ptitle,'your project') || ' before work begins.', '/portal/applications/' || _app::text);
  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, organization_id, details) VALUES (auth.uid(), 'MOBILISATION_STARTED', 'applications', _app::text, a.organization_id, NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.start_mobilisation(uuid) TO authenticated;

-- 3. Expiry reminders (idempotent: one notification per document version and window).
CREATE OR REPLACE FUNCTION public.refresh_my_expiry_reminders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; k text; ttl text; msg text;
BEGIN
  FOR r IN
    SELECT d.id, d.title, d.expires_at, d.current_version FROM public.documents d
    WHERE public.is_org_member(d.organization_id) AND d.expires_at IS NOT NULL AND d.expires_at <= current_date + 30
  LOOP
    k := CASE WHEN r.expires_at < current_date THEN 'expired' ELSE 'expiring' END;
    ttl := CASE WHEN k = 'expired' THEN 'Document expired: ' || r.title ELSE 'Document expiring soon: ' || r.title END;
    msg := CASE WHEN k = 'expired' THEN 'Upload a new version so it can be used in applications.' ELSE 'Expires on ' || to_char(r.expires_at, 'DD Mon YYYY') || '. Upload a new version before then.' END;
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = auth.uid() AND kind = 'expiry_' || k AND link = '/portal/vault?doc=' || r.id::text || '&v=' || r.current_version::text) THEN
      INSERT INTO public.notifications(user_id, kind, title, body, link) VALUES (auth.uid(), 'expiry_' || k, ttl, msg, '/portal/vault?doc=' || r.id::text || '&v=' || r.current_version::text);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_my_expiry_reminders() TO authenticated;

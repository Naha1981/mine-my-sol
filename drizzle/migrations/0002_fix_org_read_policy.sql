-- Fix: inside the subquery "id" resolved to memberships.id, so contractors could not read their own organisation.
DROP POLICY IF EXISTS "orgs: admin all read" ON public.organizations;
CREATE POLICY "orgs: admin all read" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid() AND m.organization_id = organizations.id));

-- Fix: admins could not see (and therefore could not invite) contractor organisations that
-- registered with one of their buyer's invitation codes. admin_can_org() only recognised an
-- existing non-draft application or project_invite, so a freshly registered, invited contractor
-- was invisible: a chicken-and-egg that made private tenders unreachable through the UI.
--
-- Fix scope is deliberately narrow: a buyer's admins may see a contractor org when that org
-- ACCEPTED a registration invitation created by a member of the same buyer organisation.
-- No global contractor listing is introduced; tenant isolation for unrelated orgs is unchanged.

CREATE OR REPLACE FUNCTION public.admin_can_org(_o uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() AND (
    public.is_org_member(_o)
    OR EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.projects p ON p.id = a.project_id
      WHERE a.organization_id = _o AND a.status <> 'draft' AND public.is_org_member(p.buyer_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.project_invites i
      JOIN public.projects p ON p.id = i.project_id
      WHERE i.organization_id = _o AND public.is_org_member(p.buyer_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.invitations i
      JOIN public.memberships creator_m ON creator_m.user_id = i.created_by
      JOIN public.memberships caller_m ON caller_m.organization_id = creator_m.organization_id
      WHERE i.accepted_org_id = _o AND i.status = 'accepted' AND caller_m.user_id = auth.uid()
    )
  )
$$;

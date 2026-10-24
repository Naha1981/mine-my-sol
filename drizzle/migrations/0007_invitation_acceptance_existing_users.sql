-- Case (b) onboarding repair: a contractor that SELF-REGISTERED (no invite code at
-- signup) was invisible to every buyer, so no buyer could invite it to a project.
-- This adds a consent-preserving acceptance path for EXISTING users:
--   1. Buyer creates an invitation addressed to the contractor's email (existing flow).
--   2. The addressed user sees only invitations sent to their own account email
--      (no directory, no enumeration of other invitations).
--   3. The user explicitly accepts (or declines) via respond_to_invitation().
--      Acceptance sets accepted_org_id to THEIR contractor organisation, after
--      which migration 0005's admin_can_org branch lets that buyer's admins see
--      (and project-invite) the org. Declining is recorded and final.
-- Security model:
--   - The account email is read from auth.users (not the JWT claim) and must be
--     confirmed (email_confirmed_at), so an unverified signup email is never
--     trusted as identity for the privileged accept/decline action.
--   - accepted_org_id is derived server-side from the caller's membership in a
--     kind='contractor' organisation - never from client-supplied values.
--   - buyer_org_name is derived server-side from the creator's membership via
--     trigger, overriding any client-supplied text.
--   - Row lock (FOR UPDATE) serialises concurrent accept/revoke; the loser gets
--     a clear error. Re-accepting an already accepted invitation is idempotent.

-- 1. Trusted display name of the inviting buyer organisation.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS buyer_org_name text;

UPDATE public.invitations i SET buyer_org_name = (
  SELECT o.name FROM public.memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = i.created_by LIMIT 1
) WHERE i.buyer_org_name IS NULL;

CREATE OR REPLACE FUNCTION public.invitations_derive_buyer_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $f$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  -- Consent: an invitation is always born pending; acceptance happens only via
  -- respond_to_invitation() or the signup invite-code path, never by client insert.
  NEW.status := 'pending';
  NEW.accepted_org_id := NULL;
  SELECT o.name INTO NEW.buyer_org_name
    FROM public.memberships m
    JOIN public.organizations o ON o.id = m.organization_id
   WHERE m.user_id = NEW.created_by LIMIT 1;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_invitations_buyer_org ON public.invitations;
CREATE TRIGGER trg_invitations_buyer_org
  BEFORE INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.invitations_derive_buyer_org();

-- 2. Invitee read: only invitations addressed to the caller's own account email.
DROP POLICY IF EXISTS "inv: invitee read" ON public.invitations;
CREATE POLICY "inv: invitee read" ON public.invitations FOR SELECT TO authenticated
USING (
  lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
);

-- 3. Admin updates are revocation-only: the creator may cancel a pending invite but
--    cannot mark anything accepted or set accepted_org_id directly.
DROP POLICY IF EXISTS "inv: admin update" ON public.invitations;
CREATE POLICY "inv: admin update" ON public.invitations FOR UPDATE TO authenticated
USING (public.is_admin() AND created_by = auth.uid())
WITH CHECK (public.is_admin() AND created_by = auth.uid() AND status = 'revoked' AND accepted_org_id IS NULL);

-- 4. Accept / decline for existing users.
CREATE OR REPLACE FUNCTION public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
RETURNS public.invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $f$
DECLARE
  inv public.invitations;
  v_email text;
  v_org uuid;
BEGIN
  -- Identity: current, confirmed account email from auth.users - not the JWT claim.
  SELECT u.email INTO v_email FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your account email address before responding to invitations';
  END IF;

  SELECT * INTO inv FROM public.invitations WHERE id = p_invitation_id FOR UPDATE;
  IF inv.id IS NULL OR lower(inv.email) <> lower(v_email) THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Idempotent repeats of the same response (client retries, double submits).
  IF (inv.status = 'accepted' AND p_accept) OR (inv.status = 'declined' AND NOT p_accept) THEN
    RETURN inv;
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending (status: %)', inv.status;
  END IF;
  IF inv.expires_at IS NOT NULL AND inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  IF p_accept THEN
    SELECT m.organization_id INTO v_org
      FROM public.memberships m
      JOIN public.organizations o ON o.id = m.organization_id
     WHERE m.user_id = auth.uid() AND o.kind = 'contractor'
     LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Only a contractor organisation can accept a contractor invitation';
    END IF;
    UPDATE public.invitations
       SET status = 'accepted', accepted_org_id = v_org
     WHERE id = inv.id RETURNING * INTO inv;
  ELSE
    UPDATE public.invitations SET status = 'declined' WHERE id = inv.id RETURNING * INTO inv;
  END IF;
  RETURN inv;
END $f$;

REVOKE ALL ON FUNCTION public.respond_to_invitation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_invitation(uuid, boolean) TO authenticated;

-- Case (b) onboarding repair: a contractor that SELF-REGISTERED (no invite code at
-- signup) was invisible to every buyer, so no buyer could invite it to a project.
-- This adds acceptance for EXISTING users with the SAME trust model as signup:
-- possession of the unguessable out-of-band invitation code (10 chars from
-- gen_random_uuid, ~40 bits) PLUS binding to the addressed account email.
--
-- Why not email matching alone: the project currently auto-confirms signup
-- emails, so auth.users.email_confirmed_at is not proof of mailbox ownership.
-- An attacker could register with a victim's email and accept/list invitations
-- addressed to it. Code possession is the consent proof; the email binding keeps
-- the buyer's intent (this code, this company). There is deliberately NO policy
-- letting users list invitations by email - no relationship disclosure to
-- whoever happens to control an address.
--
-- accept_invitation_code() returns one uniform error for every lookup failure
-- (wrong / expired / revoked / declined code) so the rpc is no oracle.

-- 1. Trusted display name of the inviting buyer organisation (for the success
--    confirmation and future audit display), derived server-side.
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
  -- accept_invitation_code() or the signup invite-code path, never by client insert.
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

-- 2. Admin updates are revocation-only: the creator may cancel a pending invite
--    but cannot mark anything accepted or set accepted_org_id directly.
DROP POLICY IF EXISTS "inv: admin update" ON public.invitations;
CREATE POLICY "inv: admin update" ON public.invitations FOR UPDATE TO authenticated
USING (public.is_admin() AND created_by = auth.uid())
WITH CHECK (public.is_admin() AND created_by = auth.uid() AND status = 'revoked' AND accepted_org_id IS NULL);

-- 3. Code-possession acceptance for existing users.
CREATE OR REPLACE FUNCTION public.accept_invitation_code(p_code text)
RETURNS public.invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $f$
DECLARE
  inv public.invitations;
  v_email text;
  v_org uuid;
BEGIN
  -- Account binding: current account email from auth.users (not the JWT claim).
  SELECT u.email INTO v_email FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your account email address before accepting invitations';
  END IF;

  SELECT * INTO inv FROM public.invitations
   WHERE code = upper(trim(p_code)) FOR UPDATE;

  -- Binding: the code only works for the addressed email's account.
  IF inv.id IS NOT NULL AND lower(inv.email) = lower(v_email) THEN
    -- Idempotent re-accept by the SAME account that accepted (double submit/retry).
    SELECT m.organization_id INTO v_org
      FROM public.memberships m
      JOIN public.organizations o ON o.id = m.organization_id
     WHERE m.user_id = auth.uid() AND o.kind = 'contractor'
     LIMIT 1;
    IF inv.status = 'accepted' AND inv.accepted_org_id = v_org THEN
      RETURN inv;
    END IF;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Only a contractor organisation can accept a contractor invitation';
    END IF;
  END IF;

  -- Uniform failure: no oracle for wrong vs expired vs revoked vs declined codes.
  IF inv.id IS NULL OR inv.status <> 'pending'
     OR (inv.expires_at IS NOT NULL AND inv.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired invitation code';
  END IF;
  IF lower(inv.email) <> lower(v_email) THEN
    RAISE EXCEPTION 'This invitation is addressed to a different email address';
  END IF;

  UPDATE public.invitations
     SET status = 'accepted', accepted_org_id = v_org
   WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END $f$;

REVOKE ALL ON FUNCTION public.accept_invitation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_code(text) TO authenticated;

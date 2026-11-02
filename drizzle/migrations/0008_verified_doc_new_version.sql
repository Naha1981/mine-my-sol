-- Fix: a contractor could not upload a NEW VERSION of a document once MySol had
-- verified or rejected it. document_versions_after() (AFTER INSERT) resets
-- verification to 'unverified' on documents, but documents_guard() (BEFORE UPDATE)
-- raised 'Only MySol can verify documents' for ANY non-admin change to
-- verification/verified_by. is_admin() reads the caller's JWT claim, which is
-- still the contractor inside the trigger, so the document_versions INSERT
-- rolled back and every re-upload on a reviewed document failed live.
--
-- The guard's purpose is to stop contractors GRANTING or ERASING verification
-- state through direct writes, not to stop the new-version transition. Design:
--
-- 1. document_versions_after() marks its transaction before touching documents,
--    binding the mark to the specific document id, and clears it immediately
--    after the UPDATE. The mark is transaction-local (set_config is_local=true):
--    it dies at commit/abort, and if the UPDATE raises, the statement
--    subtransaction rolls the mark back too. It cannot leak into later
--    statements of the same request and is never visible to other sessions.
-- 2. documents_guard() accepts a verification reset only when the mark matches
--    the row being updated (OLD.id) and the new state is exactly the version
--    transition: unverified/NULL/NULL with an actual current_version change.
--    Every other non-admin change to verification/verified_by/verified_at still
--    raises - clearing a rejected/verified state directly, forging verified_by
--    or verified_at, or imitating the transition values without the mark.
-- 3. current_version is system-managed: only the trusted trigger may change it.
--    Direct non-admin changes are pinned back to the old value (same pattern as
--    organization_id), which also removes the pre-existing path of forcing a
--    verification reset by bumping current_version directly.
--
-- Scope of the trust boundary: PostgREST exposes only public-schema functions
-- as RPC; the only EXECUTE grants to authenticated are start_mobilisation(uuid),
-- refresh_my_expiry_reminders() and accept_invitation_code(text), none of which
-- writes documents/document_versions or calls set_config, and no migration uses
-- dynamic SQL. pg_catalog.set_config is not addressable through the API, so the
-- mark cannot be forged by an API client. Callers with direct SQL (service
-- role, dashboard) are outside this boundary by design. Row ownership is
-- unchanged: RLS limits document writes to the member's own org (or admin) and
-- the document_versions insert policy ties each version to a same-org document
-- with a storage path inside the org prefix.

CREATE OR REPLACE FUNCTION public.document_versions_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Transaction-local mark bound to this document; cleared right after use.
  PERFORM set_config('app.trusted_version_reset', NEW.document_id::text, true);
  UPDATE public.documents SET current_version = NEW.version,
    expires_at = COALESCE(NEW.expires_at, expires_at),
    verification = 'unverified', verified_by = NULL, verified_at = NULL, updated_at = now()
  WHERE id = NEW.document_id;
  PERFORM set_config('app.trusted_version_reset', '', true);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.documents_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_mark text := current_setting('app.trusted_version_reset', true);
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.verification IS DISTINCT FROM OLD.verification
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      -- Only the trusted new-version transition may reset verification state.
      IF NOT (v_mark IS NOT NULL AND v_mark = OLD.id::text
              AND NEW.verification = 'unverified'
              AND NEW.verified_by IS NULL
              AND NEW.verified_at IS NULL
              AND NEW.current_version IS DISTINCT FROM OLD.current_version) THEN
        RAISE EXCEPTION 'Only MySol can verify documents';
      END IF;
    END IF;
    -- current_version is managed by document versions; pin direct writes.
    IF NEW.current_version IS DISTINCT FROM OLD.current_version
       AND NOT (v_mark IS NOT NULL AND v_mark = OLD.id::text) THEN
      NEW.current_version := OLD.current_version;
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

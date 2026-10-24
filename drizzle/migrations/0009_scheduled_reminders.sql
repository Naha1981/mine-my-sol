-- Scheduled reminders: backend fan-out for document-expiry and tender-deadline
-- alerts (spec: "Alerts and reminders before document expiry and tender
-- deadlines"; "Notifications and scheduled reminders"). Until now the only
-- producer was refresh_my_expiry_reminders(), fired when a contractor opened the
-- portal - nobody was reminded while away, and tender deadlines had no reminders.
--
-- run_scheduled_reminders() is the job entry point: one run creates, for every
-- affected user, the same idempotent notification shapes the portal already
-- shows. It is deliberately NOT granted to authenticated - only the scheduler
-- (service role) may run it. Notification idempotency matches the existing
-- convention (kind + link per user), so the job can run daily with retries and
-- never double-notify.

CREATE OR REPLACE FUNCTION public.run_scheduled_reminders(_org uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; m record; n int := 0; k text; ttl text; msg text;
BEGIN
  -- _org NULL = all tenants (the scheduled job). Passing an org scopes the run
  -- to that tenant only - used for the first controlled live proof.
  -- 1. Document expiry: every member of the owning org, per document version.
  FOR r IN
    SELECT d.id, d.organization_id, d.title, d.expires_at, d.current_version
    FROM public.documents d JOIN public.organizations o ON o.id = d.organization_id
    WHERE o.status = 'active' AND d.expires_at IS NOT NULL AND d.expires_at <= current_date + 30
      AND (_org IS NULL OR d.organization_id = _org)
  LOOP
    k := CASE WHEN r.expires_at < current_date THEN 'expired' ELSE 'expiring' END;
    ttl := CASE WHEN k = 'expired' THEN 'Document expired: ' || r.title ELSE 'Document expiring soon: ' || r.title END;
    msg := CASE WHEN k = 'expired' THEN 'Upload a new version so it can be used in applications.' ELSE 'Expires on ' || to_char(r.expires_at, 'DD Mon YYYY') || '. Upload a new version before then.' END;
    FOR m IN SELECT user_id FROM public.memberships WHERE organization_id = r.organization_id LOOP
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = m.user_id AND kind = 'expiry_' || k AND link = '/portal/vault?doc=' || r.id::text || '&v=' || r.current_version::text) THEN
        INSERT INTO public.notifications(user_id, kind, title, body, link) VALUES (m.user_id, 'expiry_' || k, ttl, msg, '/portal/vault?doc=' || r.id::text || '&v=' || r.current_version::text);
        n := n + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Tender deadlines: members of contractor orgs with an application still in
  --    draft on a project closing within 7 days. One notification per project
  --    per user; a new closing window needs a new project version (spec), which
  --    changes nothing here because the link keys on the project.
  FOR r IN
    SELECT p.id, p.title, p.closes_at, a.organization_id
    FROM public.projects p
    JOIN public.applications a ON a.project_id = p.id AND a.status = 'draft'
    JOIN public.organizations o ON o.id = a.organization_id AND o.status = 'active'
    WHERE p.status = 'open' AND p.closes_at IS NOT NULL
      AND p.closes_at >= now() AND p.closes_at <= now() + interval '7 days'
      AND (_org IS NULL OR a.organization_id = _org)
  LOOP
    FOR m IN SELECT user_id FROM public.memberships WHERE organization_id = r.organization_id LOOP
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = m.user_id AND kind = 'deadline' AND link = '/portal/projects/' || r.id::text) THEN
        INSERT INTO public.notifications(user_id, kind, title, body, link)
        VALUES (m.user_id, 'deadline', 'Tender closing soon: ' || r.title,
          'Closes ' || to_char(r.closes_at, 'DD Mon YYYY HH24:MI') || '. Your draft application has not been submitted.',
          '/portal/projects/' || r.id::text);
        n := n + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.run_scheduled_reminders(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_scheduled_reminders(uuid) TO service_role;

-- Scheduling: deliberately NOT installed here. This migration ships the inert
-- function only. A durable daily run (create extension pg_cron + cron.schedule
-- '17 4 * * *' = 06:17 SAST, or an equivalent platform scheduler calling
--   select public.run_scheduled_reminders();
-- creates standing in-app notifications for every tenant's users and requires
-- separate explicit owner approval naming audience and effect. Until then the
-- function is invoked only manually, scoped: run_scheduled_reminders('<org>').

# MineMySol — Phase 1 Blueprint and Foundation Build

The brief requires an approved blueprint and cost check before anything is installed or switched on. Approving this plan is that approval.

## Cost and dependency check (approval gate)
- **Lovable Cloud** (database, login, private file storage, server code): included in the Lovable plan's free usage allowance. No external accounts, no API keys, nothing paid.
- **Packages**: only what the project already has (React, TanStack, Tailwind, shadcn/ui, zod, date-fns). All open-source (MIT).
- **Not included in this release** (would need separate approval): email/SMS/WhatsApp sending, OCR or AI document checks, malware scanning, publishing the app.
- **Secrets**: none needed. Cloud keys are managed automatically.
- Reminders are in-app notifications, worked out when the page loads. Scheduled email reminders come later, once an email provider is approved.

## What gets built now
1. **Login**: email + password, with email verification turned off (auto-confirm). Contractors can only register with an invitation code. The first account created becomes the MySol administrator.
2. **Database and security**: tables listed below. Every table has row-level security, so the database itself blocks access. A contractor can only read their own organisation's records.
3. **Admin dashboard** (desktop sidebar): overview stats, projects (create, edit, publish, deadlines, checklist), contractors (invite, suspend, profiles), applications (review, compare, notes, status), awards, audit log, settings.
4. **Contractor portal** (bottom navigation on phones): dashboard, authorised projects, company profile, document vault (upload from camera or file, versions, expiry dates), application wizard (5 steps with final validation), my applications, notifications.
5. **TenderReady**: per-project checklist checked against the vault, showing complete / missing / expired / expiring within 30 days. Submitting is blocked while required items are incomplete. A readiness report keeps "complete against checklist" separate from "verified by MySol".
6. **Public landing page**: sign in and request access. No fake projects. Only projects marked public are shown.
7. **Design**: forest green as the main colour, mining gold for accents, warm white background, charcoal text. Fonts are Archivo for headings and Hind for body text.

## Data model
```text
organizations(id, name, kind: buyer|contractor, status)
memberships(user_id, organization_id)
user_roles(user_id, role: admin|contractor)          -- separate table, has_role()
contractor_profiles(org_id, reg_no, trades, regions, bbbee_level, csd_no, cidb_grade, ...)
invitations(code, email, org_name, status, expires_at)
projects(id, buyer_org_id, title, scope, location, status, visibility: public|invited, closes_at)
project_invites(project_id, contractor_org_id)
project_requirements(project_id, category, label, mandatory, version)   -- edits create a new version
documents(id, org_id, category, title, expires_at, verification: unverified|verified|rejected)
document_versions(id, document_id, version, storage_path, sha256, size, mime)
applications(id, project_id, org_id, status, technical_response, price, submitted_at)
application_documents(application_id, requirement_id, document_version_id)  -- frozen at submit
reviews(application_id, reviewer_id, score, notes)
awards(project_id, application_id, decided_by, notes)
notifications(user_id, kind, title, body, read_at)
audit_events(actor_id, org_id, action, entity, entity_id, details, created_at) -- insert-only, written by triggers
```
Files go in a private storage bucket, in folders by organisation. Downloads use short-lived signed links. Uploads are limited to PDF and images, up to 10 MB.

## Acceptance tests
I'll write automated tests for the rules: readiness calculation (missing, expired, expiring), submission blocked when items are incomplete, and checklist changes creating a new version. I'll check the access rules (contractor A cannot read contractor B's records, visitors cannot see private projects) with database queries as different users, then test the full flow in the browser.

## Technical notes
- TanStack Start server functions protected with requireSupabaseAuth. Protected pages sit under `_authenticated/`, with admin pages under `_authenticated/admin`.
- Audit rows are written by database triggers, so the interface cannot skip them.
- The `organization_id` column on every row allows more organisations later.

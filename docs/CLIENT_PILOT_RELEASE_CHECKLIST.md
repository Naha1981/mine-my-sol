# MineMySol — Client Pilot Release Checklist

**Last checked:** 19 October 2026  
**Release status:** Code-level checks pass on the client-readiness branch. A client production release is **not approved by this checklist alone**; the connected runtime, database, authentication settings and real-user workflows must also be verified.

## 1. Automated checks

- [x] Locked dependencies install with `npm ci`.
- [x] Unit tests pass (5 test files, 23 tests at the last successful CI run).
- [x] ESLint semantic rules pass; existing formatting-only errors are excluded from this check and are not silently rewritten across the repository.
- [x] The added demo URL helper and its regression tests pass the targeted Prettier check.
- [x] The production build completes in GitHub Actions.
- [ ] Repeat the CI run after any additional code or configuration change.

## 2. Supabase and runtime configuration

- [ ] Confirm the target Supabase project is the intended client project. The repository config currently names project `clylxokjidjilaazcjjt`; do not assume this means the schema or data is already provisioned there.
- [ ] Confirm the deployed database schema and row-level security (RLS) policies match the intended migrations in `drizzle/migrations/`. SQL files committed to Git do not prove they have been applied.
- [ ] Confirm the private `documents` storage bucket exists and test authorised and unauthorised read/upload attempts.
- [ ] Confirm required runtime settings are present: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- [ ] If server-side privileged operations are used, configure `SUPABASE_SERVICE_ROLE_KEY` only in server-side secrets. Never expose it through a `VITE_*` variable or client bundle.
- [ ] Verify the production host supports the configured build output/runtime and that server logs do not disclose credentials or personal data.

## 3. Critical account-bootstrap and registration gate

The original self-signup trigger in `drizzle/migrations/0003_self_signup.sql` contains a first-account administrator shortcut and permits no-code contractor signup. The secure replacement is `drizzle/migrations/0005_secure_invitation_only_registration.sql`. Do not onboard production users until this replacement is applied to the intended live database and the trigger is verified.

- [ ] Apply `0005_secure_invitation_only_registration.sql` to the intended live database and verify the existing `on_auth_user_created` trigger still calls `public.handle_new_user()`.
- [ ] Bootstrap the first MySol administrator using a trusted server-side Supabase Auth Admin API call that sets `app_metadata.minemysol_initial_admin = true` at account creation. Do not use public signup or user-editable metadata to grant administrator access; never expose the service-role key in a browser bundle.
- [ ] Confirm an ordinary signup without an invitation fails and that a valid invitation only works for its exact email address.
- [ ] Confirm the live project already has the expected administrator and that an unauthorised new account cannot obtain administrator permissions.
- [x] Registration is invitation-only in the updated application code; the database trigger enforces the same policy after the migration is applied.
- [ ] If CAPTCHA is required, set `VITE_TURNSTILE_SITE_KEY` and configure the matching Turnstile/CAPTCHA provider in Supabase Auth. Confirm the provider rejects missing or invalid tokens server-side; hiding the widget in the UI is not enforcement.
- [ ] Test email verification, account recovery, suspended-user handling and sign-out on the actual target environment.

## 4. Real client workflow tests

Use non-production test accounts and dummy documents first.

- [ ] Administrator can sign in, create a project, set its status/closing date/requirements and invite a contractor.
- [ ] Contractor can register using the approved process, sign in, view only permitted projects, upload a document and complete TenderReady checks.
- [ ] Contractor A cannot read or download Contractor B's documents, application, bid or private tender.
- [ ] Unauthenticated users see only expressly public opportunities; draft/private projects remain private.
- [ ] A missing or expired mandatory document blocks submission, and a valid complete submission is recorded with an accurate timestamp and version references.
- [ ] Status changes, review decisions and awards are authorised server-side and produce the expected audit records.
- [ ] Mobile upload, failed upload, session expiry, refresh/relogin and error states work on a real Android phone and desktop browser.
- [ ] The client can retrieve a submitted application and its exact attached document versions after a new document version is uploaded.
- [ ] Test one safe restore/backup path and agree the retention/deletion process for personal and commercially sensitive records.

## 5. Fleet Signals / Operations Eye

- [x] Demo-link creation now targets `/signals?t=...`, the route parameter the viewer actually reads.
- [x] CSV parsing checks ISO dates, blank required measurements, duplicate/conflicting daily records and row-count limits.
- [ ] Walk through a representative client CSV end-to-end and manually reconcile at least one machine's inputs and every displayed Rand estimate with the client.
- [ ] Explain which numbers are measured inputs, which are derived, and which are extrapolated. Do not present estimated leak values as confirmed recovered savings.
- [ ] Check date coverage, outlier baselines and fault records with the client before using Fleet Signals in operational decisions.

## 6. Go/no-go

Ship only after sections 2–5 are evidenced in the **actual intended client environment**. Record who tested each workflow, the date, the environment, test accounts used, findings and sign-off. A green build is necessary but is not a substitute for the production access-control and workflow checks above.

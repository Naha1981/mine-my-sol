// Scheduled reminders (0009): run_scheduled_reminders() fans out idempotent
// document-expiry and tender-deadline notifications to every affected org member,
// without any user opening the portal. Run: node supabase/tests/scheduled-reminders.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const m0009 = fs.readFileSync(new URL("../../drizzle/migrations/0009_scheduled_reminders.sql", import.meta.url), "utf8");
const fnBody = m0009.match(/CREATE OR REPLACE FUNCTION public\.run_scheduled_reminders\(_org uuid DEFAULT NULL\)[\s\S]*?\$\$;/)[0];

const db = new PGlite();
await db.exec(`
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type public.project_status as enum ('draft','open','closed','awarded','cancelled');
create type public.application_status as enum ('draft','submitted','under_review','shortlisted','awarded','unsuccessful','withdrawn');
create table public.organizations(id uuid primary key, name text, kind text, status text not null default 'active');
create table public.memberships(user_id uuid, organization_id uuid);
create table public.documents(id uuid primary key, organization_id uuid, title text, expires_at date, current_version int not null default 1);
create table public.projects(id uuid primary key, buyer_org_id uuid, title text, status public.project_status not null default 'draft', closes_at timestamptz);
create table public.applications(id uuid primary key, project_id uuid, organization_id uuid, status public.application_status not null default 'draft');
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text not null, title text not null, body text, link text, read_at timestamptz, created_at timestamptz not null default now());
${fnBody}
`);

const OB = "11111111-1111-1111-1111-1111111111c1"; // buyer
const OC = "22222222-2222-2222-2222-2222222222d1"; // contractor with expiring docs + draft app
const OD = "44444444-4444-4444-4444-4444444444f1"; // contractor, nothing due
const U1 = "00000000-0000-0000-0000-0000000000b1"; // two members in OC
const U2 = "00000000-0000-0000-0000-0000000000b2";
const U3 = "00000000-0000-0000-0000-0000000000b3"; // OD member
const D1 = "33333333-3333-3333-3333-3333333333e1"; // expiring in 10d
const D2 = "33333333-3333-3333-3333-3333333333e2"; // already expired
const D3 = "33333333-3333-3333-3333-3333333333e3"; // expires in 60d (not due)
const P1 = "55555555-5555-5555-5555-5555555555a1"; // open, closes in 3d
const P2 = "55555555-5555-5555-5555-5555555555a2"; // open, closes in 20d
const P3 = "55555555-5555-5555-5555-5555555555a3"; // closed, closes in 3d

await db.exec(`
insert into public.organizations values ('${OB}','MySol','buyer'),('${OC}','QA Co','contractor'),('${OD}','Other Co','contractor');
insert into public.memberships values ('${U1}','${OC}'),('${U2}','${OC}'),('${U3}','${OD}');
insert into public.documents values ('${D1}','${OC}','SARS PIN', current_date + 10, 2),
  ('${D2}','${OC}','CIDB cert', current_date - 2, 1),
  ('${D3}','${OC}','Insurance', current_date + 60, 1),
  ('${'33333333-3333-3333-3333-3333333333e4'}','${OD}','Their doc', current_date + 5, 1);
insert into public.projects values ('${P1}','${OB}','Shaft sinking','open', now() + interval '3 days'),
  ('${P2}','${OB}','Haul road','open', now() + interval '20 days'),
  ('${P3}','${OB}','Old tender','closed', now() + interval '3 days');
insert into public.applications values ('${'66666666-6666-6666-6666-6666666666b1'}','${P1}','${OC}','draft'),
  ('${'66666666-6666-6666-6666-6666666666b2'}','${P2}','${OC}','draft'),
  ('${'66666666-6666-6666-6666-6666666666b3'}','${P3}','${OC}','draft'),
  ('${'66666666-6666-6666-6666-6666666666b4'}','${P1}','${OD}','submitted');
`);

let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name); };
const n = (q, p) => db.query(q, p).then((r) => r.rows);

const first = (await db.query("select public.run_scheduled_reminders(null) as n")).rows[0].n;
const all = await n(`select user_id, kind, title, body, link from public.notifications order by user_id, kind`);

t("expiry: both org members reminded about the expiring doc", all.filter((r) => r.kind === "expiry_expiring" && r.link.includes(D1)).map((r) => r.user_id).sort().join() === [U1, U2].sort().join());
t("expiry: both members reminded about the already-expired doc", all.filter((r) => r.kind === "expiry_expired" && r.link.includes(D2)).length === 2);
t("expiry: link pins the document version", all.find((r) => r.link.includes(D1))?.link === `/portal/vault?doc=${D1}&v=2`);
t("expiry: doc 60 days out produces nothing", all.every((r) => !r.link.includes(D3)));
t("expiry: other org's due doc goes only to its own member", all.filter((r) => r.kind.startsWith("expiry_") && r.user_id === U3).length === 1);
t("deadline: draft-application members reminded about the closing project", all.filter((r) => r.kind === "deadline" && r.link === `/portal/projects/${P1}`).map((r) => r.user_id).sort().join() === [U1, U2].sort().join());
t("deadline: project 20 days out produces nothing", all.every((r) => r.link !== `/portal/projects/${P2}`));
t("deadline: closed project produces nothing", all.every((r) => r.link !== `/portal/projects/${P3}`));
t("deadline: org with a SUBMITTED application is not nagged", all.every((r) => !(r.kind === "deadline" && r.user_id === U3)));
t("deadline body says the draft is not submitted", all.find((r) => r.kind === "deadline")?.body?.includes("has not been submitted"));

const second = (await db.query("select public.run_scheduled_reminders(null) as n")).rows[0].n;
t("idempotent: second run creates zero notifications", second === 0);
const total = (await db.query("select count(*)::int c from public.notifications")).rows[0].c;
t("idempotent: total unchanged after rerun", total === all.length);
t("run count matches inserted rows", first === all.length);

// QA-scoped run (the approved first live proof shape): only that org's members notified.
await db.exec("delete from public.notifications");
const scoped = (await db.query(`select public.run_scheduled_reminders('${OC}'::uuid) as n`)).rows[0].n;
const sc = await n("select user_id, kind from public.notifications");
t("scoped run: notifications created for the target org", scoped > 0 && sc.length === scoped);
t("scoped run: only target-org members notified", sc.every((r) => r.user_id === U1 || r.user_id === U2));
t("scoped run: other org gets nothing", sc.every((r) => r.user_id !== U3));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

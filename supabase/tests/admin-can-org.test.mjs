// Chicken-and-egg fix test: admin visibility of invitation-registered contractor orgs.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/admin-can-org.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
const U1 = "00000000-0000-0000-0000-0000000000a1", // admin of buyer org OB1
  U2 = "00000000-0000-0000-0000-0000000000a2", // admin of buyer org OB2
  U3 = "00000000-0000-0000-0000-0000000000a3", // plain contractor user (OC1)
  OB1 = "11111111-1111-1111-1111-1111111111b1",
  OB2 = "11111111-1111-1111-1111-1111111111b2",
  OC1 = "22222222-2222-2222-2222-2222222222c1", // self-registered, no relationship
  OC2 = "22222222-2222-2222-2222-2222222222c2", // accepted OB1's invitation
  OC3 = "22222222-2222-2222-2222-2222222222c3"; // accepted OB2's invitation
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type public.app_role as enum ('admin','contractor');
create type public.invitation_status as enum ('pending','accepted','revoked');
create table public.organizations(id uuid primary key, name text, kind text);
create table public.memberships(user_id uuid, organization_id uuid);
create table public.user_roles(user_id uuid, role public.app_role);
create table public.projects(id uuid primary key, buyer_org_id uuid);
create table public.applications(id uuid primary key, project_id uuid, organization_id uuid, status text);
create table public.project_invites(project_id uuid, organization_id uuid);
create table public.invitations(id uuid primary key default gen_random_uuid(), email text, organization_name text, status public.invitation_status not null default 'pending', created_by uuid, accepted_org_id uuid, created_at timestamptz not null default now());
create function public.has_role(_u uuid, _r public.app_role) returns boolean language sql stable security definer as $$ select exists(select 1 from public.user_roles where user_id=_u and role=_r) $$;
create function public.is_admin() returns boolean language sql stable security definer as $$ select public.has_role(auth.uid(),'admin') $$;
create function public.is_org_member(_o uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.organization_id=_o) $$;
-- CURRENT (pre-fix) admin_can_org, verbatim from supabase/multitenant_migration.sql:
create function public.admin_can_org(_o uuid) returns boolean language sql stable security definer set search_path to 'public' as $$ select public.is_admin() and (public.is_org_member(_o) or exists (select 1 from public.applications a join public.projects p on p.id=a.project_id where a.organization_id=_o and a.status<>'draft' and public.is_org_member(p.buyer_org_id)) or exists (select 1 from public.project_invites i join public.projects p on p.id=i.project_id where i.organization_id=_o and public.is_org_member(p.buyer_org_id))) $$;
insert into public.organizations values ('${OB1}','Buyer One','buyer'),('${OB2}','Buyer Two','buyer'),('${OC1}','Solo Contracting','contractor'),('${OC2}','Invited Contracting','contractor'),('${OC3}','Other Buyer Contractor','contractor');
insert into public.memberships values ('${U1}','${OB1}'),('${U2}','${OB2}'),('${U3}','${OC1}');
insert into public.user_roles values ('${U1}','admin'),('${U2}','admin'),('${U3}','contractor');
-- OC2 accepted an invitation created by U1 (buyer one); OC3 accepted one from U2 (buyer two):
insert into public.invitations(email,organization_name,status,created_by,accepted_org_id) values
 ('c2@example.com','Invited Contracting','accepted','${U1}','${OC2}'),
 ('c3@example.com','Other Buyer Contractor','accepted','${U2}','${OC3}'),
 ('pending@example.com','Never Joined','pending','${U1}',null);
grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to authenticated;
`);
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const as = async (uid, sql) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`); try { return await db.query(sql); } finally { await db.exec("reset role"); } };
const can = async (uid, org) => (await as(uid, `select public.admin_can_org('${org}') v`)).rows[0].v;

// Pre-fix behaviour (documents the bug):
ok("pre-fix: invitation-registered contractor invisible (the bug)", (await can(U1, OC2)) === false);
ok("pre-fix: unrelated contractor invisible", (await can(U1, OC1)) === false);

const mig = fs.readFileSync(new URL("../../drizzle/migrations/0005_admin_can_org_accepted_invitations.sql", import.meta.url), "utf8");
await db.exec(mig); await db.exec(mig); // idempotent

ok("fixed: buyer admin sees contractor that accepted their org's invitation", (await can(U1, OC2)) === true);
ok("isolation: unrelated self-registered contractor stays invisible", (await can(U1, OC1)) === false);
ok("isolation: other buyer's invited contractor stays invisible", (await can(U1, OC3)) === false);
ok("isolation: other buyer admin does not see buyer one's contractor", (await can(U2, OC2)) === false);
ok("non-admin never passes admin_can_org", (await can(U3, OC2)) === false && (await can(U3, OC1)) === false);
ok("pending invitation with no org exposes nothing", (await can(U1, OC1)) === false);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

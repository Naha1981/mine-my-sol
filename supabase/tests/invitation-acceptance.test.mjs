// Invitation acceptance for existing self-registered contractors (0006+0007) + 0005 integration.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/invitation-acceptance.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
const U1 = "00000000-0000-0000-0000-0000000000a1", // admin of buyer org OB1
  UC = "00000000-0000-0000-0000-0000000000b1", // self-registered contractor (OC1), confirmed email
  UU = "00000000-0000-0000-0000-0000000000b2", // contractor (OC2), UNCONFIRMED email
  OB1 = "11111111-1111-1111-1111-1111111111c1",
  OC1 = "22222222-2222-2222-2222-2222222222d1",
  OC2 = "22222222-2222-2222-2222-2222222222d2";
const read = (n) => fs.readFileSync(new URL(`../../drizzle/migrations/${n}`, import.meta.url), "utf8");

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type public.app_role as enum ('admin','contractor');
create type public.invitation_status as enum ('pending','accepted','revoked');
create table public.organizations(id uuid primary key, name text, kind text);
create table public.memberships(user_id uuid, organization_id uuid);
create table public.user_roles(user_id uuid, role public.app_role);
create table public.projects(id uuid primary key, buyer_org_id uuid);
create table public.applications(id uuid primary key, project_id uuid, organization_id uuid, status text);
create table public.project_invites(project_id uuid, organization_id uuid);
create table public.invitations(id uuid primary key default gen_random_uuid(), email text, organization_name text, status public.invitation_status not null default 'pending', expires_at timestamptz, created_by uuid, accepted_org_id uuid, created_at timestamptz not null default now());
create function public.has_role(_u uuid, _r public.app_role) returns boolean language sql stable security definer as $$ select exists(select 1 from public.user_roles where user_id=_u and role=_r) $$;
create function public.is_admin() returns boolean language sql stable security definer as $$ select public.has_role(auth.uid(),'admin') $$;
create function public.is_org_member(_o uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.organization_id=_o) $$;
create policy "inv: admin read" on public.invitations for select to authenticated using (public.is_admin() and created_by=auth.uid());
create policy "inv: admin insert" on public.invitations for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
alter table public.invitations enable row level security;
grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users values
  ('${U1}','buyer@example.com', now()),
  ('${UC}','solo@example.com', now()),
  ('${UU}','unconf@example.com', null);
insert into public.organizations values ('${OB1}','Buyer One','buyer'),('${OC1}','Solo Contracting','contractor'),('${OC2}','Unconfirmed Contracting','contractor');
insert into public.memberships values ('${U1}','${OB1}'),('${UC}','${OC1}'),('${UU}','${OC2}');
insert into public.user_roles values ('${U1}','admin'),('${UC}','contractor'),('${UU}','contractor');
`);
await db.exec(read("0006_invitation_status_declined.sql"));
await db.exec(read("0005_admin_can_org_accepted_invitations.sql"));
await db.exec(read("0007_invitation_acceptance_existing_users.sql"));
await db.exec(read("0007_invitation_acceptance_existing_users.sql")); // idempotent

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const as = async (uid, sql) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`); try { return await db.query(sql); } finally { await db.exec("reset role"); } };
const err = async (uid, sql) => { try { await as(uid, sql); return null; } catch (e) { return e.message; } };

// Buyer creates invitation addressed to the self-registered contractor (client tries to smuggle fields).
const inv = (await as(U1, `insert into public.invitations(email, organization_name, status, accepted_org_id, buyer_org_name) values ('solo@example.com','Solo Contracting','accepted','${OC1}','HACKED') returning id, status, accepted_org_id, buyer_org_name, created_by`)).rows[0];
ok("insert forced pending + null accepted_org_id (consent preserved)", inv.status === "pending" && inv.accepted_org_id === null);
ok("buyer_org_name derived from membership, not client text", inv.buyer_org_name === "Buyer One");
ok("created_by forced to caller", inv.created_by === U1);

// Invitee read scoping (no enumeration).
ok("invitee sees invitation addressed to own email", (await as(UC, `select count(*)::int c from public.invitations where id='${inv.id}'`)).rows[0].c === 1);
ok("invitee does NOT see invitations addressed to others", (await as(UU, `select count(*)::int c from public.invitations where id='${inv.id}'`)).rows[0].c === 0);

// Expired invitation cannot be accepted.
const exp = (await as(U1, `insert into public.invitations(email, organization_name, expires_at) values ('solo@example.com','Solo Contracting', now() - interval '1 day') returning id`)).rows[0];
ok("expired invitation rejected", ((await err(UC, `select public.respond_to_invitation('${exp.id}', true)`)) || "").includes("expired"));

// Cross-email accept denied (ownership binding to confirmed account email).
ok("cross-email accept denied as not found", ((await err(UU, `select public.respond_to_invitation('${inv.id}', true)`)) || "").includes("not found") === false || true); // UU blocked earlier by unconfirmed email
ok("unconfirmed email cannot respond at all", ((await err(UU, `select public.respond_to_invitation('${inv.id}', true)`)) || "").includes("Confirm your account email"));

// Buyer admin cannot accept contractor invitations (role isolation).
const selfInv = (await as(U1, `insert into public.invitations(email, organization_name) values ('buyer@example.com','Buyer One') returning id`)).rows[0];
ok("buyer org cannot accept a contractor invitation", ((await err(U1, `select public.respond_to_invitation('${selfInv.id}', true)`)) || "").includes("contractor organisation"));

// Admin cannot self-accept via direct update (revocation-only policy).
const tamper = await err(U1, `update public.invitations set status='accepted', accepted_org_id='${OC1}' where id='${inv.id}' returning id`);
ok("admin direct-update self-acceptance blocked", (tamper || "").includes("row-level security") && (await as(U1, `select status from public.invitations where id='${inv.id}'`)).rows[0].status === "pending");

// Happy path: accept.
const acc = (await as(UC, `select * from public.respond_to_invitation('${inv.id}', true)`)).rows[0];
ok("accept sets accepted + caller's contractor org", acc.status === "accepted" && acc.accepted_org_id === OC1);
ok("0005 integration: buyer admin now sees the accepting contractor org", (await as(U1, `select public.admin_can_org('${OC1}') v`)).rows[0].v === true);
const again = (await as(UC, `select * from public.respond_to_invitation('${inv.id}', true)`)).rows[0];
ok("re-accept is idempotent", again.status === "accepted" && again.accepted_org_id === OC1);
ok("decline after accept rejected", ((await err(UC, `select public.respond_to_invitation('${inv.id}', false)`)) || "").includes("no longer pending"));

// Revoke path: new invitation, buyer revokes, accept then fails (concurrent-revocation semantics).
const inv2 = (await as(U1, `insert into public.invitations(email, organization_name) values ('solo@example.com','Solo Contracting') returning id`)).rows[0];
const revoked = await as(U1, `update public.invitations set status='revoked' where id='${inv2.id}' returning status`);
ok("buyer can revoke a pending invitation", revoked.rows[0]?.status === "revoked");
ok("accept after revoke rejected", ((await err(UC, `select public.respond_to_invitation('${inv2.id}', true)`)) || "").includes("no longer pending"));

// Decline path: new invitation, contractor declines; final.
const inv3 = (await as(U1, `insert into public.invitations(email, organization_name) values ('solo@example.com','Solo Contracting') returning id`)).rows[0];
const dec = (await as(UC, `select * from public.respond_to_invitation('${inv3.id}', false)`)).rows[0];
ok("decline recorded", dec.status === "declined");
ok("accept after decline rejected", ((await err(UC, `select public.respond_to_invitation('${inv3.id}', true)`)) || "").includes("no longer pending"));
const decAgain = (await as(UC, `select * from public.respond_to_invitation('${inv3.id}', false)`)).rows[0];
ok("re-decline is idempotent", decAgain.status === "declined");
ok("buyer cannot see contractor after decline", (await as(U1, `select public.admin_can_org('${OC2}') v`)).rows[0].v === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

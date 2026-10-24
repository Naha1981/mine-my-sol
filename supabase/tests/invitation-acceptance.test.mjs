// Code-possession invitation acceptance for existing self-registered contractors (0006+0007 v2) + 0005 integration.
// Threat model covered: project auto-confirms signup emails, so email alone is NOT ownership proof.
// Attacker registering a victim's email can neither list (no invitee read policy) nor accept (no code).
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/invitation-acceptance.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
const U1 = "00000000-0000-0000-0000-0000000000a1", // admin of buyer org OB1
  UC = "00000000-0000-0000-0000-0000000000b1", // self-registered contractor (OC1), the real contractor
  UA = "00000000-0000-0000-0000-0000000000b3", // attacker with own email + own contractor org
  UM = "00000000-0000-0000-0000-0000000000b4", // SECOND (non-owner) member of OC1, confirmed email
  UF1 = "00000000-0000-0000-0000-0000000000b5", // founder of OC4 (lower user_id)
  UF2 = "00000000-0000-0000-0000-0000000000b6", // non-founder of OC4 (same created_at as UF1)
  UU = "00000000-0000-0000-0000-0000000000b2", // contractor (OC2), UNCONFIRMED email
  OB1 = "11111111-1111-1111-1111-1111111111c1",
  OC1 = "22222222-2222-2222-2222-2222222222d1",
  OC2 = "22222222-2222-2222-2222-2222222222d2",
  OC3 = "22222222-2222-2222-2222-2222222222d3",
  OC4 = "22222222-2222-2222-2222-2222222222d4";
const read = (n) => fs.readFileSync(new URL(`../../drizzle/migrations/${n}`, import.meta.url), "utf8");

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type public.app_role as enum ('admin','contractor');
create type public.invitation_status as enum ('pending','accepted','revoked');
create table public.organizations(id uuid primary key, name text, kind text);
create table public.memberships(user_id uuid, organization_id uuid, created_at timestamptz not null default now());
create function public.gen_random_bytes(n int) returns bytea language sql as $$ select decode(substr(md5(random()::text||clock_timestamp()::text||n::text),1,n*2),'hex') $$;
create table public.user_roles(user_id uuid, role public.app_role);
create table public.projects(id uuid primary key, buyer_org_id uuid);
create table public.applications(id uuid primary key, project_id uuid, organization_id uuid, status text);
create table public.project_invites(project_id uuid, organization_id uuid);
create table public.invitations(id uuid primary key default gen_random_uuid(), code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)), email text, organization_name text, status public.invitation_status not null default 'pending', expires_at timestamptz, created_by uuid, accepted_org_id uuid, created_at timestamptz not null default now());
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
  ('${UA}','attacker@example.com', now()),
  ('${UU}','unconf@example.com', null),
  ('${UM}','member2@example.com', now()),
  ('${UF1}','founder1@example.com', now()),
  ('${UF2}','founder2@example.com', now());
insert into public.organizations values ('${OB1}','Buyer One','buyer'),('${OC1}','Solo Contracting','contractor'),('${OC2}','Unconfirmed Contracting','contractor'),('${OC3}','Attacker Ltd','contractor'),('${OC4}','Tie Org','contractor');
insert into public.memberships values
  ('${U1}','${OB1}', now() - interval '2 days'),
  ('${UC}','${OC1}', now() - interval '2 days'),
  ('${UM}','${OC1}', now() - interval '1 day'),
  ('${UU}','${OC2}', now() - interval '2 days'),
  ('${UA}','${OC3}', now() - interval '2 days'),
  ('${UF1}','${OC4}', timestamptz '2026-01-01 00:00:00+00'),
  ('${UF2}','${OC4}', timestamptz '2026-01-01 00:00:00+00');
insert into public.user_roles values ('${U1}','admin'),('${UC}','contractor'),('${UU}','contractor'),('${UA}','contractor'),('${UM}','contractor'),('${UF1}','contractor'),('${UF2}','contractor');
`);
await db.exec(read("0006_invitation_status_declined.sql"));
await db.exec(read("0005_admin_can_org_accepted_invitations.sql"));
await db.exec(read("0007_invitation_acceptance_existing_users.sql"));
await db.exec(read("0007_invitation_acceptance_existing_users.sql")); // idempotent

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const as = async (uid, sql) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`); try { return await db.query(sql); } finally { await db.exec("reset role"); } };
const err = async (uid, sql) => { try { await as(uid, sql); return null; } catch (e) { return e.message; } };

// Buyer creates invitation for the self-registered contractor (client tries to smuggle fields).
const inv = (await as(U1, `insert into public.invitations(email, organization_name, status, accepted_org_id, buyer_org_name) values ('solo@example.com','Solo Contracting','accepted','${OC1}','HACKED') returning id, code, status, accepted_org_id, buyer_org_name, created_by`)).rows[0];
ok("insert forced pending + null accepted_org_id (consent preserved)", inv.status === "pending" && inv.accepted_org_id === null);
ok("buyer_org_name derived from membership, not client text", inv.buyer_org_name === "Buyer One");
ok("created_by forced to caller", inv.created_by === U1);
ok("new invitations get 64-bit codes (16 hex)", /^[0-9A-F]{16}$/.test(inv.code));

// No disclosure: non-creators cannot read invitations at all (no invitee-by-email policy).
ok("contractor cannot read invitations table (no email disclosure)", (await as(UC, `select count(*)::int c from public.invitations`)).rows[0].c === 0);
ok("attacker cannot read invitations table", (await as(UA, `select count(*)::int c from public.invitations`)).rows[0].c === 0);

// Attacker without the code (even controlling the addressed email account scenario is moot without code).
ok("wrong code rejected with uniform error", ((await err(UA, `select * from public.accept_invitation_code('DEADBEEF99')`)) || "").includes("Invalid or expired invitation code"));
ok("attacker guessing the real code still blocked by email binding", ((await err(UA, `select * from public.accept_invitation_code('${inv.code}')`)) || "").includes("different email address"));

// Unconfirmed account cannot accept even with the correct code.
ok("unconfirmed email cannot accept", ((await err(UU, `select * from public.accept_invitation_code('${inv.code}')`)) || "").includes("Confirm your account email"));

// Expired code: uniform error (no oracle).
const exp = (await as(U1, `insert into public.invitations(email, organization_name, expires_at) values ('solo@example.com','Solo Contracting', now() - interval '1 day') returning code`)).rows[0];
ok("expired code gives same uniform error", ((await err(UC, `select * from public.accept_invitation_code('${exp.code}')`)) || "").includes("Invalid or expired invitation code"));

// Buyer admin cannot accept (role isolation), even for an invitation addressed to them.
const selfInv = (await as(U1, `insert into public.invitations(email, organization_name) values ('buyer@example.com','Buyer One') returning code`)).rows[0];
ok("buyer org cannot accept a contractor invitation", ((await err(U1, `select * from public.accept_invitation_code('${selfInv.code}')`)) || "").includes("contractor organisation"));

// Admin cannot self-accept via direct update (revocation-only policy).
const tamper = await err(U1, `update public.invitations set status='accepted', accepted_org_id='${OC1}' where id='${inv.id}' returning id`);
ok("admin direct-update self-acceptance blocked", (tamper || "").includes("row-level security") && (await as(U1, `select status from public.invitations where id='${inv.id}'`)).rows[0].status === "pending");

// Happy path: real contractor accepts with the out-of-band code.
const acc = (await as(UC, `select * from public.accept_invitation_code('${inv.code}')`)).rows[0];
ok("accept sets accepted + caller's contractor org", acc.status === "accepted" && acc.accepted_org_id === OC1);
ok("0005 integration: buyer admin now sees the accepting contractor org", (await as(U1, `select public.admin_can_org('${OC1}') v`)).rows[0].v === true);
const again = (await as(UC, `select * from public.accept_invitation_code('${inv.code}')`)).rows[0];
ok("re-accept with same code is idempotent", again.status === "accepted" && again.accepted_org_id === OC1);
ok("accepted code gives uniform error to everyone else", ((await err(UA, `select * from public.accept_invitation_code('${inv.code}')`)) || "").includes("Invalid or expired invitation code"));

// Revoke path: buyer revokes; the real contractor's accept then fails uniformly (concurrent-revocation semantics).
const inv2 = (await as(U1, `insert into public.invitations(email, organization_name) values ('solo@example.com','Solo Contracting') returning id, code`)).rows[0];
const revoked = await as(U1, `update public.invitations set status='revoked' where id='${inv2.id}' returning status`);
ok("buyer can revoke a pending invitation", revoked.rows[0]?.status === "revoked");
ok("accept after revoke gives uniform error", ((await err(UC, `select * from public.accept_invitation_code('${inv2.code}')`)) || "").includes("Invalid or expired invitation code"));

// Backward compatibility: an outstanding 10-char code (old default) still accepts.
const old = (await as(U1, `insert into public.invitations(email, organization_name, code) values ('solo@example.com','Solo Contracting','A1B2C3D4E5') returning code`)).rows[0];
const oldAcc = (await as(UC, `select * from public.accept_invitation_code('a1b2c3d4e5')`)).rows[0]; // case-insensitive
ok("old 10-char codes still accepted (backward compatible, case-insensitive)", oldAcc.status === "accepted" && oldAcc.accepted_org_id === OC1);

// Owner-only consent: a non-owner member of the contractor org cannot accept, even with code + matching email.
const mem = (await as(U1, `insert into public.invitations(email, organization_name) values ('member2@example.com','Solo Contracting') returning code`)).rows[0];
ok("non-owner member cannot accept (owner consent)", ((await err(UM, `select * from public.accept_invitation_code('${mem.code}')`)) || "").includes("founder of a contractor organisation"));

// Deterministic founder ordering: identical created_at ties break on user_id.
const tieInv = (await as(U1, `insert into public.invitations(email, organization_name) values ('founder2@example.com','Tie Org') returning code`)).rows[0];
ok("identical-timestamp tie: higher user_id is not the founder", ((await err(UF2, `select * from public.accept_invitation_code('${tieInv.code}')`)) || "").includes("founder of a contractor organisation"));
const tieInv2 = (await as(U1, `insert into public.invitations(email, organization_name) values ('founder1@example.com','Tie Org') returning code`)).rows[0];
const tieAcc = (await as(UF1, `select * from public.accept_invitation_code('${tieInv2.code}')`)).rows[0];
ok("identical-timestamp tie: lowest (created_at, user_id) member accepts as founder", tieAcc.status === "accepted" && tieAcc.accepted_org_id === OC4);

// Entropy sanity: every position of freshly generated codes varies (no fixed UUID bits in the code space).
const codes = (await db.query(`select upper(encode(public.gen_random_bytes(8),'hex')) c from generate_series(1,500)`)).rows.map(r => r.c);
const varied = [...Array(16).keys()].every(i => new Set(codes.map(c => c[i])).size > 5);
ok("generated codes vary in every position (no fixed bits)", varied && codes.every(c => /^[0-9A-F]{16}$/.test(c)));
ok("codes are unique across 500 draws", new Set(codes).size === 500);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

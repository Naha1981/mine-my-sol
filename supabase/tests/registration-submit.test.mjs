// Isolated integration test for registration-submit: the handle_new_user trigger
// (final form from 0003_self_signup.sql) fired by an auth.users INSERT. Covers the
// signup paths without creating any live account. Run: node supabase/tests/registration-submit.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const m0003 = fs.readFileSync(new URL("../../drizzle/migrations/0003_self_signup.sql", import.meta.url), "utf8");
const handleNewUser = m0003.match(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*?\$\$;/)[0];

const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type public.app_role as enum ('admin','contractor');
create type public.org_kind as enum ('buyer','contractor');
create type public.invitation_status as enum ('pending','accepted','revoked','declined');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, full_name text, email text, phone text, created_at timestamptz not null default now());
create table public.organizations(id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 200), kind public.org_kind not null, status text not null default 'active', created_at timestamptz not null default now());
create table public.user_roles(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, role public.app_role not null, unique(user_id, role));
create table public.memberships(id uuid primary key default gen_random_uuid(), user_id uuid not null, organization_id uuid not null references public.organizations(id) on delete cascade, created_at timestamptz not null default now(), unique(user_id, organization_id));
create table public.contractor_profiles(organization_id uuid primary key references public.organizations(id) on delete cascade, contact_name text, contact_phone text, contact_email text, updated_at timestamptz not null default now());
create table public.invitations(id uuid primary key default gen_random_uuid(), code text not null unique, email text not null, organization_name text not null,
  status public.invitation_status not null default 'pending', expires_at timestamptz not null default now() + interval '30 days',
  created_by uuid default auth.uid(), accepted_org_id uuid references public.organizations(id), created_at timestamptz not null default now());
${handleNewUser}
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`);

let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name); };
const signup = async (email, meta) => {
  try {
    const r = await db.query(`insert into auth.users(email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(meta ?? {})]);
    return { id: r.rows[0].id };
  } catch (e) { return { err: e }; }
};
const one = (q, p) => db.query(q, p).then((r) => r.rows[0]);

// 1. First ever user becomes the MySol admin (bootstrap rule).
const a = await signup("owner@mysol.co.za", { full_name: "Owner" });
t("first user signup succeeds", !a.err);
const aRole = await one(`select role from public.user_roles where user_id=$1`, [a.id]);
const aOrg = await one(`select o.kind, o.name from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [a.id]);
t("first user is admin of a buyer org", aRole?.role === "admin" && aOrg?.kind === "buyer");

// 2. Valid invite code: contractor org from the invitation, invitation accepted.
await db.query(`insert into public.invitations(code, email, organization_name) values ('INV-CODE-1', 'NewCo@Example.com', 'NewCo Mining')`);
const b = await signup("newco@example.com", { full_name: "N C", invite_code: " inv-code-1 " }); // lowercase + spaces
t("invite signup succeeds (code normalized)", !b.err);
const bOrg = await one(`select o.name, o.kind from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [b.id]);
t("invite signup creates contractor org named from invitation", bOrg?.name === "NewCo Mining" && bOrg?.kind === "contractor");
const inv = await one(`select status, accepted_org_id is not null as linked from public.invitations where code='INV-CODE-1'`);
t("invitation marked accepted with org link", inv?.status === "accepted" && inv?.linked === true);
const bProf = await one(`select contact_email from public.contractor_profiles p join public.memberships m on m.organization_id=p.organization_id where m.user_id=$1`, [b.id]);
t("contractor profile created", bProf?.contact_email === "newco@example.com");
const bRole = await one(`select role from public.user_roles where user_id=$1`, [b.id]);
t("invite signup gets contractor role (not admin)", bRole?.role === "contractor");

// 3. Invitation code for a different email is rejected, nothing created.
const c = await signup("other@example.com", { full_name: "X", invite_code: "INV-CODE-1" });
t("accepted invitation cannot be reused", !!c.err && /does not match|has expired/.test(c.err.message));
await db.query(`insert into public.invitations(code, email, organization_name) values ('INV-CODE-2', 'second@example.com', 'Second Co')`);
const d = await signup("wrong@example.com", { full_name: "Y", invite_code: "INV-CODE-2" });
t("code bound to a different email rejected", !!d.err && /does not match|has expired/.test(d.err.message));
const dOrg = await one(`select count(*)::int c from public.organizations where name='Second Co'`);
t("rejected signup created no org", dOrg?.c === 0);

// 4. Expired invitation rejected.
await db.query(`insert into public.invitations(code, email, organization_name, expires_at) values ('INV-OLD', 'old@example.com', 'Old Co', now() - interval '1 day')`);
const e = await signup("old@example.com", { full_name: "Z", invite_code: "INV-OLD" });
t("expired invitation rejected", !!e.err && /does not match|has expired/.test(e.err.message));

// 5. Honeypot filled -> rejected before any org work.
const f = await signup("bot@example.com", { full_name: "Bot", company_name: "Bot Co", website: "http://spam" });
t("honeypot signup rejected", !!f.err && /Registration rejected/.test(f.err.message));
const fOrg = await one(`select count(*)::int c from public.organizations where name='Bot Co'`);
t("honeypot signup created no org", fOrg?.c === 0);

// 6. Open signup (no code) with a real company name.
const g = await signup("open@example.com", { full_name: "Open", company_name: "Open Cast Pty Ltd", phone: "011" });
t("open signup succeeds", !g.err);
const gOrg = await one(`select o.name, o.kind from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [g.id]);
t("open signup creates contractor org with given name", gOrg?.name === "Open Cast Pty Ltd" && gOrg?.kind === "contractor");
const gRole = await one(`select role from public.user_roles where user_id=$1`, [g.id]);
t("open signup is contractor, never admin (admin exists)", gRole?.role === "contractor");

// 7. Junk company names rejected.
const h = await signup("j1@example.com", { full_name: "J", company_name: "x" });
t("1-char company name rejected", !!h.err && /company name/.test(h.err.message));
const i = await signup("j2@example.com", { full_name: "J", company_name: "  " });
t("blank company name rejected", !!i.err && /company name/.test(i.err.message));
const j = await signup("j3@example.com", { full_name: "J", company_name: "y".repeat(121) });
t("over-long company name rejected", !!j.err && /company name/.test(j.err.message));

// 8. Profile row always created for accepted signups.
const gProf = await one(`select full_name, email from public.profiles where id=$1`, [g.id]);
t("profile created with signup metadata", gProf?.full_name === "Open" && gProf?.email === "open@example.com");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

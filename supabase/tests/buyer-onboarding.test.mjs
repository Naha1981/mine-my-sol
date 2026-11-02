// Buyer self-onboarding proof: multitenant_migration.sql handle_new_user (last writer
// of the trigger, committed c92afd8 2026-10-18, after 0003). Verifies the account_type
// selector paths without creating any live account. Run: node supabase/tests/buyer-onboarding.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../multitenant_migration.sql", import.meta.url), "utf8");
const handleNewUser = sql.match(/create or replace function public\.handle_new_user\(\)[\s\S]*?end \$f\$;/)[0];

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
  try { const r = await db.query(`insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning id`, [email, JSON.stringify(meta ?? {})]); return { id: r.rows[0].id }; }
  catch (e) { return { err: e }; }
};
const one = (q, p) => db.query(q, p).then((r) => r.rows[0]);

// Seed an existing admin so the bootstrap branch is not what makes a buyer admin.
const seed = await signup("owner@mysol.co.za", { full_name: "Owner", company_name: "MySol", account_type: "buyer" });
t("seed buyer admin succeeds", !seed.err);

// 1. Buyer self-onboarding: own buyer org, admin role, no contractor profile.
const b = await signup("solly@buyer.co.za", { full_name: "Solly M", phone: "0820000000", company_name: "MySol Holdings", account_type: "buyer" });
t("buyer signup succeeds without invitation", !b.err);
const bOrg = await one(`select o.kind, o.name from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [b.id]);
t("buyer gets own buyer org with their company name", bOrg?.kind === "buyer" && bOrg?.name === "MySol Holdings");
const bRole = await one(`select role from public.user_roles where user_id=$1`, [b.id]);
t("buyer is admin of their own company", bRole?.role === "admin");
const bCp = await one(`select count(*)::int n from public.contractor_profiles p join public.memberships m on m.organization_id=p.organization_id where m.user_id=$1`, [b.id]);
t("buyer has no contractor profile", bCp?.n === 0);

// 2. Second buyer is isolated: separate org, not added to the first buyer's org.
const b2 = await signup("other@mine.co.za", { full_name: "O M", company_name: "Other Mine", account_type: "buyer" });
const b2Org = await one(`select o.id, o.kind from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [b2.id]);
const bOrgId = await one(`select o.id from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [b.id]);
t("second buyer gets a separate buyer org", b2Org?.kind === "buyer" && b2Org?.id !== bOrgId?.id);

// 3. Buyer path still validates company name.
const bad = await signup("bad@buyer.co.za", { full_name: "B", company_name: "", account_type: "buyer" });
t("buyer with blank company name rejected", !!bad.err);

// 4. Contractor paths unaffected: open signup still creates contractor org, never admin.
const c = await signup("con@ Contractor.co.za".replace(" ",""), { full_name: "C", company_name: "Con Co", account_type: "contractor" });
const cOrg = await one(`select o.kind from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=$1`, [c.id]);
const cRole = await one(`select role from public.user_roles where user_id=$1`, [c.id]);
t("contractor open signup still contractor org + contractor role", cOrg?.kind === "contractor" && cRole?.role === "contractor");

// 5. Honeypot still rejected on both paths.
const hp = await signup("bot@buyer.co.za", { full_name: "Bot", company_name: "BotCo", account_type: "buyer", website: "http://spam" });
t("honeypot rejected on buyer path", !!hp.err);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

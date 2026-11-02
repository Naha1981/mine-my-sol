// Regression: a contractor must be able to upload a NEW VERSION of a document
// MySol already verified or rejected (0008). The verification reset that comes
// with a new version is allowed ONLY through the trusted document_versions_after
// trigger; every direct contractor write to verification state must still fail.
// Run: node supabase/tests/document-version-upload.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const U_ADMIN = "00000000-0000-0000-0000-0000000000a1"; // MySol admin (buyer)
const U_CON = "00000000-0000-0000-0000-0000000000b1";  // contractor member (org C)
const U_CON2 = "00000000-0000-0000-0000-0000000000b2"; // contractor member (org D)
const OB = "11111111-1111-1111-1111-1111111111c1";
const OC = "22222222-2222-2222-2222-2222222222d1";
const OD = "44444444-4444-4444-4444-4444444444f1";
const DOC = "33333333-3333-3333-3333-3333333333e1";  // verified doc, org C
const DOC2 = "33333333-3333-3333-3333-3333333333e2"; // rejected doc, org C

const m0000 = fs.readFileSync(new URL("../../drizzle/migrations/0000_minemysol_foundation.sql", import.meta.url), "utf8");
const m0008 = fs.readFileSync(new URL("../../drizzle/migrations/0008_verified_doc_new_version.sql", import.meta.url), "utf8");
const fn = (src, name) => src.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$;`))[0];
const policies = (src, prefix) => [...src.matchAll(new RegExp(`CREATE POLICY "${prefix}[^;]+;`, "g"))].map((m) => m[0]).join("\n");

async function build(withFix) {
  const db = new PGlite();
  await db.exec(`
create role authenticated nologin;
grant usage on schema public to authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type public.app_role as enum ('admin','contractor');
create type public.verification_status as enum ('unverified','verified','rejected');
create table public.user_roles(user_id uuid, role public.app_role);
create table public.organizations(id uuid primary key, name text, kind text, status text not null default 'active');
create table public.memberships(user_id uuid, organization_id uuid, created_at timestamptz not null default now());
create table public.documents(id uuid primary key, organization_id uuid not null, title text not null,
  category text, expires_at date, current_version int not null default 0,
  verification public.verification_status not null default 'unverified',
  verification_note text, verified_by uuid, verified_at timestamptz, updated_at timestamptz not null default now());
create table public.document_versions(id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id) on delete cascade,
  organization_id uuid not null, version int not null, storage_path text not null, file_name text not null,
  mime_type text not null, size_bytes int not null, sha256 text, expires_at date, uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(), unique(document_id, version));
grant select, insert, update on public.documents to authenticated;
grant select, insert on public.document_versions to authenticated;
${fn(m0000, "has_role")}
${fn(m0000, "is_admin")}
${fn(m0000, "is_org_member")}
${fn(m0000, "document_versions_bump")}
CREATE TRIGGER trg_dv_bump BEFORE INSERT ON public.document_versions FOR EACH ROW EXECUTE FUNCTION public.document_versions_bump();
${policies(m0000, "docs:")}
${policies(m0000, "dv:")}
  `);
  if (withFix) {
    await db.exec(m0008); // hardened guard + trigger-marking document_versions_after
  } else {
    await db.exec(fn(m0000, "documents_guard"));
    await db.exec(fn(m0000, "document_versions_after"));
  }
  await db.exec(`
CREATE TRIGGER trg_documents_guard BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.documents_guard();
CREATE TRIGGER trg_dv_after AFTER INSERT ON public.document_versions FOR EACH ROW EXECUTE FUNCTION public.document_versions_after();
  `);
  // Seed as superuser with an admin JWT (seed v1 insert fires the AFTER trigger).
  await db.query(`select set_config('request.jwt.claim.sub','${U_ADMIN}',false)`);
  await db.exec(`
insert into public.organizations values ('${OB}','MySol','buyer'),('${OC}','QA Co','contractor'),('${OD}','Other Co','contractor');
insert into public.user_roles values ('${U_ADMIN}','admin'),('${U_CON}','contractor'),('${U_CON2}','contractor');
insert into public.memberships values ('${U_ADMIN}','${OB}'),('${U_CON}','${OC}'),('${U_CON2}','${OD}');
insert into public.documents(id, organization_id, title, category, verification, verified_by, verified_at, current_version)
  values ('${DOC}','${OC}','CIPC cert','cipc','verified','${U_ADMIN}', now(), 1),
         ('${DOC2}','${OC}','SARS PIN','tax','rejected','${U_ADMIN}', now(), 1);
insert into public.document_versions(document_id, organization_id, version, storage_path, file_name, mime_type, size_bytes)
  values ('${DOC}','${OC}', 1, '${OC}/v1.pdf', 'v1.pdf', 'application/pdf', 100),
         ('${DOC2}','${OC}', 1, '${OC}/s1.pdf', 's1.pdf', 'application/pdf', 100);
  `);
  // Enforce RLS after seeding (FORCE so the owner role is subject too).
  await db.exec(`
alter table public.documents enable row level security;
alter table public.documents force row level security;
alter table public.document_versions enable row level security;
alter table public.document_versions force row level security;
  `);
  return db;
}

// Switch identity: session JWT claim + non-superuser role so RLS and the guard apply.
const asUser = (db, u) => db.exec(`select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`);
const doc = (db, id) => db.query(`select current_version, verification, verified_by, verified_at from public.documents where id='${id}'`).then((r) => r.rows[0]);

let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name); };
const attempt = async (fn2) => { try { return { res: await fn2() }; } catch (e) { return { err: e }; } };
const upload = (db, docId, org, path) => db.query(
  `insert into public.document_versions(document_id, organization_id, version, storage_path, file_name, mime_type, size_bytes)
   values ('${docId}','${org}', 0, '${path}', 'f.pdf', 'application/pdf', 120)`);

// --- current guard: defect repro ---
{
  const db = await build(false);
  await asUser(db, U_CON);
  const { err } = await attempt(() => upload(db, DOC, OC, `${OC}/v2.pdf`));
  t("current: contractor new-version upload on VERIFIED doc fails with guard error (defect repro)", !!err && /Only MySol can verify/.test(err.message));
  await db.close();
}

// --- hardened 0008 ---
{
  const db = await build(true);
  await asUser(db, U_CON);

  const up1 = await attempt(() => upload(db, DOC, OC, `${OC}/v2.pdf`));
  t("fixed: contractor new-version upload on VERIFIED doc succeeds", !up1.err);
  const d1 = await doc(db, DOC);
  t("fixed: version bumped to 2, current_version=2, verification reset to unverified/NULL",
    d1.current_version === 2 && d1.verification === "unverified" && d1.verified_by === null && d1.verified_at === null);

  const up2 = await attempt(() => upload(db, DOC2, OC, `${OC}/s2.pdf`));
  t("fixed: contractor new-version upload on REJECTED doc succeeds (resubmission)", !up2.err);
  const d2 = await doc(db, DOC2);
  t("fixed: rejected doc reset to unverified after new version", d2.verification === "unverified" && d2.verified_by === null && d2.current_version === 2);

  // Re-establish reviewed states for the clearing/forgery negatives.
  await asUser(db, U_ADMIN);
  await db.query(`update public.documents set verification='verified' where id='${DOC}'`);
  await db.query(`update public.documents set verification='rejected' where id='${DOC2}'`);
  await asUser(db, U_CON);

  const r1 = await attempt(() => db.query(`update public.documents set verification='unverified', verified_by=NULL, verified_at=NULL where id='${DOC}'`));
  t("fixed: direct API reset of a VERIFIED doc denied", !!r1.err && /Only MySol can verify/.test(r1.err.message));
  const d0 = await doc(db, DOC);
  t("fixed: verified state intact after blocked reset", d0.verification === "verified" && d0.verified_by === U_ADMIN);

  const r2 = await attempt(() => db.query(`update public.documents set verification='unverified', verified_by=NULL, verified_at=NULL where id='${DOC2}'`));
  t("fixed: contractor clearing a REJECTED state denied", !!r2.err && /Only MySol can verify/.test(r2.err.message));
  const d3 = await doc(db, DOC2);
  t("fixed: rejected state intact after blocked clearing", d3.verification === "rejected" && d3.verified_by === U_ADMIN);

  const r3 = await attempt(() => db.query(`update public.documents set verification='verified', verified_by='${U_CON}' where id='${DOC}'`));
  t("fixed: contractor self-verify still blocked", !!r3.err && /Only MySol can verify/.test(r3.err.message));

  const r4 = await attempt(() => db.query(`update public.documents set verified_by='${U_CON}' where id='${DOC}'`));
  t("fixed: forged verified_by denied", !!r4.err && /Only MySol can verify/.test(r4.err.message));

  const r5 = await attempt(() => db.query(`update public.documents set verified_at=now() where id='${DOC}'`));
  t("fixed: forged verified_at denied", !!r5.err && /Only MySol can verify/.test(r5.err.message));

  // Imitating the exact trusted-transition column values WITHOUT the trigger must fail:
  const r6 = await attempt(() => db.query(`update public.documents set current_version=99, verification='unverified', verified_by=NULL, verified_at=NULL where id='${DOC}'`));
  t("fixed: forged version-transition (no trigger mark) denied", !!r6.err && /Only MySol can verify/.test(r6.err.message));
  const d4 = await doc(db, DOC);
  t("fixed: doc unchanged after forged transition", d4.current_version === 2 && d4.verification === "verified");

  // Trusted-mark lifecycle: one transaction runs a legitimate v3 insert for DOC
  // (trigger sets+clears the mark), then a forged reset on DOC2 - a REVIEWED doc
  // that got NO new version in this tx. If the mark survived the trigger, and
  // were it not doc-bound, this would pass the guard; it must raise.
  let txErr = null;
  try {
    await db.transaction(async (tx) => {
      await tx.query(`insert into public.document_versions(document_id, organization_id, version, storage_path, file_name, mime_type, size_bytes)
        values ('${DOC}','${OC}', 0, '${OC}/v3.pdf', 'v3.pdf', 'application/pdf', 130)`);
      await tx.query(`update public.documents set verification='unverified', verified_by=NULL, verified_at=NULL where id='${DOC2}'`);
    });
  } catch (e) { txErr = e; }
  t("fixed: same-transaction forged reset on non-versioned doc denied", !!txErr && /Only MySol can verify/.test(txErr.message));
  const dTx = await doc(db, DOC);
  const dTx2 = await doc(db, DOC2);
  t("fixed: aborted tx rolled back v3 - doc still verified v2", dTx.current_version === 2 && dTx.verification === "verified");
  t("fixed: rejected doc untouched by aborted tx", dTx2.verification === "rejected" && dTx2.verified_by === U_ADMIN);
  const v3c = await db.query(`select count(*)::int c from public.document_versions where document_id='${DOC}' and version=3`);
  t("fixed: v3 version row rolled back with the tx", v3c.rows[0].c === 0);

  // Mark is bound to the document id (simulated via raw SQL, which API clients
  // cannot reach - this tests the binding logic itself):
  await db.query(`select set_config('app.trusted_version_reset','${DOC2}',false)`);
  const rm1 = await attempt(() => db.query(`update public.documents set current_version=99, verification='unverified', verified_by=NULL, verified_at=NULL where id='${DOC}'`));
  t("fixed: mark for a DIFFERENT document does not authorize this row", !!rm1.err && /Only MySol can verify/.test(rm1.err.message));
  await db.query(`select set_config('app.trusted_version_reset','${DOC}',false)`);
  const rm2 = await attempt(() => db.query(`update public.documents set verification='rejected' where id='${DOC}'`)); // distinct change (doc is verified)
  t("fixed: even a matching mark cannot GRANT verification (reset shape only)", !!rm2.err && /Only MySol can verify/.test(rm2.err.message));
  await db.query(`select set_config('app.trusted_version_reset','',false)`);

  // current_version is system-managed: direct writes are pinned back, no reset forced.
  const rp = await attempt(() => db.query(`update public.documents set current_version=99 where id='${DOC}'`));
  t("fixed: direct current_version write allowed through but pinned", !rp.err);
  const dPin = await doc(db, DOC);
  t("fixed: current_version pinned to old value, verification untouched", dPin.current_version === 2 && dPin.verification === "verified");

  // Cross-org:
  await asUser(db, U_CON2);
  const r7 = await attempt(() => db.query(`update public.documents set title='hijack' where id='${DOC}'`));
  t("fixed: cross-org update hits RLS (0 rows)", !r7.err && r7.res.affectedRows === 0);
  const r8 = await attempt(() => upload(db, DOC, OD, `${OD}/x.pdf`));
  t("fixed: cross-org document_versions insert denied", !!r8.err);
  const r9 = await attempt(() => upload(db, DOC2, OC, `notorg/s3.pdf`));
  t("fixed: storage_path outside own org prefix denied", !!r9.err);

  // Existing semantics preserved: ordinary content edit auto-resets verification.
  await asUser(db, U_CON);
  const r10 = await attempt(() => db.query(`update public.documents set title='CIPC cert (renamed)' where id='${DOC}'`));
  t("fixed: ordinary contractor edit still allowed", !r10.err);
  const d5 = await doc(db, DOC);
  t("fixed: ordinary edit auto-resets verification", d5.verification === "unverified" && d5.verified_by === null);

  // Admin path unchanged:
  await asUser(db, U_ADMIN);
  const r11 = await attempt(() => db.query(`update public.documents set verification='verified' where id='${DOC2}'`));
  t("fixed: admin verify still works", !r11.err);
  const d6 = await doc(db, DOC2);
  t("fixed: admin verify stamps verified_by/verified_at", d6.verification === "verified" && d6.verified_by === U_ADMIN && d6.verified_at !== null);

  await db.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

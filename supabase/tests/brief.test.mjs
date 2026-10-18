// Isolation + behaviour test for supabase/fleetpulse.sql on a local Postgres (PGlite) with a minimal stub of the base schema.
// Run: npm i @electric-sql/pglite && node fleetpulse.test.mjs <path to fleetpulse.sql> <path to rollback.sql>
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const [sqlPath, briefPath, briefRb] = process.argv.slice(2);
const db = new PGlite();
const A = "00000000-0000-0000-0000-0000000000a1", B = "00000000-0000-0000-0000-0000000000b1", OA = "11111111-1111-1111-1111-1111111111a1", OB = "11111111-1111-1111-1111-1111111111b1";
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table public.organizations(id uuid primary key, name text, kind text);
create table public.memberships(user_id uuid, organization_id uuid);
create function public.is_org_member(_o uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.organization_id=_o) $$;
insert into public.organizations values ('${OA}','Alpha Haulage','contractor'),('${OB}','Beta Mining','buyer');
insert into public.memberships values ('${A}','${OA}'),('${B}','${OB}');
grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to authenticated; grant select on public.organizations to anon;
`);
const apply = async () => { await db.exec(fs.readFileSync(sqlPath, "utf8")); await db.exec(fs.readFileSync(briefPath, "utf8")); await db.exec("grant all on all tables in schema public to authenticated; grant select, usage on all sequences in schema public to authenticated;"); };
await apply(); await apply(); // idempotent
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const as = async (role, uid, sql, p) => { await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${uid ?? ""}',false);`); try { return await db.query(sql, p); } finally { await db.exec("reset role"); } };
const fails = async (role, uid, sql, p) => { try { await as(role, uid, sql, p); return false; } catch { return true; } };
const row = (org, id) => `insert into fp_daily(org_id,machine_id,day,engine_h,idle_h,litres) values ('${org}','${id}','2026-10-17',10,2,300)`;

const sh = (org, site) => `insert into fp_shifts(org_id,site,day,shift,shift_hours,planned_t,actual_t) values ('${org}','${site}','2026-10-17','night',10,1000,860) returning id`;
const sa = (await as("authenticated", A, sh(OA, "Site A"))).rows[0].id; const sb = (await as("authenticated", B, sh(OB, "Site B"))).rows[0].id;
ok("each company sees only its shifts", (await as("authenticated", A, "select site from fp_shifts")).rows.map(r => r.site).join() === "Site A" && (await as("authenticated", B, "select site from fp_shifts")).rows.map(r => r.site).join() === "Site B");
ok("A cannot insert shift into B", await fails("authenticated", A, sh(OB, "X")));
ok("duplicate shift rejected", await fails("authenticated", A, sh(OA, "Site A")));
ok("A cannot attach a delay to B's shift (even with own org id)", await fails("authenticated", A, `insert into fp_delays(org_id,shift_id,reason,start_at,end_at) values ('${OA}','${sb}','x','2026-10-17T01:00Z','2026-10-17T02:00Z')`));
ok("A cannot attach a delay to B's shift using B's org id", await fails("authenticated", A, `insert into fp_delays(org_id,shift_id,reason,start_at,end_at) values ('${OB}','${sb}','x','2026-10-17T01:00Z','2026-10-17T02:00Z')`));
ok("A inserts own delay, event, evidence, action", (await as("authenticated", A, `insert into fp_delays(org_id,shift_id,reason,start_at,end_at,machine_id) values ('${OA}','${sa}','Excavator breakdown','2026-10-17T01:00Z','2026-10-17T03:30Z','EXC-02') returning id`)).rows.length === 1
  && (await as("authenticated", A, `insert into fp_machine_events(org_id,shift_id,site,machine_id,machine_type,status,start_at,end_at) values ('${OA}','${sa}','Site A','EXC-02','excavator','breakdown','2026-10-17T01:00Z','2026-10-17T03:30Z') returning id`)).rows.length === 1
  && (await as("authenticated", A, `insert into fp_evidence(org_id,shift_id,machine_id,note) values ('${OA}','${sa}','EXC-02','photo') returning id`)).rows.length === 1
  && (await as("authenticated", A, `insert into fp_actions(org_id,shift_id,cause_key,title,owner_role) values ('${OA}','${sa}','delay:1','Check','fleet planner') returning id`)).rows.length === 1);
for (const t of ["fp_delays","fp_machine_events","fp_evidence","fp_actions"]) ok(`B sees no ${t} of A`, (await as("authenticated", B, `select * from ${t}`)).rows.length === 0);
for (const t of ["fp_shifts","fp_delays","fp_machine_events","fp_evidence","fp_actions"]) ok(`anon cannot read ${t}`, await fails("anon", null, `select * from ${t}`));
ok("B cannot update A shift", (await as("authenticated", B, "update fp_shifts set actual_t=1 where site='Site A' returning 1")).rows.length === 0);
ok("B cannot delete A evidence", (await as("authenticated", B, "delete from fp_evidence returning 1")).rows.length === 0);
ok("end before start rejected", await fails("authenticated", A, `insert into fp_delays(org_id,shift_id,reason,start_at,end_at) values ('${OA}','${sa}','x','2026-10-17T03:00Z','2026-10-17T02:00Z')`));
ok("bad evidence status rejected", await fails("authenticated", A, `insert into fp_evidence(org_id,shift_id,status) values ('${OA}','${sa}','bogus')`));
const tk = (await as("authenticated", A, `insert into fp_tokens(org_id,label) values ('${OA}','P') returning token`)).rows[0].token;
const open = (await as("anon", null, "select public.fp_open($1,'Mozilla') v", [tk])).rows[0].v;
ok("shared link returns A's shift data only, no file paths or org ids", open.shifts.length === 1 && open.shifts[0].site === "Site A" && open.delays.length === 1 && open.machine_events.length === 1 && open.evidence.length === 1 && !("file_path" in open.evidence[0]) && !("org_id" in open.shifts[0]));
ok("settings have new defaults", (await as("authenticated", A, `insert into fp_settings(org_id) values ('${OA}') returning variance_flag_pct,crit_excavator`)).rows[0].crit_excavator == 1);
await db.exec(fs.readFileSync(briefRb, "utf8"));
ok("brief rollback removes brief tables only", (await db.query("select count(*)::int c from pg_tables where tablename in ('fp_shifts','fp_delays','fp_machine_events','fp_evidence','fp_actions')")).rows[0].c === 0 && (await db.query("select count(*)::int c from pg_tables where tablename in ('fp_daily','fp_tokens','fp_events','fp_settings')")).rows[0].c === 4);
ok("fleet data survived brief rollback and link still opens", (await as("anon", null, "select public.fp_open($1,'x') v", [tk])).rows[0].v.company === "Alpha Haulage");
await apply(); ok("re-apply after rollback works", (await db.query("select count(*)::int c from pg_tables where tablename like 'fp_%'")).rows[0].c === 9);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

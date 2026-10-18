-- FleetPulse morning brief module: shifts, delays, machine events, evidence, actions. Additive, idempotent.
-- Requires supabase/fleetpulse.sql. Rollback: supabase/fleetpulse_brief_rollback.sql
alter table public.fp_settings add column if not exists variance_flag_pct numeric(4,3) not null default 0.05 check (variance_flag_pct between 0.01 and 0.5);
alter table public.fp_settings add column if not exists unexplained_gap_share numeric(4,3) not null default 0.25 check (unexplained_gap_share between 0.01 and 1);
alter table public.fp_settings add column if not exists impact_mismatch_pct numeric(4,3) not null default 0.25 check (impact_mismatch_pct between 0.01 and 2);
alter table public.fp_settings add column if not exists crit_excavator numeric(4,2) not null default 1.0 check (crit_excavator between 0 and 2);
alter table public.fp_settings add column if not exists crit_truck numeric(4,2) not null default 0.2 check (crit_truck between 0 and 2);

create table if not exists public.fp_shifts(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site text not null check (char_length(site) between 1 and 60),
  day date not null,
  shift text not null check (shift in ('day','night')),
  shift_hours numeric(4,1) not null check (shift_hours > 0 and shift_hours <= 24),
  planned_t numeric(10,1) not null check (planned_t >= 0),
  actual_t numeric(10,1) not null check (actual_t >= 0),
  created_at timestamptz not null default now(),
  unique (org_id, site, day, shift));
create index if not exists fp_shifts_org_day on public.fp_shifts(org_id, day desc);

create table if not exists public.fp_delays(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shift_id uuid not null references public.fp_shifts(id) on delete cascade,
  kind text not null default 'delay' check (kind in ('delay','activity')),
  reason text not null check (char_length(reason) between 1 and 120),
  start_at timestamptz not null,
  end_at timestamptz not null,
  reported_impact_t numeric(10,1) check (reported_impact_t is null or reported_impact_t >= 0),
  machine_id text check (machine_id is null or char_length(machine_id) <= 40),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (end_at >= start_at));
create index if not exists fp_delays_shift on public.fp_delays(shift_id);

create table if not exists public.fp_machine_events(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shift_id uuid references public.fp_shifts(id) on delete cascade,
  site text not null check (char_length(site) between 1 and 60),
  machine_id text not null check (char_length(machine_id) between 1 and 40),
  machine_type text not null default 'other' check (machine_type in ('excavator','truck','other')),
  status text not null check (status in ('operating','idle','standby','breakdown','maintenance','refuelling')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at >= start_at));
create index if not exists fp_events_m_shift on public.fp_machine_events(shift_id);

create table if not exists public.fp_evidence(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shift_id uuid not null references public.fp_shifts(id) on delete cascade,
  machine_id text check (machine_id is null or char_length(machine_id) <= 40),
  delay_id uuid references public.fp_delays(id) on delete set null,
  kind text not null default 'photo' check (kind in ('photo','video','document')),
  file_path text check (file_path is null or char_length(file_path) <= 300),
  note text check (note is null or char_length(note) <= 500),
  captured_at timestamptz,
  status text not null default 'needs_review' check (status in ('verified','needs_review','disputed')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now());
create index if not exists fp_evidence_shift on public.fp_evidence(shift_id);

create table if not exists public.fp_actions(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shift_id uuid not null references public.fp_shifts(id) on delete cascade,
  cause_key text not null check (char_length(cause_key) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  owner_role text not null check (owner_role in ('site manager','fleet planner','general manager')),
  due_label text not null default 'Before the next shift',
  status text not null default 'open' check (status in ('open','in_progress','done')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shift_id, cause_key));

do $$ declare t text; begin
  foreach t in array array['fp_shifts','fp_delays','fp_machine_events','fp_evidence','fp_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t || '_all', t);
  end loop;
end $$;

-- Children must belong to the same company as their shift.
create or replace function public.fp_same_org() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.shift_id is not null and not exists (select 1 from public.fp_shifts s where s.id = new.shift_id and s.org_id = new.org_id) then
    raise exception 'shift belongs to another company';
  end if;
  return new;
end $f$;
drop trigger if exists fp_delays_same_org on public.fp_delays; create trigger fp_delays_same_org before insert or update on public.fp_delays for each row execute function public.fp_same_org();
drop trigger if exists fp_mev_same_org on public.fp_machine_events; create trigger fp_mev_same_org before insert or update on public.fp_machine_events for each row execute function public.fp_same_org();
drop trigger if exists fp_evidence_same_org on public.fp_evidence; create trigger fp_evidence_same_org before insert or update on public.fp_evidence for each row execute function public.fp_same_org();
drop trigger if exists fp_actions_same_org on public.fp_actions; create trigger fp_actions_same_org before insert or update on public.fp_actions for each row execute function public.fp_same_org();

-- Shared link now also returns the last 14 days of shift data for the link owner's company.
create or replace function public.fp_open(p_token text, p_ua text default '') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare t public.fp_tokens; s public.fp_settings; o text; rows_j jsonb; end_day date; sh_j jsonb; de_j jsonb; ev_j jsonb; evd_j jsonb; ac_j jsonb; last_shift date;
begin
  select * into t from public.fp_tokens where token = p_token and revoked_at is null and expires_at > now();
  if t.id is null then return null; end if;
  insert into public.fp_events(org_id, token_id, type, is_bot) values (t.org_id, t.id, 'link_opened', public.fp_is_bot(p_ua));
  select name into o from public.organizations where id = t.org_id;
  select * into s from public.fp_settings where org_id = t.org_id;
  select max(day) into end_day from public.fp_daily where org_id = t.org_id;
  select coalesce(jsonb_agg(jsonb_build_object('machine_id',d.machine_id,'site',d.site,'machine_type',d.machine_type,'day',d.day,'engine_h',d.engine_h,'idle_h',d.idle_h,'litres',d.litres,'fault_code',d.fault_code,'fault_severity',d.fault_severity,'is_sample',d.is_sample)), '[]'::jsonb)
    into rows_j from (select * from public.fp_daily where org_id = t.org_id and day > coalesce(end_day, current_date) - 30 order by day limit 6000) d;
  select max(day) into last_shift from public.fp_shifts where org_id = t.org_id;
  select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_at'), '[]'::jsonb) into sh_j from (select * from public.fp_shifts where org_id = t.org_id and day > coalesce(last_shift, current_date) - 14 order by day limit 2000) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_at'), '[]'::jsonb) into de_j from (select d.* from public.fp_delays d join public.fp_shifts sx on sx.id = d.shift_id where d.org_id = t.org_id and sx.day > coalesce(last_shift, current_date) - 14 limit 5000) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_at'), '[]'::jsonb) into ev_j from (select e.* from public.fp_machine_events e join public.fp_shifts sx on sx.id = e.shift_id where e.org_id = t.org_id and sx.day > coalesce(last_shift, current_date) - 14 limit 5000) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_at' - 'created_by' - 'file_path'), '[]'::jsonb) into evd_j from (select v.* from public.fp_evidence v join public.fp_shifts sx on sx.id = v.shift_id where v.org_id = t.org_id and sx.day > coalesce(last_shift, current_date) - 14 limit 2000) x;
  select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_at'), '[]'::jsonb) into ac_j from (select a.* from public.fp_actions a join public.fp_shifts sx on sx.id = a.shift_id where a.org_id = t.org_id and sx.day > coalesce(last_shift, current_date) - 14 limit 2000) x;
  return jsonb_build_object('label', t.label, 'company', o, 'settings', to_jsonb(s) - 'org_id', 'rows', rows_j, 'shifts', sh_j, 'delays', de_j, 'machine_events', ev_j, 'evidence', evd_j, 'actions', ac_j);
end $f$;
revoke all on function public.fp_open(text,text) from public;
grant execute on function public.fp_open(text,text) to anon, authenticated;

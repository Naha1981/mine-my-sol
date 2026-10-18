-- FleetPulse module: per-company fleet data, settings, share links and signals.
-- Additive and idempotent. Rollback: supabase/fleetpulse_rollback.sql
create or replace function public.fp_org() returns uuid language sql stable security definer set search_path to 'public' as $$
  select m.organization_id from public.memberships m where m.user_id = auth.uid() order by m.organization_id limit 1 $$;

create table if not exists public.fp_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  diesel_price numeric(6,2) check (diesel_price is null or (diesel_price between 5 and 100)),
  diesel_source text,
  diesel_verified boolean not null default false,
  idle_limit numeric(4,3) not null default 0.35 check (idle_limit between 0.05 and 0.95),
  fuel_sd numeric(3,1) not null default 2.0 check (fuel_sd between 1 and 5),
  fault_repeat int not null default 3 check (fault_repeat between 2 and 20),
  baseline_idle_share numeric(4,3) not null default 0.15 check (baseline_idle_share between 0 and 0.9),
  idle_burn_lph numeric(5,1) not null default 8 check (idle_burn_lph between 1 and 60),
  updated_at timestamptz not null default now());

create table if not exists public.fp_daily(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  machine_id text not null check (char_length(machine_id) between 1 and 40),
  site text not null default 'Unassigned' check (char_length(site) <= 60),
  machine_type text not null default 'Machine' check (char_length(machine_type) <= 60),
  day date not null,
  engine_h numeric(5,2) not null check (engine_h between 0 and 24),
  idle_h numeric(5,2) not null check (idle_h >= 0),
  litres numeric(8,1) not null check (litres >= 0),
  fault_code text check (fault_code is null or char_length(fault_code) <= 80),
  fault_severity text check (fault_severity is null or fault_severity in ('info','warn','stop')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  check (idle_h <= engine_h));
create index if not exists fp_daily_org_day on public.fp_daily(org_id, day desc);

create table if not exists public.fp_tokens(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  label text not null check (char_length(label) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 500),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now());
create index if not exists fp_tokens_org on public.fp_tokens(org_id);

create table if not exists public.fp_events(
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  token_id uuid not null references public.fp_tokens(id) on delete cascade,
  type text not null check (type in ('link_opened','screen_viewed','estimate_run','summary_shared','talk_requested')),
  payload jsonb not null default '{}'::jsonb,
  is_bot boolean not null default false,
  created_at timestamptz not null default now());
create index if not exists fp_events_org on public.fp_events(org_id, created_at desc);
create index if not exists fp_events_token on public.fp_events(token_id, created_at desc);

alter table public.fp_settings enable row level security;
alter table public.fp_daily enable row level security;
alter table public.fp_tokens enable row level security;
alter table public.fp_events enable row level security;
revoke all on public.fp_settings, public.fp_daily, public.fp_tokens, public.fp_events from anon;

drop policy if exists fp_settings_all on public.fp_settings;
create policy fp_settings_all on public.fp_settings for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists fp_daily_all on public.fp_daily;
create policy fp_daily_all on public.fp_daily for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists fp_tokens_all on public.fp_tokens;
create policy fp_tokens_all on public.fp_tokens for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists fp_events_read on public.fp_events;
create policy fp_events_read on public.fp_events for select to authenticated using (public.is_org_member(org_id));

-- Public link view: returns only what the link owner's company chose to share. Logs the open (bots flagged).
create or replace function public.fp_is_bot(p_ua text) returns boolean language sql immutable as $$
  select coalesce(p_ua,'') ~* '(bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|curl|wget|headless|monitor)' $$;

create or replace function public.fp_open(p_token text, p_ua text default '') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare t public.fp_tokens; s public.fp_settings; o text; rows_j jsonb; end_day date;
begin
  select * into t from public.fp_tokens where token = p_token and revoked_at is null and expires_at > now();
  if t.id is null then return null; end if;
  insert into public.fp_events(org_id, token_id, type, is_bot) values (t.org_id, t.id, 'link_opened', public.fp_is_bot(p_ua));
  select name into o from public.organizations where id = t.org_id;
  select * into s from public.fp_settings where org_id = t.org_id;
  select max(day) into end_day from public.fp_daily where org_id = t.org_id;
  select coalesce(jsonb_agg(jsonb_build_object('machine_id',d.machine_id,'site',d.site,'machine_type',d.machine_type,'day',d.day,'engine_h',d.engine_h,'idle_h',d.idle_h,'litres',d.litres,'fault_code',d.fault_code,'fault_severity',d.fault_severity,'is_sample',d.is_sample)), '[]'::jsonb)
    into rows_j from (select * from public.fp_daily where org_id = t.org_id and day > coalesce(end_day, current_date) - 30 order by day limit 6000) d;
  return jsonb_build_object('label', t.label, 'company', o, 'settings', to_jsonb(s) - 'org_id', 'rows', rows_j);
end $f$;

create or replace function public.fp_event(p_token text, p_type text, p_payload jsonb default '{}'::jsonb, p_ua text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare t public.fp_tokens; recent int;
begin
  if p_type not in ('screen_viewed','estimate_run','summary_shared','talk_requested') then return; end if;
  select * into t from public.fp_tokens where token = p_token and revoked_at is null and expires_at > now();
  if t.id is null then return; end if;
  select count(*) into recent from public.fp_events where token_id = t.id and created_at > now() - interval '1 hour';
  if recent >= 200 then return; end if;
  insert into public.fp_events(org_id, token_id, type, payload, is_bot) values (t.org_id, t.id, p_type, case when length(coalesce(p_payload,'{}'::jsonb)::text) > 1000 then '{}'::jsonb else coalesce(p_payload,'{}'::jsonb) end, public.fp_is_bot(p_ua));
end $f$;

revoke all on function public.fp_open(text,text), public.fp_event(text,text,jsonb,text) from public;
grant execute on function public.fp_open(text,text), public.fp_event(text,text,jsonb,text) to anon, authenticated;
grant execute on function public.fp_org() to authenticated;

-- Rollback for the morning brief module. Restores the previous fp_open (data only) and removes the brief tables and settings columns.
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
revoke all on function public.fp_open(text,text) from public;
grant execute on function public.fp_open(text,text) to anon, authenticated;
drop table if exists public.fp_actions;
drop table if exists public.fp_evidence;
drop table if exists public.fp_machine_events;
drop table if exists public.fp_delays;
drop table if exists public.fp_shifts;
drop function if exists public.fp_same_org();
alter table public.fp_settings drop column if exists variance_flag_pct, drop column if exists unexplained_gap_share, drop column if exists impact_mismatch_pct, drop column if exists crit_excavator, drop column if exists crit_truck;

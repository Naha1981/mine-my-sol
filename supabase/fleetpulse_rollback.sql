-- Rollback for FleetPulse. Removes the module and its data only.
drop function if exists public.fp_open(text,text);
drop function if exists public.fp_event(text,text,jsonb,text);
drop function if exists public.fp_is_bot(text);
drop table if exists public.fp_events;
drop table if exists public.fp_tokens;
drop table if exists public.fp_daily;
drop table if exists public.fp_settings;
drop function if exists public.fp_org();

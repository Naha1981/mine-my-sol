create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.mail_cfg(k text primary key, v text not null);
alter table public.mail_cfg enable row level security;
create table if not exists public.pw_reset_codes(email text primary key, code_hash text not null, expires_at timestamptz not null, attempts int not null default 0, sent_at timestamptz not null default now());
alter table public.pw_reset_codes enable row level security;
revoke all on public.mail_cfg, public.pw_reset_codes from anon, authenticated;
insert into public.mail_cfg(k,v) values ('resend_key','<set-in-mail_cfg>') on conflict (k) do update set v=excluded.v;
create or replace function public.request_password_reset(p_email text) returns void language plpgsql security definer set search_path=public,extensions,auth as $f$
declare v_email text := lower(trim(p_email)); v_code text; v_key text; v_html text; v_last timestamptz;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if not exists (select 1 from auth.users where lower(email)=v_email) then return; end if;
  select sent_at into v_last from pw_reset_codes where email=v_email;
  if v_last is not null and v_last > now() - interval '60 seconds' then return; end if;
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  insert into pw_reset_codes(email,code_hash,expires_at,attempts,sent_at) values (v_email, crypt(v_code, gen_salt('bf')), now()+interval '30 minutes', 0, now())
    on conflict (email) do update set code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=now();
  select v into v_key from mail_cfg where k='resend_key';
  v_html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937"><img src="https://minemysol.nahalabs.co.za/nahalabs-logo.png" alt="NahaLabs" width="200" style="display:block;margin-bottom:24px"/><h2 style="margin:0 0 12px">Reset your MineMySol password</h2><p>Use this code to set a new password. It works for 30 minutes.</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;background:#f3f4f6;padding:16px;text-align:center;border-radius:8px">' || v_code || '</p><p style="font-size:13px;color:#6b7280">If you did not ask for this, you can ignore this email. Your password stays the same.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/><p style="font-size:12px;color:#6b7280">NahaLabs, Johannesburg<br/>ai-solutions@nahalabs.co.za</p></div>';
  perform net.http_post(url:='https://api.resend.com/emails', headers:=jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'), body:=jsonb_build_object('from','NahaLabs <ai-solutions@nahalabs.co.za>','to',jsonb_build_array(v_email),'subject','Your MineMySol password reset code','html',v_html));
end $f$;
create or replace function public.complete_password_reset(p_email text, p_code text, p_password text) returns boolean language plpgsql security definer set search_path=public,extensions,auth as $f$
declare v_email text := lower(trim(p_email)); r pw_reset_codes%rowtype;
begin
  if length(coalesce(p_password,'')) < 8 then raise exception 'Use at least 8 characters'; end if;
  select * into r from pw_reset_codes where email=v_email;
  if not found or r.expires_at < now() or r.attempts >= 5 then return false; end if;
  if crypt(trim(p_code), r.code_hash) <> r.code_hash then update pw_reset_codes set attempts=attempts+1 where email=v_email; return false; end if;
  update auth.users set encrypted_password=crypt(p_password, gen_salt('bf')), updated_at=now() where lower(email)=v_email;
  delete from pw_reset_codes where email=v_email;
  return true;
end $f$;
grant execute on function public.request_password_reset(text), public.complete_password_reset(text,text,text) to anon, authenticated;

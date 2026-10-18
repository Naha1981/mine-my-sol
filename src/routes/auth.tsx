import { Captcha, captchaEnabled } from "@/components/app/Captcha";
import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/app/AppShell";
import { Field, errMsg } from "@/components/app/ui-bits";
import { meQuery } from "@/lib/session";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ mode: s["mode"] === "register" ? ("register" as const) : ("signin" as const) }),
  head: () => ({ meta: [{ title: "Sign in | MineMySol" }] }),
  component: AuthPage,
});

const signinSchema = z.object({ email: z.string().trim().email("Enter a valid email address"), password: z.string().min(1, "Enter your password") });
const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name"),
  phone: z.string().trim().min(7, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email address"),
  company_name: z.string().trim().min(2, "Enter your company name").max(120),
  invite_code: z.string().trim(),
  password: z.string().min(8, "Use at least 8 characters"),
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "", phone: "", company_name: "", website: "", email: "", invite_code: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const register = mode === "register";

  const [captcha, setCaptcha] = useState("");
  const [capKey, setCapKey] = useState(0);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (captchaEnabled && !captcha) { setFormError("Please complete the security check first."); return; }
    const parsed = (register ? registerSchema : signinSchema).safeParse(form);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { out[String(i.path[0])] = i.message; });
      setErrors(out);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (register) {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { ...(captcha ? { captchaToken: captcha } : {}), data: { full_name: form.full_name.trim(), phone: form.phone.trim(), company_name: form.company_name.trim(), website: form.website, invite_code: form.invite_code.trim() } },
        });
        if (error) throw error;
        if (!data.session) { setVerifySent(true); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password, ...(captcha ? { options: { captchaToken: captcha } } : {}) });
        if (error) throw error;
      }
      qc.clear();
      const me = await qc.fetchQuery({ ...meQuery, staleTime: 0 });
      navigate({ to: me?.isAdmin ? "/admin" : "/portal", replace: true });
    } catch (err) {
      const m = errMsg(err);
      setFormError(/invitation/i.test(m)
        ? "That invitation code does not match this email address, or it has expired. Leave the code blank to register without one."
        : /company name/i.test(m) ? "Enter your company name."
        : /already registered/i.test(m) ? "That email is already registered. Sign in instead."
        : /Database error/i.test(m) ? "We could not create your account. Check your details and try again."
        : /Invalid login/i.test(m) ? "Email or password is incorrect." : m);
    } finally { setBusy(false); if (captchaEnabled) { setCaptcha(""); setCapKey((k) => k + 1); } }
  }

  if (verifySent) return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-4 py-4 sm:px-8"><Link to="/"><Brand /></Link></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center">
        <div className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">We sent a verification link to {form.email.trim()}. Open it, then sign in.</p>
          <Button asChild className="w-full"><Link to="/auth" search={{ mode: "signin" }} onClick={() => setVerifySent(false)}>Go to sign in</Link></Button>
        </div>
      </main>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-4 py-4 sm:px-8"><Link to="/"><Brand /></Link></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center">
        <form onSubmit={go} noValidate className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">{register ? "Register your company" : "Sign in"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{register ? "Create a contractor account for your company. Verify your email, then browse and apply for tenders." : "Access for MySol and registered contractors."}</p>
          </div>
          {register && (
            <>
              <Field label="Full name" error={errors["full_name"]}><Input autoComplete="name" value={form.full_name} onChange={set("full_name")} /></Field>
              <Field label="Company name" error={errors["company_name"]}><Input autoComplete="organization" value={form.company_name} onChange={set("company_name")} /></Field>
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}><label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label></div>
              <Field label="Mobile number" error={errors["phone"]}><Input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} /></Field>
            </>
          )}
          <Field label="Email address" error={errors["email"]}><Input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} /></Field>
          {register && <Field label="Invitation code (optional)" error={errors["invite_code"]} hint="Only if MySol sent you one. Leave blank to register your company yourself."><Input autoCapitalize="characters" value={form.invite_code} onChange={set("invite_code")} /></Field>}
          <Field label="Password" error={errors["password"]}><Input type="password" autoComplete={register ? "new-password" : "current-password"} value={form.password} onChange={set("password")} /></Field>
          {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
          <Captcha onToken={setCaptcha} resetKey={capKey} />
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {register ? <>Already registered? <Link to="/auth" search={{ mode: "signin" }} className="font-medium text-primary underline">Sign in</Link></> : <>New contractor? <Link to="/auth" search={{ mode: "register" }} className="font-medium text-primary underline">Register your company</Link></>}
          </p>
        </form>
      </main>
    </div>
  );
}

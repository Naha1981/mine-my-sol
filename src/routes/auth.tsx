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
  invite_code: z.string().trim(),
  password: z.string().min(8, "Use at least 8 characters"),
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", invite_code: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const register = mode === "register";

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
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
          options: { data: { full_name: form.full_name.trim(), phone: form.phone.trim(), invite_code: form.invite_code.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          const r = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
          if (r.error) throw r.error;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw error;
      }
      qc.clear();
      const me = await qc.fetchQuery({ ...meQuery, staleTime: 0 });
      navigate({ to: me?.isAdmin ? "/admin" : "/portal", replace: true });
    } catch (err) {
      const m = errMsg(err);
      setFormError(/invitation/i.test(m) || /Database error/i.test(m)
        ? "That invitation code does not match this email address, or it has expired. Check the invitation you received or contact MySol."
        : /Invalid login/i.test(m) ? "Email or password is incorrect." : m);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-4 py-4 sm:px-8"><Link to="/"><Brand /></Link></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center">
        <form onSubmit={go} noValidate className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">{register ? "Register with your invitation" : "Sign in"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{register ? "Registration is by invitation from MySol. Use the email address the invitation was sent to." : "Access for MySol and invited contractors."}</p>
          </div>
          {register && (
            <>
              <Field label="Full name" error={errors["full_name"]}><Input autoComplete="name" value={form.full_name} onChange={set("full_name")} /></Field>
              <Field label="Mobile number" error={errors["phone"]}><Input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} /></Field>
            </>
          )}
          <Field label="Email address" error={errors["email"]}><Input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} /></Field>
          {register && <Field label="Invitation code" error={errors["invite_code"]} hint="From your invitation. Leave blank only when setting up the MySol administrator account."><Input autoCapitalize="characters" value={form.invite_code} onChange={set("invite_code")} /></Field>}
          <Field label="Password" error={errors["password"]}><Input type="password" autoComplete={register ? "new-password" : "current-password"} value={form.password} onChange={set("password")} /></Field>
          {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {register ? <>Already registered? <Link to="/auth" search={{ mode: "signin" }} className="font-medium text-primary underline">Sign in</Link></> : <>Have an invitation code? <Link to="/auth" search={{ mode: "register" }} className="font-medium text-primary underline">Register</Link></>}
          </p>
        </form>
      </main>
    </div>
  );
}

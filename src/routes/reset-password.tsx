import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/app/AppShell";
import { Field, errMsg } from "@/components/app/ui-bits";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Set a new password | MineMySol" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("email") ?? ""));
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address"); return; }
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code from your email"); return; }
    if (pw.length < 8) { setError("Use at least 8 characters"); return; }
    if (pw !== pw2) { setError("The two passwords do not match"); return; }
    setError("");
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc("complete_password_reset" as never, { p_email: email.trim(), p_code: code.trim(), p_password: pw } as never);
      if (err) throw err;
      if (!data) { setError("That code is wrong or has expired. Request a new one."); return; }
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (e2) throw e2;
      qc.clear();
      navigate({ to: "/portal", replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-4 py-4 sm:px-8"><Link to="/"><Brand /></Link></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center">
        <form onSubmit={go} noValidate className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter the 6-digit code we emailed you and choose a new password.</p>
          </div>
          <Field label="Email address"><Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="6-digit code"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : "Save password"}</Button>
          <p className="text-center text-sm text-muted-foreground"><Link to="/forgot-password" className="font-medium text-primary underline">Send a new code</Link></p>
        </form>
      </main>
    </div>
  );
}

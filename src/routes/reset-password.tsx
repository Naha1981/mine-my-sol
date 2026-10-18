import { useEffect, useState } from "react";
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
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The emailed link signs the person in for this one step; wait for that session to appear.
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => { if (session && !done) { done = true; setReady("yes"); } });
    supabase.auth.getSession().then(({ data }) => { if (data.session && !done) { done = true; setReady("yes"); } });
    const t = setTimeout(() => { if (!done) setReady("no"); }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setError("Use at least 8 characters"); return; }
    if (pw !== pw2) { setError("The two passwords do not match"); return; }
    setError("");
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
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
        {ready === "no" ? (
          <div className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 shadow-sm">
            <h1 className="text-2xl font-bold">This link has expired</h1>
            <p className="text-sm text-muted-foreground">Reset links work once and for one hour. Request a new one.</p>
            <Button asChild className="w-full"><Link to="/forgot-password">Send a new link</Link></Button>
          </div>
        ) : ready === "checking" ? (
          <p className="text-sm text-muted-foreground">Checking your link…</p>
        ) : (
          <form onSubmit={go} noValidate className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <div>
              <h1 className="text-2xl font-bold">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">Choose a password you will remember.</p>
            </div>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : "Save password"}</Button>
          </form>
        )}
      </main>
    </div>
  );
}

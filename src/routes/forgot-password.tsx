import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/app/AppShell";
import { Field } from "@/components/app/ui-bits";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your password | MineMySol" }] }),
  component: ForgotPage,
});

const schema = z.string().trim().email("Enter a valid email address");

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter a valid email address"); return; }
    setError("");
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${window.location.origin}/reset-password` });
    } catch {
      /* Same message either way, so the form never reveals which emails have accounts. */
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-4 py-4 sm:px-8"><Link to="/"><Brand /></Link></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center">
        {sent ? (
          <div className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 shadow-sm">
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-sm text-muted-foreground">If {email.trim()} has a MineMySol account, we have sent a link to set a new password. It works for one hour.</p>
            <Button asChild className="w-full"><Link to="/auth" search={{ mode: "signin" }}>Back to sign in</Link></Button>
          </div>
        ) : (
          <form onSubmit={go} noValidate className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <div>
              <h1 className="text-2xl font-bold">Reset your password</h1>
              <p className="mt-1 text-sm text-muted-foreground">Enter your email and we will send you a link to set a new password.</p>
            </div>
            <Field label="Email address" error={error}><Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : "Send reset link"}</Button>
            <p className="text-center text-sm text-muted-foreground"><Link to="/auth" search={{ mode: "signin" }} className="font-medium text-primary underline">Back to sign in</Link></p>
          </form>
        )}
      </main>
    </div>
  );
}

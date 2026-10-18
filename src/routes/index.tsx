import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileCheck2, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app/AppShell";
import { ClosingBadge, EmptyState, Loading, StatusBadge } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const projects = useQuery({
    queryKey: ["public-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,summary,location,trade,status,closes_at")
        .eq("visibility", "public")
        .order("closes_at", { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Brand />
        <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>
      <section className="bg-sidebar px-4 py-14 text-sidebar-foreground sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">Contractor and tender portal</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">Register once. Keep your documents current. Apply with confidence.</h1>
          <p className="mt-4 max-w-2xl text-base text-sidebar-foreground/80 sm:text-lg">
            MineMySol is MySol's private portal for approved contractors. Store your compliance documents, see exactly what each opportunity needs, and submit when your checklist is complete.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90"><Link to="/auth">Sign in <ArrowRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"><Link to="/auth" search={{ mode: "register" }}>I have an invitation code</Link></Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-4xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-8">
        {[
          { i: FileCheck2, t: "Know before you apply", d: "Your documents are checked against each checklist, with missing, expired and expiring items flagged." },
          { i: ShieldCheck, t: "Private by design", d: "Your files are visible only to your company and MySol. Every action is recorded." },
          { i: Smartphone, t: "Works on your phone", d: "Photograph a certificate on site and upload it straight to your vault." },
        ].map((f) => (
          <div key={f.t} className="rounded-lg border bg-card p-5">
            <f.i className="size-6 text-primary" />
            <p className="mt-3 font-display font-semibold">{f.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-8">
        <h2 className="mb-4 text-xl font-bold">Open opportunities</h2>
        {projects.isLoading ? <Loading /> : projects.isError ? (
          <EmptyState title="Opportunities could not be loaded" body="Please refresh the page. If it keeps happening, contact MySol." />
        ) : !projects.data?.length ? (
          <EmptyState title="No public opportunities right now" body="Invited contractors see their opportunities after signing in." />
        ) : (
          <ul className="space-y-3">
            {projects.data.map((p) => (
              <li key={p.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2"><Link to="/p/$projectId" params={{ projectId: p.id }} className="font-display font-semibold underline-offset-2 hover:underline">{p.title}</Link><StatusBadge status={p.status} /><ClosingBadge closesAt={p.closes_at} status={p.status} /></div>
                {p.summary && <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{[p.location, p.trade].filter(Boolean).join(" · ")}{p.closes_at ? ` · closes ${fmtDate(p.closes_at)}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} MineMySol. Private portal for invited contractors.</footer>
    </div>
  );
}

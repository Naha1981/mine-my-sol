import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/lib/session";
import { ArrowRight, Award, ClipboardCheck, ClipboardList, FileCheck2, Gauge, Map, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app/AppShell";
import { ClosingBadge, EmptyState, Loading, StatusBadge } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/")({ component: Landing });

function Journey({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-gold/20 text-xs font-semibold text-foreground">{i + 1}</span>
          <span>{s}</span>
          {i < steps.length - 1 && <span aria-hidden="true" className="text-muted-foreground/50">→</span>}
        </li>
      ))}
    </ol>
  );
}

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border bg-card">
      <img src={src} alt={alt} className="w-full" loading="lazy" />
      <figcaption className="px-3 py-2 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function Cards({ items }: { items: { i: React.ComponentType<{ className?: string }>; t: string; d: string }[] }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      {items.map((f) => (
        <div key={f.t} className="rounded-lg border bg-card p-5">
          <f.i className="size-6 text-primary" />
          <p className="mt-3 font-display font-semibold">{f.t}</p>
          <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
        </div>
      ))}
    </div>
  );
}

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
  const me = useQuery(meQuery);
  const home = me.data?.isAdmin ? "/admin" : "/portal";
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Brand />
        {me.data ? <Button asChild size="sm" className="min-h-11 px-4"><Link to={home}>Open my portal</Link></Button> : <Button asChild size="sm" className="min-h-11 px-4"><Link to="/auth">Sign in</Link></Button>}
      </header>
      <section className="bg-sidebar px-4 py-14 text-sidebar-foreground sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">Mining operations and contractor management</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">Manage mining projects, contractors, and operations in one place.</h1>
          <p className="mt-4 max-w-2xl text-base text-sidebar-foreground/80 sm:text-lg">
            MySol's teams publish work packages, vet contractors and run sites and fleet here. Contractors register, keep their documents tender-ready and apply. Every buying company gets its own private workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {me.data ? (
              <Button asChild size="lg" className="min-h-11 bg-gold text-gold-foreground hover:bg-gold/90"><Link to={home}>Open my portal <ArrowRight className="size-4" /></Link></Button>
            ) : (
              <>
                <Button asChild size="lg" className="min-h-11 bg-gold text-gold-foreground hover:bg-gold/90"><Link to="/auth" search={{ mode: "register", type: "buyer" }}>Buying company: start your workspace <ArrowRight className="size-4" /></Link></Button>
                <Button asChild size="lg" variant="outline" className="min-h-11 border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"><Link to="/auth" search={{ mode: "register", type: "contractor" }}>Contractor: register your company</Link></Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8">
        <h2 className="text-xl font-bold">For MySol's project and contractor managers</h2>
        <Journey steps={["Publish a work package with its exact requirements", "Every contractor answers the same checklist", "Review submissions and record each decision", "Award the work", "Track what's outstanding before work starts"]} />
        <div className="mt-4">
          <Shot src="/preview/admin-projects.jpg" alt="The MySol projects workspace listing published opportunities with statuses and submission counts" caption="The MySol projects workspace: publish opportunities, set the checklist, see submissions come in. Illustrative test workspace." />
        </div>
        <Cards items={[
          { i: ClipboardList, t: "Publish once", d: "Scope, required documents and closing date in one place. Every contractor answers the same checklist." },
          { i: Award, t: "Compare and award fairly", d: "Review every submission against the checklist, record each decision, and keep the exact document versions that were submitted." },
          { i: ClipboardCheck, t: "Mobilise without chasing", d: "After award, track the contract, safety and competency documents still outstanding before work starts." },
        ]} />
      </section>

      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8">
        <h2 className="text-xl font-bold">For MySol's operations and fleet teams</h2>
        <Journey steps={["Watch the shift on the map", "Pin a delay or dispute with its clip", "Seal the view into an evidence pack", "Price idle, fuel and repeat faults in rand"]} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Shot src="/preview/fleetpulse.jpg" alt="FleetPulse showing idle, fuel and repeat-fault signals priced in rand per machine per week" caption="FleetPulse: idle, fuel and repeat-fault signals priced in rand per machine per week." />
          <Shot src="/preview/admin-eye.jpg" alt="Operations Eye in the MySol administration workspace, showing the shift map, replay and an evidence pack" caption="Operations Eye in the MySol workspace: shift replay, production against target, and the evidence pack." />
          <Shot src="/preview/operations-eye.jpg" alt="A sealed Operations Eye evidence view showing machine, delay, clip and DISPUTED pins on the satellite map" caption="A sealed evidence view: machine, delay, clip and DISPUTED pins, with imagery attribution." />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-5">
            <Map className="size-6 text-primary" />
            <p className="mt-3 font-display font-semibold">Operations Eye</p>
            <p className="mt-1 text-sm text-muted-foreground">Every site, pit and machine on one satellite map. Replay the shift, mark delays and disputes with evidence clips, and seal any view into a shareable evidence pack.</p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <Gauge className="size-6 text-primary" />
            <p className="mt-3 font-display font-semibold">FleetPulse</p>
            <p className="mt-1 text-sm text-muted-foreground">Import your fleet's daily CSV and see what idle hours, fuel burn and repeat faults cost in rand, per machine, per week. Sample data is clearly marked until you load your own.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8">
        <h2 className="text-xl font-bold">For contractors: TenderReady</h2>
        <Journey steps={["Register your company - no invitation needed", "Keep every compliance document in one vault", "See exactly what each opportunity requires", "Submit when your checklist is complete", "Track the decision"]} />
        <div className="mt-4">
          <Shot src="/preview/contractor-vault.jpg" alt="A contractor's TenderReady document vault showing versions, expiry flags and verification by MySol" caption="A contractor's TenderReady vault: document versions, expiry flags and MySol's verification status. Illustrative test workspace." />
        </div>
        <Cards items={[
          { i: FileCheck2, t: "One vault, every tender", d: "Store each compliance document once. Expiry dates are flagged before they cost you the job." },
          { i: Smartphone, t: "Register and apply from your phone", d: "No invitation needed. Photograph a certificate on site and upload it straight to your vault." },
          { i: ShieldCheck, t: "Your record is kept", d: "Submissions keep the exact document versions you sent, and TenderReady checklists help you prepare for tenders at any buyer." },
        ]} />
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
        <h2 className="mb-4 text-xl font-bold">Open opportunities</h2>
        {projects.isLoading ? <Loading /> : projects.isError ? (
          <EmptyState title="Opportunities could not be loaded" body="Please refresh the page. If it keeps happening, contact MySol." />
        ) : !projects.data?.length ? (
          <EmptyState title="No public opportunities right now" body="Register your company to see opportunities you are invited to and to prepare your documents." />
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
        <p className="mt-6 text-xs text-muted-foreground">Public visitors see only public opportunities. Private projects, bids, documents and evaluations stay private to the companies involved.</p>
      </section>
      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} MineMySol. Mining operations and contractor management. Each buying company runs its own private workspace.</footer>
    </div>
  );
}

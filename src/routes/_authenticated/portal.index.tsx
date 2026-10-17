import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { myDocsQuery } from "@/lib/portalData";
import { ClosingBadge, EmptyState, Loading, PageHeader, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { categoryLabel } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { daysUntil, expiryState } from "@/lib/readiness";

export const Route = createFileRoute("/_authenticated/portal/")({ component: Home });

function Home() {
  const me = useMe();
  const docs = useQuery(myDocsQuery);
  const projects = useQuery({
    queryKey: ["portal", "open-projects"],
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("id,title,status,closes_at,location").eq("status", "open").order("closes_at", { ascending: true, nullsFirst: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });
  const apps = useQuery({
    queryKey: ["portal", "apps"],
    queryFn: async () => {
      const { data, error } = await db.from("applications").select("id,status,updated_at,projects(title)").order("updated_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });
  if (docs.isLoading || projects.isLoading || apps.isLoading) return <Loading />;
  const attention = (docs.data ?? []).filter((d) => d.current_version > 0 && ["expired", "expiring"].includes(expiryState(d.expires_at)));
  const openDrafts = (apps.data ?? []).filter((a: any) => a.status === "draft"); // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <>
      <PageHeader title={`Welcome${me.fullName ? `, ${me.fullName.split(" ")[0]}` : ""}`} description={me.org?.name} />
      {me.org?.status === "suspended" && <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Your company account is suspended. Contact MySol to restore access.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open opportunities" value={projects.data?.length ?? 0} />
        <StatCard label="Documents in vault" value={(docs.data ?? []).filter((d) => d.current_version > 0).length} />
        <StatCard label="Need attention" value={attention.length} tone={attention.length ? "gold" : undefined} hint="Expired or expiring" />
        <StatCard label="Drafts in progress" value={openDrafts.length} />
      </div>
      {!!attention.length && (
        <section className="mt-6 rounded-lg border border-gold/50 bg-gold/10 p-4">
          <p className="flex items-center gap-2 font-display font-semibold"><AlertTriangle className="size-4" /> Documents that need attention</p>
          <ul className="mt-2 space-y-1 text-sm">
            {attention.map((d) => { const n = daysUntil(d.expires_at); return <li key={d.id}>{d.title} <span className="text-muted-foreground">({categoryLabel(d.category)})</span>: {n < 0 ? `expired ${fmtDate(d.expires_at)}` : `expires in ${n} day${n === 1 ? "" : "s"}`}</li>; })}
          </ul>
          <Button asChild size="sm" className="mt-3"><Link to="/portal/vault">Open vault</Link></Button>
        </section>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">Opportunities for you</h2>
          {!projects.data?.length ? <EmptyState title="Nothing open right now" body="You will be notified when MySol invites you to a project." /> : (
            <ul className="divide-y rounded-lg border bg-card">{projects.data.map((p) => (
              <li key={p.id}><Link to="/portal/projects/$projectId" params={{ projectId: p.id }} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"><span className="min-w-0"><span className="block truncate font-medium">{p.title}</span><span className="text-xs text-muted-foreground">Closes {fmtDate(p.closes_at)}</span></span><ClosingBadge closesAt={p.closes_at} status={p.status} /></Link></li>
            ))}</ul>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Your applications</h2>
          {!apps.data?.length ? <EmptyState title="No applications yet" body="Open a project to see its checklist and start an application." /> : (
            <ul className="divide-y rounded-lg border bg-card">{apps.data.map((a: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
              <li key={a.id}><Link to="/portal/applications/$applicationId" params={{ applicationId: a.id }} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"><span className="truncate font-medium">{a.projects?.title}</span><StatusBadge status={a.status} /></Link></li>
            ))}</ul>
          )}
        </section>
      </div>
    </>
  );
}

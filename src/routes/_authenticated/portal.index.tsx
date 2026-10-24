import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
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
      <InvitationCodeEntry />
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
              <li key={a.id}><Link to="/portal/applications/$applicationId" params={{ applicationId: a.id }} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"><span className="truncate font-medium">{a.projects?.title ?? "Opportunity unavailable"}</span><StatusBadge status={a.status} /></Link></li>
            ))}</ul>
          )}
        </section>
      </div>
    </>
  );
}

function InvitationCodeEntry() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: async (rawCode: string) => {
      const { data, error } = await db.rpc("accept_invitation_code" as never, { p_code: rawCode } as never);
      if (error) throw error;
      return (data as unknown as { buyer_org_name: string | null })?.buyer_org_name ?? null;
    },
    onSuccess: (buyerName) => {
      setDone(buyerName);
      setCode("");
      qc.invalidateQueries({ queryKey: ["portal", "open-projects"] });
    },
  });
  if (done) return (
    <section className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-display font-semibold"><KeyRound className="size-4" /> Invitation accepted</p>
      <p className="mt-1 text-sm text-muted-foreground">{done ?? "The buyer"} can now see your company and invite you to their projects.</p>
    </section>
  );
  return (
    <section className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-display font-semibold"><KeyRound className="size-4" /> Have an invitation code?</p>
      <p className="mt-1 text-sm text-muted-foreground">If a buyer sent your company an invitation code, enter it here to let them see your company and invite you to their projects. Nothing is shared until you accept.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) accept.mutate(code); }}>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 1A2B3C4D5E" autoCapitalize="characters" className="w-48 font-mono tracking-widest" maxLength={10} />
        <Button type="submit" size="sm" disabled={accept.isPending || !code.trim()}>Accept invitation</Button>
      </form>
      {accept.isError && <p className="mt-2 text-sm text-destructive">{(accept.error as Error).message}</p>}
    </section>
  );
}
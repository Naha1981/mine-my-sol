import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Mail } from "lucide-react";
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
      <PendingInvitations />
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

type PendingInvite = { id: string; organization_name: string; buyer_org_name: string | null; expires_at: string | null };

function PendingInvitations() {
  const qc = useQueryClient();
  const invites = useQuery({
    queryKey: ["portal", "pending-invitations"],
    queryFn: async () => {
      const { data, error } = await db.from("invitations").select("id,organization_name,buyer_org_name,expires_at").eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return (data as unknown as PendingInvite[]).filter((i) => !i.expires_at || new Date(i.expires_at).getTime() > now);
    },
  });
  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await db.rpc("respond_to_invitation" as never, { p_invitation_id: id, p_accept: accept } as never);
      if (error) throw error;
      return accept;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["portal", "pending-invitations"] });
      qc.invalidateQueries({ queryKey: ["portal", "open-projects"] });
    },
  });
  if (invites.isLoading || !invites.data?.length) return null;
  return (
    <section className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-display font-semibold"><Mail className="size-4" /> Invitations for you</p>
      <p className="mt-1 text-sm text-muted-foreground">A buyer invited your company to work with them. Accept to let them see your company and invite you to their projects. Decline to refuse. Nothing is shared until you accept.</p>
      <ul className="mt-3 space-y-2">
        {invites.data.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{i.buyer_org_name ?? "A buyer"}</span>
              <span className="text-muted-foreground"> invited </span>
              <span className="font-medium">{i.organization_name}</span>
              {i.expires_at && <span className="block text-xs text-muted-foreground">Expires {fmtDate(i.expires_at)}</span>}
            </span>
            <span className="flex gap-2">
              <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: i.id, accept: true })}>Accept</Button>
              <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({ id: i.id, accept: false })}>Decline</Button>
            </span>
          </li>
        ))}
      </ul>
      {respond.isError && <p className="mt-2 text-sm text-destructive">{(respond.error as Error).message}</p>}
    </section>
  );
}

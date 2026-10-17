import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { myDocsQuery } from "@/lib/portalData";
import { Button } from "@/components/ui/button";
import { ClosingBadge, EmptyState, Loading, PageHeader, StatusBadge, errMsg } from "@/components/app/ui-bits";
import { ReadinessList, ReadinessSummary } from "@/components/app/ReadinessList";
import { DocumentUploadDialog } from "@/components/app/DocumentUpload";
import { evaluateReadiness } from "@/lib/readiness";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/portal/projects/$projectId")({ component: ProjectView });

function ProjectView() {
  const { projectId } = Route.useParams();
  const me = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["portal", "project", projectId],
    queryFn: async () => {
      const [p, reqs, app] = await Promise.all([
        db.from("projects").select("*").eq("id", projectId).single(),
        db.from("project_requirements").select("id,category,label,mandatory").eq("project_id", projectId).eq("active", true).order("sort_order").order("created_at"),
        db.from("applications").select("id,status").eq("project_id", projectId).maybeSingle(),
      ]);
      if (p.error) throw p.error;
      return { p: p.data, reqs: reqs.data ?? [], app: app.data };
    },
  });
  const docs = useQuery(myDocsQuery);
  if (q.isLoading || docs.isLoading) return <Loading />;
  if (q.isError || !q.data) return <EmptyState title="Project not found" body="It may have closed or you may not have access to it." />;
  const { p, reqs, app } = q.data;
  const r = evaluateReadiness(reqs as never, (docs.data ?? []) as never);
  const closed = p.status !== "open" || (p.closes_at && new Date(p.closes_at) < new Date());

  async function start() {
    if (!me.org) return;
    setBusy(true);
    const { data, error } = await db.from("applications").insert({ project_id: projectId, organization_id: me.org.id, status: "draft", contact_name: me.fullName, contact_email: me.email }).select("id").single();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    navigate({ to: "/portal/applications/$applicationId", params: { applicationId: data.id } });
  }
  return (
    <>
      <PageHeader title={p.title} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={p.status} /><ClosingBadge closesAt={p.closes_at} status={p.status} />{p.reference && <span>Ref {p.reference}</span>}</span>} actions={
        app ? <Button onClick={() => navigate({ to: "/portal/applications/$applicationId", params: { applicationId: app.id } })}>{app.status === "draft" ? "Continue application" : "View my application"}</Button>
          : closed ? null : <Button onClick={start} disabled={busy}>{busy ? "Starting…" : "Start application"}</Button>
      } />
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-4 lg:col-span-3">
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Location</dt><dd>{p.location || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Trade</dt><dd>{p.trade || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Closes</dt><dd>{fmtDateTime(p.closes_at)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Briefing session</dt><dd>{fmtDateTime(p.briefing_at)}</dd></div>
          </dl>
          {p.scope && <div className="rounded-lg border bg-card p-4"><h2 className="font-display font-semibold">Scope of work</h2><p className="mt-2 whitespace-pre-wrap text-sm">{p.scope}</p></div>}
          {p.evaluation_criteria && <div className="rounded-lg border bg-card p-4"><h2 className="font-display font-semibold">How submissions are evaluated</h2><p className="mt-2 whitespace-pre-wrap text-sm">{p.evaluation_criteria}</p></div>}
        </section>
        <section className="space-y-3 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Are you ready?</h2>
          {!reqs.length ? <EmptyState title="No checklist yet" /> : (
            <>
              <ReadinessSummary r={r} />
              <ReadinessList r={r} renderAction={(_id, cat) => <Button size="sm" variant="outline" onClick={() => setUp(cat)}>Upload</Button>} />
            </>
          )}
        </section>
      </div>
      {me.org && up && <DocumentUploadDialog orgId={me.org.id} open onOpenChange={(o) => !o && setUp(null)} defaultCategory={up} />}
    </>
  );
}

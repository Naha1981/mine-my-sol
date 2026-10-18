import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Field, Loading, PageHeader, Pill, StatusBadge, errMsg } from "@/components/app/ui-bits";
import { DOC_CATEGORIES, categoryLabel, humanize } from "@/lib/constants";
import { fmtDate, fmtZAR, fromLocalInput, toLocalInput } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/projects/$projectId")({ component: ProjectEditor });

function ProjectEditor() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "project", projectId],
    queryFn: async () => {
      const [p, reqs, invites, contractors, apps] = await Promise.all([
        db.from("projects").select("*").eq("id", projectId).single(),
        db.from("project_requirements").select("*").eq("project_id", projectId).eq("active", true).order("sort_order").order("created_at"),
        db.from("project_invites").select("organization_id").eq("project_id", projectId),
        db.from("organizations").select("id,name,status").eq("kind", "contractor").order("name"),
        db.from("applications").select("id,status,price,duration_weeks,submitted_at,organizations(name)").eq("project_id", projectId).neq("status", "draft"),
      ]);
      if (p.error) throw p.error;
      return { p: p.data, reqs: reqs.data ?? [], invited: new Set<string>((invites.data ?? []).map((i) => i.organization_id)), contractors: contractors.data ?? [], apps: apps.data ?? [] };
    },
  });
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const [newReq, setNewReq] = useState({ category: "", label: "", mandatory: true });
  useEffect(() => {
    if (!q.data) return;
    if (dirty.current) return; // keep unsaved edits when the checklist or invites change
    const p = q.data.p;
    setF({
      title: p.title ?? "", reference: p.reference ?? "", summary: p.summary ?? "", scope: p.scope ?? "", location: p.location ?? "", trade: p.trade ?? "",
      visibility: p.visibility, opens_at: toLocalInput(p.opens_at), closes_at: toLocalInput(p.closes_at), briefing_at: toLocalInput(p.briefing_at), evaluation_criteria: p.evaluation_criteria ?? "",
    });
  }, [q.data?.p.id, q.data?.p.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin"] }); };
  const set = (k: string) => (e: { target: { value: string } }) => { dirty.current = true; setF((s) => ({ ...s, [k]: e.target.value })); };

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <EmptyState title="Project not found" body="It may have been removed." />;
  const { p, reqs, invited, contractors, apps } = q.data;

  async function save(extra: Record<string, unknown> = {}) {
    if (f["title"]!.trim().length < 3) return toast.error("The title needs at least 3 characters");
    if (f["opens_at"] && f["closes_at"] && f["closes_at"] < f["opens_at"]) return toast.error("The closing date is before the opening date");
    setBusy(true);
    const { error } = await db.from("projects").update({
      title: f["title"]!.trim(), reference: f["reference"] || null, summary: f["summary"] || null, scope: f["scope"] || null, location: f["location"] || null, trade: f["trade"] || null,
      visibility: f["visibility"], opens_at: fromLocalInput(f["opens_at"]!), closes_at: fromLocalInput(f["closes_at"]!), briefing_at: fromLocalInput(f["briefing_at"]!),
      evaluation_criteria: f["evaluation_criteria"] || null, ...extra,
    }).eq("id", projectId);
    setBusy(false);
    if (error) { setPubError(errMsg(error)); return toast.error(errMsg(error)); }
    dirty.current = false;
    toast.success("Saved");
    refresh();
  }
  async function setStatus(status: string) {
    setPubError(null);
    if (status === "open") {
      const problem =
        !reqs.length ? "Add at least one checklist item before publishing"
        : !f["closes_at"] ? "Set a closing date before publishing, then press Publish again"
        : (p.visibility === "invited" && !invited.size && f["visibility"] === "invited") ? "Invite at least one contractor, or make the project public"
        : null;
      if (problem) { setPubError(problem); toast.error(problem); return; }
    }
    await save({ status });
  }
  async function addReq() {
    if (!newReq.category || !newReq.label.trim()) return toast.error("Choose a category and give the item a name");
    const { error } = await db.from("project_requirements").insert({ project_id: projectId, category: newReq.category, label: newReq.label.trim(), mandatory: newReq.mandatory, sort_order: reqs.length });
    if (error) return toast.error(errMsg(error));
    setNewReq({ category: "", label: "", mandatory: true });
    refresh();
  }
  async function removeReq(id: string) {
    const { error } = await db.from("project_requirements").update({ active: false }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    refresh();
  }
  async function toggleInvite(orgId: string, on: boolean) {
    const r = on
      ? await db.from("project_invites").insert({ project_id: projectId, organization_id: orgId })
      : await db.from("project_invites").delete().eq("project_id", projectId).eq("organization_id", orgId);
    if (r.error) return toast.error(errMsg(r.error));
    refresh();
  }
  const locked = p.status !== "draft";

  return (
    <>
      <PageHeader title={p.title} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={p.status} /><span>Checklist version {p.requirements_version}</span></span>} actions={
        <>
          {p.status === "draft" && <Button onClick={() => setStatus("open")} disabled={busy}>Publish</Button>}
          {p.status === "open" && <Button variant="outline" onClick={() => setStatus("closed")} disabled={busy}>Close submissions</Button>}
          {(p.status === "draft" || p.status === "open") && <Button variant="outline" onClick={() => setStatus("cancelled")} disabled={busy}>Cancel project</Button>}
        </>
      } />
      {pubError && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{pubError}</div>}
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-4 rounded-lg border bg-card p-4 lg:col-span-3">
          <h2 className="font-display text-lg font-bold">Details</h2>
          <Field label="Title"><Input value={f["title"] ?? ""} onChange={set("title")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference"><Input value={f["reference"] ?? ""} onChange={set("reference")} /></Field>
            <Field label="Trade"><Input value={f["trade"] ?? ""} onChange={set("trade")} placeholder="e.g. Civil, Electrical" /></Field>
            <Field label="Location"><Input value={f["location"] ?? ""} onChange={set("location")} /></Field>
            <Field label="Visibility">
              <Select value={f["visibility"] ?? "invited"} onValueChange={(v) => setF((s) => ({ ...s, visibility: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="invited">Invited contractors only</SelectItem><SelectItem value="public">Shown on the public page</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Opens"><Input type="datetime-local" value={f["opens_at"] ?? ""} onChange={set("opens_at")} /></Field>
            <Field label="Closes"><Input type="datetime-local" value={f["closes_at"] ?? ""} onChange={set("closes_at")} /></Field>
            <Field label="Briefing session"><Input type="datetime-local" value={f["briefing_at"] ?? ""} onChange={set("briefing_at")} /></Field>
          </div>
          <Field label="Summary" hint="One or two lines shown in lists."><Textarea rows={2} value={f["summary"] ?? ""} onChange={set("summary")} /></Field>
          <Field label="Scope of work"><Textarea rows={6} value={f["scope"] ?? ""} onChange={set("scope")} /></Field>
          <Field label="Evaluation criteria"><Textarea rows={3} value={f["evaluation_criteria"] ?? ""} onChange={set("evaluation_criteria")} /></Field>
          <Button onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Document checklist</h2>
            <p className="mb-3 text-xs text-muted-foreground">Items cannot be edited once added. Remove and re-add to change one; the checklist version updates and the change is recorded.</p>
            {!reqs.length ? <p className="mb-3 text-sm text-muted-foreground">No items yet.</p> : (
              <ul className="mb-3 divide-y rounded-md border">
                {reqs.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0"><p className="text-sm font-medium">{r.label}</p><p className="text-xs text-muted-foreground">{categoryLabel(r.category)} · {r.mandatory ? "Required" : "Optional"}</p></div>
                    <button aria-label={`Remove ${r.label}`} onClick={() => removeReq(r.id)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <Select value={newReq.category} onValueChange={(v) => setNewReq((s) => ({ ...s, category: v, label: s.label || categoryLabel(v) }))}>
                <SelectTrigger><SelectValue placeholder="Document category" /></SelectTrigger>
                <SelectContent>{DOC_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Name shown to contractors" value={newReq.label} onChange={(e) => setNewReq((s) => ({ ...s, label: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={newReq.mandatory} onCheckedChange={(c) => setNewReq((s) => ({ ...s, mandatory: c === true }))} /> Required for submission</label>
              <Button size="sm" variant="outline" onClick={addReq}><Plus className="size-4" /> Add item</Button>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Invited contractors</h2>
            {!contractors.length ? <p className="mt-2 text-sm text-muted-foreground">No contractors yet. <Link to="/admin/contractors" className="text-primary underline">Invite one</Link>.</p> : (
              <ul className="mt-2 divide-y">
                {contractors.map((c) => (
                  <li key={c.id}><label className="flex items-center gap-3 py-2 text-sm"><Checkbox checked={invited.has(c.id)} disabled={c.status !== "active"} onCheckedChange={(v) => toggleInvite(c.id, v === true)} />{c.name}{c.status !== "active" && <Pill tone="red">Suspended</Pill>}</label></li>
                ))}
              </ul>
            )}
            {p.visibility === "public" && <p className="mt-2 text-xs text-muted-foreground">This project is public, so every signed-in contractor can see it. Invites still notify contractors.</p>}
          </section>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-bold">Submissions ({apps.length})</h2>
        {!apps.length ? <EmptyState title="No submissions yet" /> : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Contractor</th><th className="px-4 py-2">Price</th><th className="px-4 py-2">Weeks</th><th className="px-4 py-2">Submitted</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody className="divide-y">
                {[...apps].sort((a, b) => Number(a.price ?? 1e18) - Number(b.price ?? 1e18)).map((a: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                  <tr key={a.id} className="hover:bg-muted/40"><td className="px-4 py-2"><Link to="/admin/applications/$applicationId" params={{ applicationId: a.id }} className="font-medium text-primary underline">{a.organizations?.name}</Link></td><td className="px-4 py-2">{fmtZAR(a.price)}</td><td className="px-4 py-2">{a.duration_weeks ?? "—"}</td><td className="px-4 py-2">{fmtDate(a.submitted_at)}</td><td className="px-4 py-2"><StatusBadge status={a.status} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {locked && <p className="mt-4 text-xs text-muted-foreground">Status: {humanize(p.status)}. Changing the checklist on a published project creates a new checklist version.</p>}
    </>
  );
}

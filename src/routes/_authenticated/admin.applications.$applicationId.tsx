import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { db, signedUrl } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ExpiryBadge, Field, Loading, PageHeader, Pill, StatusBadge, VerificationBadge, errMsg } from "@/components/app/ui-bits";
import { REVIEW_STATUSES, categoryLabel, humanize } from "@/lib/constants";
import { fmtBytes, fmtDate, fmtDateTime, fmtZAR } from "@/lib/format";
import { expiryState } from "@/lib/readiness";
import { Mobilisation } from "@/components/app/Mobilisation";

export const Route = createFileRoute("/_authenticated/admin/applications/$applicationId")({ component: Review });

function Review() {
  const { applicationId } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "application", applicationId],
    queryFn: async () => {
      const a = await db.from("applications").select("*, projects(id,title,status,requirements_version), organizations(id,name)").eq("id", applicationId).single();
      if (a.error) throw a.error;
      const [docs, reviews, award, cp] = await Promise.all([
        db.from("application_documents").select("id, project_requirements(label,category,mandatory), document_versions(id,version,file_name,mime_type,size_bytes,storage_path,expires_at, documents(id,title,category,verification,verification_note,expires_at))").eq("application_id", applicationId),
        db.from("reviews").select("*").eq("application_id", applicationId).order("created_at", { ascending: false }),
        db.from("awards").select("*").eq("application_id", applicationId).maybeSingle(),
        db.from("contractor_profiles").select("*").eq("organization_id", a.data.organization_id).maybeSingle(),
      ]);
      return { a: a.data, docs: docs.data ?? [], reviews: reviews.data ?? [], award: award.data, cp: cp.data };
    },
  });
  const [note, setNote] = useState("");
  const [rv, setRv] = useState({ technical_score: "", price_score: "", compliance_ok: true, notes: "" });
  const [awardOpen, setAwardOpen] = useState(false);
  const [awardValue, setAwardValue] = useState("");
  const [awardNotes, setAwardNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <EmptyState title="Application not found" />;
  const { a, docs, reviews, award, cp } = q.data;
  const snap = a.company_snapshot ?? cp ?? {};

  async function open(path: string, name: string) {
    try { window.open(await signedUrl(path, name), "_blank", "noopener"); } catch (e) { toast.error(errMsg(e)); }
  }
  async function verify(docId: string, verification: "verified" | "rejected" | "unverified", n?: string) {
    const { error } = await db.from("documents").update({ verification, verification_note: n ?? null }).eq("id", docId);
    if (error) return toast.error(errMsg(error));
    toast.success(verification === "verified" ? "Marked as verified" : verification === "rejected" ? "Marked as rejected" : "Verification cleared");
    refresh();
  }
  async function setStatus(status: string) {
    setBusy(true);
    const { error } = await db.rpc("set_application_status", { _app: applicationId, _status: status, _note: note || null });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Status updated and the contractor notified");
    setNote(""); refresh();
  }
  async function saveReview() {
    const t = rv.technical_score === "" ? null : Number(rv.technical_score);
    const p = rv.price_score === "" ? null : Number(rv.price_score);
    if ([t, p].some((x) => x !== null && (Number.isNaN(x) || x < 0 || x > 100))) return toast.error("Scores must be between 0 and 100");
    const { error } = await db.from("reviews").insert({ application_id: applicationId, technical_score: t, price_score: p, compliance_ok: rv.compliance_ok, notes: rv.notes || null });
    if (error) return toast.error(errMsg(error));
    setRv({ technical_score: "", price_score: "", compliance_ok: true, notes: "" });
    toast.success("Review saved"); refresh();
  }
  async function doAward() {
    const v = awardValue === "" ? null : Number(awardValue);
    if (v !== null && (Number.isNaN(v) || v < 0)) return toast.error("Enter a valid contract value");
    setBusy(true);
    const { error } = await db.rpc("award_application", { _app: applicationId, _value: v, _notes: awardNotes || null });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setAwardOpen(false); toast.success("Awarded. Other submitted applications were marked unsuccessful and notified."); refresh();
  }
  const canDecide = !["draft", "withdrawn", "awarded"].includes(a.status) && !award;

  return (
    <>
      <PageHeader title={a.organizations?.name} description={<span className="flex flex-wrap items-center gap-2"><Link to="/admin/projects/$projectId" params={{ projectId: a.projects.id }} className="text-primary underline">{a.projects.title}</Link><StatusBadge status={a.status} /></span>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Offer</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="font-semibold">{fmtZAR(a.price)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="font-semibold">{a.duration_weeks ? `${a.duration_weeks} weeks` : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd>{fmtDateTime(a.submitted_at)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Checklist version</dt><dd>{a.requirements_version ?? "—"}{a.requirements_version && a.requirements_version !== a.projects.requirements_version && <span className="ml-1 text-xs text-muted-foreground">(project now at v{a.projects.requirements_version})</span>}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Technical response</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm">{a.technical_response || "—"}</p>
            {a.methodology && <><h3 className="mt-4 text-sm font-semibold">Methodology</h3><p className="mt-1 whitespace-pre-wrap text-sm">{a.methodology}</p></>}
            <p className="mt-4 text-xs text-muted-foreground">Declaration signed by {a.declaration_name || "—"}{a.declaration_accepted ? "" : " (not accepted)"}.</p>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Documents</h2>
            <p className="mb-3 text-xs text-muted-foreground">Attached documents are frozen at submission. Verifying a document here is MySol's own check.</p>
            {!docs.length ? <p className="text-sm text-muted-foreground">No documents attached.</p> : (
              <ul className="divide-y rounded-md border">
                {docs.map((d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                  const v = d.document_versions; const doc = v?.documents;
                  return (
                    <li key={d.id} className="space-y-2 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0"><p className="text-sm font-medium">{d.project_requirements?.label}</p><p className="text-xs text-muted-foreground">{doc?.title} · v{v?.version} · {v?.file_name} ({fmtBytes(v?.size_bytes ?? 0)})</p></div>
                        <Button size="sm" variant="outline" onClick={() => open(v.storage_path, v.file_name)}><Download className="size-4" /> Open</Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ExpiryBadge state={expiryState(v?.expires_at ?? doc?.expires_at ?? null)} /><span className="text-xs text-muted-foreground">expires {fmtDate(v?.expires_at ?? doc?.expires_at)}</span>
                        <VerificationBadge v={doc?.verification ?? "unverified"} />
                        <Button size="sm" variant="ghost" onClick={() => verify(doc.id, "verified")}>Verify</Button>
                        <Button size="sm" variant="ghost" onClick={() => { const n = window.prompt("Reason for rejecting this document (the contractor can see it)"); if (n) verify(doc.id, "rejected", n); }}>Reject</Button>
                      </div>
                      {doc?.verification_note && <p className="text-xs text-muted-foreground">Note: {doc.verification_note}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Company</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {[["Registration no.", snap.registration_no], ["CSD no.", snap.csd_no], ["CIDB grade", snap.cidb_grade], ["B-BBEE level", snap.bbbee_level], ["Employees", snap.employees], ["Years operating", snap.years_operating], ["Contact", snap.contact_name], ["Phone", snap.contact_phone], ["Email", snap.contact_email]].map(([k, val]) => (
                <div key={String(k)}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{val ?? "—"}</dd></div>
              ))}
            </dl>
            {!!snap.trades?.length && <p className="mt-3 text-sm">Trades: {snap.trades.join(", ")}</p>}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Decision</h2>
            {award ? <p className="mt-2 text-sm">Awarded {fmtDate(award.created_at)}{award.value ? ` for ${fmtZAR(award.value)}` : ""}.</p> : canDecide ? (
              <div className="mt-3 space-y-3">
                <Field label="Note to contractor (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2">{REVIEW_STATUSES.filter((s) => s !== a.status).map((s) => <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => setStatus(s)}>{humanize(s)}</Button>)}</div>
                <Button className="w-full bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => setAwardOpen(true)}>Award this application</Button>
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">No decision is available for a {humanize(a.status).toLowerCase()} application.</p>}
            {a.status_note && <p className="mt-3 text-xs text-muted-foreground">Last note: {a.status_note}</p>}
          </section>
          {a.status === "awarded" && <Mobilisation applicationId={applicationId} admin />}
          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">Internal reviews</h2>
            <p className="mb-3 text-xs text-muted-foreground">Only MySol administrators see these.</p>
            {reviews.map((r: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
              <div key={r.id} className="mb-2 rounded-md bg-muted/40 p-3 text-sm"><div className="flex flex-wrap gap-2">{r.technical_score !== null && <Pill>Technical {r.technical_score}</Pill>}{r.price_score !== null && <Pill>Price {r.price_score}</Pill>}{r.compliance_ok !== null && <Pill tone={r.compliance_ok ? "green" : "red"}>{r.compliance_ok ? "Compliant" : "Not compliant"}</Pill>}</div>{r.notes && <p className="mt-1 whitespace-pre-wrap">{r.notes}</p>}<p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</p></div>
            ))}
            <div className="space-y-2 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-2"><Input inputMode="numeric" placeholder="Technical 0-100" value={rv.technical_score} onChange={(e) => setRv({ ...rv, technical_score: e.target.value })} /><Input inputMode="numeric" placeholder="Price 0-100" value={rv.price_score} onChange={(e) => setRv({ ...rv, price_score: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={rv.compliance_ok} onCheckedChange={(c) => setRv({ ...rv, compliance_ok: c === true })} /> Compliant with the checklist</label>
              <Textarea rows={2} placeholder="Notes" value={rv.notes} onChange={(e) => setRv({ ...rv, notes: e.target.value })} />
              <Button size="sm" onClick={saveReview}>Save review</Button>
            </div>
          </section>
        </div>
      </div>
      <Dialog open={awardOpen} onOpenChange={setAwardOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Award to {a.organizations?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This closes the project and marks every other active application as unsuccessful. Contractors are notified. It cannot be undone.</p>
          <Field label="Contract value (ZAR)"><Input inputMode="decimal" value={awardValue} onChange={(e) => setAwardValue(e.target.value)} placeholder={a.price ? String(a.price) : ""} /></Field>
          <Field label="Award notes"><Textarea rows={2} value={awardNotes} onChange={(e) => setAwardNotes(e.target.value)} /></Field>
          <DialogFooter><Button onClick={doAward} disabled={busy}>{busy ? "Awarding…" : "Confirm award"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
void categoryLabel;

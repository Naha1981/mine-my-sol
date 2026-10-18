import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Plus, Trash2 } from "lucide-react";
import JSZip from "jszip";
import { db, signedUrl } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Loading, PageHeader, errMsg } from "@/components/app/ui-bits";
import { ReadinessList, ReadinessSummary } from "@/components/app/ReadinessList";
import { DOC_CATEGORIES, categoryLabel } from "@/lib/constants";
import { evaluateReadiness, type DocLike } from "@/lib/readiness";
import { fmtDate } from "@/lib/format";
import { myDocsQuery } from "@/lib/portalData";

export const Route = createFileRoute("/_authenticated/portal/tenderready")({ component: TenderReady });

const COMMON = ["company_registration", "tax_compliance", "bbbee", "coid", "insurance", "safety_file", "banking"];
const safe = (s: string) => s.replace(/[^a-zA-Z0-9 ._-]/g, "").trim().slice(0, 60) || "item";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function TenderReady() {
  const me = useMe();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", buyer: "", closes_at: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const tenders = useQuery({
    queryKey: ["ext-tenders", me.org?.id], enabled: !!me.org,
    queryFn: async (): Promise<Row[]> => { const { data, error } = await db.from("external_tenders").select("*").order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const docs = useQuery(myDocsQuery);
  if (tenders.isLoading || docs.isLoading) return <Loading />;
  if (tenders.isError) return <EmptyState title="TenderReady could not be loaded" body="Refresh the page to try again." />;
  const list = tenders.data ?? [];
  const current = list.find((t) => t.id === sel) ?? null;

  async function create() {
    if (form.title.trim().length < 2) { toast.error("Give the tender a name"); return; }
    setBusy(true);
    const { data, error } = await db.from("external_tenders").insert({ organization_id: me.org!.id, title: form.title.trim(), buyer: form.buyer.trim() || null, closes_at: form.closes_at || null, notes: form.notes.trim() || null }).select("id").single();
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    setForm({ title: "", buyer: "", closes_at: "", notes: "" }); await qc.invalidateQueries({ queryKey: ["ext-tenders"] }); setSel(data.id); toast.success("Checklist created. Add the documents this tender asks for.");
  }
  return (
    <>
      <PageHeader title="TenderReady" description="Prepare for tenders at any buyer. Build the buyer's checklist, see what your vault already covers, and download an organised pack. TenderReady does not submit anything to another company's portal." />
      {!current ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-bold">New checklist</h2>
            <div className="mt-3 space-y-3">
              <Field label="Tender name"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Conveyor maintenance, Site 7" /></Field>
              <Field label="Buyer (optional)"><Input value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} /></Field>
              <Field label="Closing date (optional)"><Input type="date" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></Field>
              <Field label="Notes (optional)"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              <Button onClick={create} disabled={busy}><Plus className="size-4" /> Create checklist</Button>
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">Your tenders</h2>
            {!list.length ? <EmptyState title="No external tenders yet" body="Create a checklist from the buyer's tender document. Requirements differ by buyer, so only add what that tender asks for." /> : (
              <ul className="divide-y rounded-lg border bg-card">
                {list.map((t) => (
                  <li key={t.id}><button className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-muted/50" onClick={() => setSel(t.id)}>
                    <span className="font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{[t.buyer, t.closes_at ? `closes ${fmtDate(t.closes_at)}` : null].filter(Boolean).join(" · ") || "No buyer or date"}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : <Detail tender={current} docs={(docs.data ?? []) as DocLike[]} onBack={() => setSel(null)} onDeleted={() => { setSel(null); qc.invalidateQueries({ queryKey: ["ext-tenders"] }); }} orgId={me.org!.id} orgName={me.org!.name} />}
    </>
  );
}

function Detail({ tender, docs, onBack, onDeleted, orgId, orgName }: { tender: Row; docs: DocLike[]; onBack: () => void; onDeleted: () => void; orgId: string; orgName: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(""); const [cat, setCat] = useState(""); const [mand, setMand] = useState(true); const [busy, setBusy] = useState(false);
  const items = useQuery({
    queryKey: ["ext-items", tender.id],
    queryFn: async (): Promise<Row[]> => { const { data, error } = await db.from("external_tender_items").select("*").eq("tender_id", tender.id).order("sort_order").order("label"); if (error) throw error; return data ?? []; },
  });
  if (items.isLoading) return <Loading />;
  const rows = items.data ?? [];
  const reqs = rows.map((r) => ({ id: r.id as string, category: (r.category as string) || "__manual__", label: r.label as string, mandatory: r.mandatory as boolean }));
  const r = evaluateReadiness(reqs, docs);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ext-items", tender.id] });
  async function add(l: string, c: string, m: boolean) {
    const { error } = await db.from("external_tender_items").insert({ tender_id: tender.id, organization_id: orgId, label: l, category: c || null, mandatory: m, sort_order: rows.length });
    if (error) { toast.error(errMsg(error)); return; } refresh();
  }
  async function addCommon() {
    const have = new Set(rows.map((x) => x.category));
    const missing = COMMON.filter((c) => !have.has(c));
    if (!missing.length) { toast.message("Those are already on the checklist"); return; }
    const { error } = await db.from("external_tender_items").insert(missing.map((c, i) => ({ tender_id: tender.id, organization_id: orgId, label: categoryLabel(c), category: c, mandatory: true, sort_order: rows.length + i })));
    if (error) { toast.error(errMsg(error)); return; } refresh(); toast.success("Added. Remove anything this tender does not ask for.");
  }
  async function remove(id: string) { const { error } = await db.from("external_tender_items").delete().eq("id", id); if (error) { toast.error(errMsg(error)); return; } refresh(); }
  async function del() {
    if (!window.confirm("Delete this checklist? Your vault documents are not affected.")) return;
    const { error } = await db.from("external_tender_items").delete().eq("tender_id", tender.id); if (error) { toast.error(errMsg(error)); return; }
    const { error: e2 } = await db.from("external_tenders").delete().eq("id", tender.id); if (e2) { toast.error(errMsg(e2)); return; } onDeleted();
  }
  async function exportPack() {
    setBusy(true);
    try {
      const { data: vers, error } = await db.from("document_versions").select("document_id,version,storage_path,file_name");
      if (error) throw error;
      const zip = new JSZip(); const lines: string[] = []; let n = 0; let included = 0;
      for (const it of r.items) {
        n++; const d = it.document; const prefix = String(n).padStart(2, "0");
        let file = "";
        if (d && it.status !== "expired") {
          const v = (vers ?? []).find((x: Row) => x.document_id === d.id && x.version === d.current_version);
          if (v) {
            const res = await fetch(await signedUrl(v.storage_path as string));
            if (!res.ok) throw new Error("Could not read " + d.title);
            const blob = await res.blob();
            const ext = (v.file_name as string).split(".").pop() || "pdf";
            file = `${prefix} - ${safe(it.requirement.label)}.${ext}`; zip.file(file, blob); included++;
          }
        }
        lines.push(`<tr><td>${prefix}</td><td>${esc(it.requirement.label)}${it.requirement.mandatory ? "" : " (optional)"}</td><td>${esc(it.status.toUpperCase())}</td><td>${esc(d ? `${d.title} v${d.current_version}, expires ${fmtDate(d.expires_at)}` : "No document")}</td><td>${esc(file || "not included")}</td></tr>`);
      }
      const html = `<!doctype html><meta charset="utf-8"><title>Readiness report</title><style>body{font-family:system-ui;max-width:860px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;text-align:left;font-size:14px}</style><h1>Readiness report: ${esc(tender.title)}</h1><p>${esc(orgName)}${tender.buyer ? " for " + esc(tender.buyer) : ""}. Generated ${new Date().toLocaleString("en-ZA")} by MineMySol TenderReady.</p><p><b>${r.ready ? "All mandatory items have a current document." : "Not ready: " + r.blocking.length + " mandatory item(s) missing or expired."}</b> ${included} of ${r.items.length} items included in this pack.</p><table><tr><th>#</th><th>Requirement</th><th>Status</th><th>Document</th><th>File in pack</th></tr>${lines.join("")}</table><p><small>This pack was prepared for you to submit yourself through the buyer's own process. TenderReady does not submit to other companies' portals and cannot promise the buyer will accept the application. Documents are not verified by the buyer. Check the buyer's own tender document for what is mandatory: for example, Central Supplier Database registration applies to organs of state and is not automatically required by private buyers.</small></p>`;
      zip.file("00 - Readiness report.html", html);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${safe(tender.title)} - tender pack.zip`; document.body.appendChild(a); a.click(); a.remove();
      toast.success(`Pack downloaded: ${included} document(s) and a readiness report`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><button className="text-sm text-primary underline" onClick={onBack}>All tenders</button><h2 className="font-display text-xl font-bold">{tender.title}</h2><p className="text-sm text-muted-foreground">{[tender.buyer, tender.closes_at ? `closes ${fmtDate(tender.closes_at)}` : null].filter(Boolean).join(" · ")}</p></div>
        <div className="flex gap-2"><Button onClick={exportPack} disabled={busy || !rows.length}><Download className="size-4" /> {busy ? "Building pack…" : "Download pack (ZIP)"}</Button><Button variant="outline" onClick={del} aria-label="Delete checklist"><Trash2 className="size-4" /></Button></div>
      </div>
      {tender.notes && <p className="rounded-md bg-muted/50 p-3 text-sm">{tender.notes}</p>}
      {rows.length > 0 && <ReadinessSummary r={r} />}
      {!rows.length ? <EmptyState title="No requirements yet" body="Add what the buyer asks for, or start from the common documents." /> : (
        <ReadinessList r={r} renderAction={(id) => <Button size="sm" variant="ghost" onClick={() => remove(id)}>Remove</Button>} />
      )}
      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-display font-bold">Add a requirement</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="What the buyer asks for"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Valid tax compliance status" /></Field>
          <Field label="Matches this vault category" hint="Pick one so TenderReady can check your vault."><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">No vault match (attach manually)</option>{DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={mand} onChange={(e) => setMand(e.target.checked)} /> Mandatory</label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={async () => { if (label.trim().length < 2) { toast.error("Describe the requirement"); return; } await add(label.trim(), cat, mand); setLabel(""); setCat(""); }}>Add requirement</Button>
          <Button variant="outline" onClick={addCommon}>Add common documents</Button>
        </div>
      </section>
    </div>
  );
}

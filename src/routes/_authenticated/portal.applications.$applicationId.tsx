import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { myDocsQuery } from "@/lib/portalData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Field, Loading, PageHeader, StatusBadge, errMsg } from "@/components/app/ui-bits";
import { ReadinessList, ReadinessSummary } from "@/components/app/ReadinessList";
import { DocumentUploadDialog } from "@/components/app/DocumentUpload";
import { evaluateReadiness } from "@/lib/readiness";
import { fmtDate, fmtDateTime, fmtZAR } from "@/lib/format";
import { categoryLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Mobilisation } from "@/components/app/Mobilisation";

export const Route = createFileRoute("/_authenticated/portal/applications/$applicationId")({ component: ApplicationPage });

const STEPS = ["Contact", "Technical", "Price", "Documents", "Review"];

function ApplicationPage() {
  const { applicationId } = Route.useParams();
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["portal", "application", applicationId],
    gcTime: 0,
    queryFn: async () => {
      const a = await db.from("applications").select("*, projects(id,title,closes_at,status,requirements_version)").eq("id", applicationId).single();
      if (a.error) throw a.error;
      const [reqs, ad] = await Promise.all([
        db.from("project_requirements").select("id,category,label,mandatory").eq("project_id", a.data.project_id).eq("active", true).order("sort_order").order("created_at"),
        db.from("application_documents").select("id,requirement_id,document_version_id,document_versions(id,document_id,version)").eq("application_id", applicationId),
      ]);
      return { a: a.data, reqs: reqs.data ?? [], ad: ad.data ?? [] };
    },
  });
  const docs = useQuery(myDocsQuery);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Record<string, string>>({});
  const [decl, setDecl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [up, setUp] = useState<string | null>(null);
  useEffect(() => {
    const a = q.data?.a;
    if (!a) return;
    setF({ contact_name: a.contact_name ?? "", contact_phone: a.contact_phone ?? "", contact_email: a.contact_email ?? "", technical_response: a.technical_response ?? "", methodology: a.methodology ?? "", price: a.price?.toString() ?? "", duration_weeks: a.duration_weeks?.toString() ?? "", declaration_name: a.declaration_name ?? "" });
    setDecl(!!a.declaration_accepted);
  }, [q.data?.a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (q.isLoading || docs.isLoading) return <Loading />;
  if (q.isError || !q.data) return <EmptyState title="Application not found" />;
  const { a, reqs, ad } = q.data;
  const isDraft = a.status === "draft";
  const attachments: Record<string, string> = {};
  ad.forEach((x: any) => { if (x.document_versions?.document_id) attachments[x.requirement_id] = x.document_versions.document_id; }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = evaluateReadiness(reqs as never, (docs.data ?? []) as never, { attachments });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["portal"] }); qc.invalidateQueries({ queryKey: ["notifications"] }); };

  async function save(): Promise<boolean> {
    const price = f["price"] ? Number(f["price"].replace(/[\s,R]/g, "")) : null;
    const weeks = f["duration_weeks"] ? Number(f["duration_weeks"]) : null;
    if (price !== null && (Number.isNaN(price) || price < 0)) { toast.error("Enter the price as a number"); return false; }
    if (weeks !== null && (!Number.isInteger(weeks) || weeks <= 0)) { toast.error("Enter the duration as whole weeks"); return false; }
    if (f["contact_email"] && !/^\S+@\S+\.\S+$/.test(f["contact_email"])) { toast.error("Enter a valid contact email"); return false; }
    const { error } = await db.from("applications").update({
      contact_name: f["contact_name"] || null, contact_phone: f["contact_phone"] || null, contact_email: f["contact_email"] || null,
      technical_response: f["technical_response"] || null, methodology: f["methodology"] || null, price, duration_weeks: weeks,
      declaration_accepted: decl, declaration_name: f["declaration_name"] || null,
    }).eq("id", applicationId);
    if (error) { toast.error(errMsg(error)); return false; }
    return true;
  }
  async function next(to: number) {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (ok) { refresh(); setStep(to); window.scrollTo({ top: 0 }); }
  }
  async function attach(reqId: string, documentId: string) {
    const ver = await db.from("document_versions").select("id,version").eq("document_id", documentId).order("version", { ascending: false }).limit(1).single();
    if (ver.error) return toast.error(errMsg(ver.error));
    await db.from("application_documents").delete().eq("application_id", applicationId).eq("requirement_id", reqId);
    const { error } = await db.from("application_documents").insert({ application_id: applicationId, requirement_id: reqId, document_version_id: ver.data.id });
    if (error) return toast.error(errMsg(error));
    refresh();
  }
  async function detach(reqId: string) {
    await db.from("application_documents").delete().eq("application_id", applicationId).eq("requirement_id", reqId);
    refresh();
  }
  async function submit() {
    setProblems([]);
    setBusy(true);
    if (!(await save())) { setBusy(false); return; }
    refresh();
    const { data, error } = await db.rpc("submit_application", { _app: applicationId });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    if (!data?.ok) { setProblems(data?.problems ?? ["The submission could not be completed"]); window.scrollTo({ top: 0 }); return; }
    toast.success("Submitted. A confirmation is in your notifications.");
    refresh();
  }
  async function withdraw() {
    const { error } = await db.rpc("withdraw_application", { _app: applicationId });
    if (error) return toast.error(errMsg(error));
    toast.success("Application withdrawn");
    refresh();
  }

  if (!isDraft) {
    return (
      <>
        <PageHeader title={a.projects.title} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /><span>Submitted {fmtDateTime(a.submitted_at)}</span></span>} actions={
          ["submitted", "under_review"].includes(a.status) ? (
            <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Withdraw</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Withdraw this application?</AlertDialogTitle><AlertDialogDescription>MySol will no longer consider it. You cannot resubmit once withdrawn.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={withdraw}>Withdraw</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          ) : null} />
        {a.status_note && <p className="mb-4 rounded-md border bg-card p-3 text-sm"><span className="font-medium">Note from MySol:</span> {a.status_note}</p>}
        {a.status === "awarded" && <div className="mb-6"><Mobilisation applicationId={applicationId} admin={false} /></div>}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3 rounded-lg border bg-card p-4 text-sm">
            <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-muted-foreground">Price</p><p className="font-semibold">{fmtZAR(a.price)}</p></div><div><p className="text-xs text-muted-foreground">Duration</p><p className="font-semibold">{a.duration_weeks ? `${a.duration_weeks} weeks` : "—"}</p></div></div>
            <div><p className="text-xs text-muted-foreground">Technical response</p><p className="whitespace-pre-wrap">{a.technical_response}</p></div>
            {a.methodology && <div><p className="text-xs text-muted-foreground">Methodology</p><p className="whitespace-pre-wrap">{a.methodology}</p></div>}
            <p className="text-xs text-muted-foreground">Declaration signed by {a.declaration_name}.</p>
          </section>
          <section><h2 className="mb-2 font-display font-semibold">Documents submitted</h2><ReadinessList r={r} /></section>
        </div>
      </>
    );
  }

  const closed = a.projects.status !== "open" || (a.projects.closes_at && new Date(a.projects.closes_at) < new Date());
  return (
    <>
      <PageHeader title={a.projects.title} description={<span>Draft application · closes {fmtDate(a.projects.closes_at)}</span>} actions={<Button asChild variant="outline" size="sm"><Link to="/portal/projects/$projectId" params={{ projectId: a.projects.id }}>Project details</Link></Button>} />
      {closed && <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">This opportunity is no longer open, so the application cannot be submitted.</p>}
      <ol className="mb-6 grid grid-cols-5 gap-1">
        {STEPS.map((s, i) => (
          <li key={s}><button onClick={() => next(i)} className={cn("flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <span className="flex size-5 items-center justify-center rounded-full border text-[10px]">{i < step ? <Check className="size-3" /> : i + 1}</span>{s}
          </button></li>
        ))}
      </ol>
      {!!problems.length && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">This can't be submitted yet:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Who should MySol contact about this application?</h2>
            <Field label="Contact person"><Input value={f["contact_name"] ?? ""} onChange={set("contact_name")} /></Field>
            <Field label="Phone"><Input type="tel" value={f["contact_phone"] ?? ""} onChange={set("contact_phone")} /></Field>
            <Field label="Email"><Input type="email" value={f["contact_email"] ?? ""} onChange={set("contact_email")} /></Field>
            <p className="text-xs text-muted-foreground">Your company details come from your <Link to="/portal/profile" className="text-primary underline">company profile</Link> and are saved with the submission.</p>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Technical response</h2>
            <Field label="How you will deliver the scope" hint="Required"><Textarea rows={8} value={f["technical_response"] ?? ""} onChange={set("technical_response")} /></Field>
            <Field label="Methodology, equipment and team (optional)"><Textarea rows={5} value={f["methodology"] ?? ""} onChange={set("methodology")} /></Field>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Price and timing</h2>
            <Field label="Total price (ZAR, excl. VAT)"><Input inputMode="decimal" value={f["price"] ?? ""} onChange={set("price")} placeholder="e.g. 1250000" /></Field>
            <Field label="Duration (weeks)"><Input inputMode="numeric" value={f["duration_weeks"] ?? ""} onChange={set("duration_weeks")} /></Field>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Attach your documents</h2>
            <ReadinessSummary r={r} />
            <ul className="divide-y rounded-lg border">
              {r.items.map((i) => {
                const options = (docs.data ?? []).filter((d) => d.category === i.requirement.category && d.current_version > 0);
                return (
                  <li key={i.requirement.id} className="space-y-2 p-4">
                    <p className="font-medium">{i.requirement.label} <span className="text-xs font-normal text-muted-foreground">{i.requirement.mandatory ? "Required" : "Optional"} · {categoryLabel(i.requirement.category)}</span></p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={attachments[i.requirement.id] ?? ""} onValueChange={(v) => attach(i.requirement.id, v)}>
                        <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder={options.length ? "Choose from your vault" : "Nothing in your vault yet"} /></SelectTrigger>
                        <SelectContent>{options.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}{d.expires_at ? ` (expires ${fmtDate(d.expires_at)})` : ""}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => setUp(i.requirement.category)}>Upload new</Button>
                      {attachments[i.requirement.id] && <Button size="sm" variant="ghost" onClick={() => detach(i.requirement.id)}>Remove</Button>}
                    </div>
                    {i.status === "expired" && <p className="text-sm text-destructive">This document has expired. Upload a current version.</p>}
                    {i.status === "expiring" && <p className="text-sm text-warning-foreground">Expires soon. It is accepted, but consider renewing it.</p>}
                  </li>
                );
              })}
              {!r.items.length && <li className="p-4 text-sm text-muted-foreground">This project has no document checklist.</li>}
            </ul>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Review and submit</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Price</dt><dd className="font-semibold">{f["price"] ? fmtZAR(Number(f["price"])) : "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="font-semibold">{f["duration_weeks"] ? `${f["duration_weeks"]} weeks` : "—"}</dd></div></dl>
            <ReadinessSummary r={r} />
            {!!r.blocking.length && <p className="text-sm text-destructive">Still needed: {r.blocking.map((b) => b.requirement.label).join(", ")}</p>}
            <label className="flex items-start gap-3 rounded-md border p-3 text-sm"><Checkbox checked={decl} onCheckedChange={(c) => setDecl(c === true)} className="mt-0.5" /><span>I confirm the information in this application is true and I am authorised to submit it for {me.org?.name}.</span></label>
            <Field label="Type your full name to sign"><Input value={f["declaration_name"] ?? ""} onChange={set("declaration_name")} /></Field>
            <Button size="lg" className="w-full" disabled={busy || !!closed || !decl || !(f["declaration_name"] ?? "").trim()} onClick={submit}>{busy ? "Submitting…" : "Submit application"}</Button>
            <p className="text-xs text-muted-foreground">After submitting you cannot edit the application. You can withdraw it until MySol decides.</p>
          </div>
        )}
        <div className="mt-6 flex justify-between gap-2">
          <Button variant="outline" disabled={step === 0 || busy} onClick={() => next(step - 1)}><ChevronLeft className="size-4" /> Back</Button>
          {step < 4 ? <Button disabled={busy} onClick={() => next(step + 1)}>Save and continue <ChevronRight className="size-4" /></Button> : <Button variant="outline" disabled={busy} onClick={async () => { if (await save()) toast.success("Draft saved"); }}>Save draft</Button>}
        </div>
      </div>
      {me.org && up && <DocumentUploadDialog orgId={me.org.id} open onOpenChange={(o) => !o && setUp(null)} defaultCategory={up} onUploaded={({ documentId }) => { const req = reqs.find((x: any) => x.category === up); if (req) attach(req.id, documentId); }} />} {/* eslint-disable-line @typescript-eslint/no-explicit-any */}
    </>
  );
}

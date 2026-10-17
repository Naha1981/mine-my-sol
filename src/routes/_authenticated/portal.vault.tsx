import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, History, Plus, Upload } from "lucide-react";
import { db, signedUrl } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { DocumentUploadDialog } from "@/components/app/DocumentUpload";
import { EmptyState, ExpiryBadge, Loading, PageHeader, VerificationBadge, errMsg } from "@/components/app/ui-bits";
import { categoryLabel } from "@/lib/constants";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/format";
import { expiryState } from "@/lib/readiness";

export const Route = createFileRoute("/_authenticated/portal/vault")({ component: Vault });

type Existing = { id: string; title: string; category: string; expires_at: string | null };

function Vault() {
  const me = useMe();
  const [upload, setUpload] = useState<{ open: boolean; existing?: Existing }>({ open: false });
  const [history, setHistory] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["documents", "vault"],
    queryFn: async () => {
      const { data, error } = await db.from("documents").select("*, document_versions(id,version,file_name,mime_type,size_bytes,storage_path,created_at)").order("category").order("title");
      if (error) throw error;
      return data;
    },
  });
  async function download(path: string, name: string) {
    try { window.open(await signedUrl(path, name), "_blank", "noopener"); } catch (e) { toast.error(errMsg(e)); }
  }
  if (!me.org) return <EmptyState title="No company is linked to your account" body="Contact MySol so your account can be linked." />;
  const docs = q.data ?? [];
  return (
    <>
      <PageHeader title="Document vault" description="Upload each document once. It can be attached to any application." actions={<Button onClick={() => setUpload({ open: true })}><Upload className="size-4" /> Upload document</Button>} />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="Your documents could not be loaded" body="Refresh the page to try again." /> : !docs.length ? (
        <EmptyState icon={<FileText className="size-8" />} title="Your vault is empty" body="Start with your company registration, tax compliance status and B-BBEE certificate." action={<Button onClick={() => setUpload({ open: true })}>Upload your first document</Button>} />
      ) : (
        <ul className="space-y-3">
          {docs.map((d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const versions = [...(d.document_versions ?? [])].sort((a, b) => b.version - a.version);
            const cur = versions[0];
            return (
              <li key={d.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-semibold">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{categoryLabel(d.category)}{d.reference_no ? ` · Ref ${d.reference_no}` : ""}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><ExpiryBadge state={expiryState(d.expires_at)} /><span className="text-xs text-muted-foreground">{d.expires_at ? `expires ${fmtDate(d.expires_at)}` : ""}</span><VerificationBadge v={d.verification} /></div>
                    {d.verification === "rejected" && d.verification_note && <p className="mt-2 text-sm text-destructive">MySol: {d.verification_note}</p>}
                    {cur && <p className="mt-2 text-xs text-muted-foreground">v{cur.version} · {cur.file_name} · {fmtBytes(cur.size_bytes)} · uploaded {fmtDateTime(cur.created_at)}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cur && <Button size="sm" variant="outline" onClick={() => download(cur.storage_path, cur.file_name)}><Download className="size-4" /> Open</Button>}
                    <Button size="sm" variant="outline" onClick={() => setUpload({ open: true, existing: { id: d.id, title: d.title, category: d.category, expires_at: d.expires_at } })}><Plus className="size-4" /> New version</Button>
                    {versions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setHistory(history === d.id ? null : d.id)}><History className="size-4" /> History</Button>}
                  </div>
                </div>
                {history === d.id && (
                  <ul className="mt-3 divide-y rounded-md border text-sm">
                    {versions.map((v) => <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2"><span>v{v.version} · {v.file_name} · {fmtDateTime(v.created_at)}</span><Button size="sm" variant="ghost" onClick={() => download(v.storage_path, v.file_name)}>Open</Button></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DocumentUploadDialog key={upload.existing?.id ?? "new"} orgId={me.org.id} open={upload.open} onOpenChange={(o) => setUpload((u) => ({ ...u, open: o }))} existing={upload.existing} />
    </>
  );
}

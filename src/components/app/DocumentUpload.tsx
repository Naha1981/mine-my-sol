import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALLOWED_MIME, DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { fmtBytes } from "@/lib/format";
import { Field, errMsg } from "./ui-bits";

async function sha256(file: File) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateFile(file: File | null): string | null {
  if (!file) return "Choose a file to upload";
  if (!ALLOWED_MIME.includes(file.type)) return "Only PDF, JPG, PNG or WEBP files are allowed";
  if (file.size > MAX_UPLOAD_BYTES) return `File is ${fmtBytes(file.size)} — the limit is 10 MB`;
  return null;
}

type Props = {
  orgId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Upload a new version of an existing document */
  existing?: { id: string; title: string; category: string; expires_at: string | null };
  defaultCategory?: string;
  onUploaded?: (r: { documentId: string; versionId: string }) => void;
};

export function DocumentUploadDialog({ orgId, open, onOpenChange, existing, defaultCategory, onUploaded }: Props) {
  const qc = useQueryClient();
  const [category, setCategory] = useState(existing?.category ?? defaultCategory ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [reference, setReference] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState(existing?.expires_at ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setFile(null); setReference(""); setIssued(""); setErrors({});
    if (!existing) { setTitle(""); setExpires(""); setCategory(defaultCategory ?? ""); }
  };

  async function submit() {
    const e: Record<string, string> = {};
    if (!category) e["category"] = "Choose a category";
    if (!title.trim()) e["title"] = "Give the document a name";
    const fe = validateFile(file);
    if (fe) e["file"] = fe;
    if (issued && expires && expires < issued) e["expires"] = "Expiry date is before the issue date";
    setErrors(e);
    if (Object.keys(e).length || !file) return;

    setBusy(true);
    try {
      let documentId = existing?.id;
      if (!documentId) {
        const { data, error } = await supabase
          .from("documents")
          .insert({ organization_id: orgId, category, title: title.trim(), reference_no: reference || null, issued_at: issued || null, expires_at: expires || null })
          .select("id")
          .single();
        if (error) throw error;
        documentId = data.id;
      }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const path = `${orgId}/${documentId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: v, error: vErr } = await supabase
        .from("document_versions")
        .insert({
          document_id: documentId, organization_id: orgId, version: 0, storage_path: path, file_name: file.name,
          mime_type: file.type, size_bytes: file.size, sha256: await sha256(file), expires_at: expires || null,
        })
        .select("id")
        .single();
      if (vErr) throw vErr;
      toast.success(existing ? "New version uploaded" : "Document uploaded");
      qc.invalidateQueries({ queryKey: ["documents"] });
      onUploaded?.({ documentId, versionId: v.id });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error("Upload failed", { description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `New version: ${existing.title}` : "Upload a document"}</DialogTitle>
          <DialogDescription>PDF or photo, up to 10 MB. On your phone you can take a photo with the camera.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!existing && (
            <>
              <Field label="Category" error={errors["category"]}>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>
                    {DOC_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Document name" error={errors["title"]}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SARS Tax Compliance Status 2026" maxLength={150} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Reference no. (optional)"><Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} /></Field>
                <Field label="Issue date (optional)"><Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
              </div>
            </>
          )}
          <Field label="Expiry date" hint="Leave empty if this document does not expire" error={errors["expires"]}>
            <Input type="date" value={expires ?? ""} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <Field label="File" error={errors["file"]}>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/40 px-4 py-6 text-center hover:bg-muted">
              <Upload className="size-6 text-primary" />
              <span className="text-sm font-medium">{file ? file.name : "Tap to choose a file or take a photo"}</span>
              {file && <span className="text-xs text-muted-foreground">{fmtBytes(file.size)}</span>}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function openSignedUrl(path: string) {
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
  if (error || !data) {
    w?.close();
    toast.error("Could not open the file", { description: error?.message });
    return;
  }
  if (w) w.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

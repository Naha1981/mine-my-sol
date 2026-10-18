import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClosingBadge, EmptyState, Field, Loading, PageHeader, Pill, StatusBadge, errMsg } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/projects/")({ component: Projects });

function Projects() {
  const me = useMe();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["admin", "projects", me.org?.id],
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("id,reference,title,status,visibility,location,closes_at,applications(id,status)").eq("buyer_org_id", me.org?.id ?? "").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  async function create() {
    if (title.trim().length < 3) return toast.error("Enter a project title of at least 3 characters");
    setBusy(true);
    const { data, error } = await db.from("projects").insert({ title: title.trim(), buyer_org_id: me.org?.id }).select("id").single();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setOpen(false); setTitle("");
    navigate({ to: "/admin/projects/$projectId", params: { projectId: data.id } });
  }
  return (
    <>
      <PageHeader title="Projects" description="Create opportunities, set the checklist and invite contractors." actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New project</Button>} />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="Projects could not be loaded" /> : !q.data?.length ? (
        <EmptyState icon={<FolderKanban className="size-8" />} title="No projects yet" body="Create your first project, add its document checklist, then publish it." action={<Button onClick={() => setOpen(true)}>New project</Button>} />
      ) : (
        <ul className="space-y-3">
          {q.data.map((p) => {
            const subs = (p.applications ?? []).filter((a: { status: string }) => a.status !== "draft").length;
            return (
              <li key={p.id}>
                <Link to="/admin/projects/$projectId" params={{ projectId: p.id }} className="block rounded-lg border bg-card p-4 hover:border-primary/40">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-display font-semibold">{p.title}</p><StatusBadge status={p.status} /><ClosingBadge closesAt={p.closes_at} status={p.status} /><Pill>{p.visibility === "public" ? "Public" : "Invited only"}</Pill></div>
                  <p className="mt-1 text-xs text-muted-foreground">{[p.reference, p.location].filter(Boolean).join(" · ")}{p.closes_at ? ` · closes ${fmtDate(p.closes_at)}` : ""} · {subs} submitted</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <Field label="Project title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Haul road maintenance, Site 3" /></Field>
          <DialogFooter><Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create draft"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Mail, Plus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, Loading, PageHeader, Pill, StatusBadge, errMsg } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/admin/contractors")({ component: Contractors });

function Contractors() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ code: string; email: string; name: string } | null>(null);
  const q = useQuery({
    queryKey: ["admin", "contractors"],
    queryFn: async () => {
      const [orgs, inv] = await Promise.all([
        db.from("organizations").select("id,name,status,created_at,contractor_profiles(contact_name,contact_email,contact_phone,cidb_grade,bbbee_level,trades,regions)").eq("kind", "contractor").order("name"),
        db.from("invitations").select("*").order("created_at", { ascending: false }),
      ]);
      if (orgs.error) throw orgs.error;
      return { orgs: orgs.data ?? [], inv: inv.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "contractors"] });
  async function invite() {
    const ok = z.string().email().safeParse(email.trim());
    if (!ok.success) return toast.error("Enter a valid email address");
    if (name.trim().length < 2) return toast.error("Enter the company name");
    setBusy(true);
    const { data, error } = await db.from("invitations").insert({ email: email.trim().toLowerCase(), organization_name: name.trim() }).select("code").single();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setCreated({ code: data.code, email: email.trim(), name: name.trim() });
    setEmail(""); setName("");
    refresh();
  }
  async function setStatus(id: string, status: "active" | "suspended") {
    const { error } = await db.rpc("set_contractor_status", { _org: id, _status: status });
    if (error) return toast.error(errMsg(error));
    toast.success(status === "active" ? "Contractor reactivated" : "Contractor suspended");
    refresh();
  }
  async function revoke(id: string) {
    const { error } = await db.from("invitations").update({ status: "revoked" }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    refresh();
  }
  const link = typeof window !== "undefined" ? (window.location.hash.startsWith("#/") ? `${window.location.origin}${window.location.pathname}#/auth?mode=register` : `${window.location.origin}/auth?mode=register`) : "";
  const mailto = created ? `mailto:${created.email}?subject=${encodeURIComponent("Your MineMySol invitation")}&body=${encodeURIComponent(`Hello,\n\nYou have been invited to register ${created.name} on MySol's contractor portal.\n\nRegister here: ${link}\nInvitation code: ${created.code}\nUse this email address when you register: ${created.email}\n\nThe code is valid for 30 days.`)}` : "";

  return (
    <>
      <PageHeader title="Contractors" description="Invite contractors and manage their access." actions={<Button onClick={() => { setCreated(null); setOpen(true); }}><Plus className="size-4" /> Invite contractor</Button>} />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="Contractors could not be loaded" /> : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">Registered ({q.data?.orgs.length ?? 0})</h2>
            {!q.data?.orgs.length ? <EmptyState icon={<Users className="size-8" />} title="No contractors have registered" body="Send an invitation to get started." /> : (
              <ul className="space-y-3">
                {q.data.orgs.map((o: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                  const cp = Array.isArray(o.contractor_profiles) ? o.contractor_profiles[0] : o.contractor_profiles;
                  return (
                    <li key={o.id} className="rounded-lg border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><p className="font-display font-semibold">{o.name}</p><StatusBadge status={o.status} />{cp?.cidb_grade && <Pill>CIDB {cp.cidb_grade}</Pill>}{cp?.bbbee_level && <Pill>B-BBEE {cp.bbbee_level}</Pill>}</div>
                          <p className="mt-1 text-sm text-muted-foreground">{[cp?.contact_name, cp?.contact_email, cp?.contact_phone].filter(Boolean).join(" · ") || "No contact details yet"}</p>
                          {!!cp?.trades?.length && <p className="mt-1 text-xs text-muted-foreground">Trades: {cp.trades.join(", ")}</p>}
                        </div>
                        {o.status === "active" ? <Button size="sm" variant="outline" onClick={() => setStatus(o.id, "suspended")}>Suspend</Button> : <Button size="sm" variant="outline" onClick={() => setStatus(o.id, "active")}>Reactivate</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">Invitations</h2>
            {!q.data?.inv.length ? <EmptyState title="No invitations sent yet" /> : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Company</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
                  <tbody className="divide-y">
                    {q.data.inv.map((i: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <tr key={i.id}><td className="px-4 py-2">{i.organization_name}</td><td className="px-4 py-2">{i.email}</td><td className="px-4 py-2 font-mono text-xs">{i.status === "pending" ? i.code : "—"}</td><td className="px-4 py-2"><StatusBadge status={i.status === "pending" && new Date(i.expires_at) < new Date() ? "closed" : i.status} />{i.status === "pending" && <span className="ml-2 text-xs text-muted-foreground">until {fmtDate(i.expires_at)}</span>}</td><td className="px-4 py-2 text-right">{i.status === "pending" && <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>Revoke</Button>}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{created ? "Invitation ready" : "Invite a contractor"}</DialogTitle>
            <DialogDescription>{created ? "Send the code to the contractor. It only works with the email address below." : "The contractor registers with this email address and a one-time code."}</DialogDescription></DialogHeader>
          {created ? (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-4 text-center"><p className="text-xs text-muted-foreground">Invitation code for {created.name}</p><p className="mt-1 font-mono text-2xl font-bold tracking-widest">{created.code}</p><p className="mt-1 text-xs text-muted-foreground">{created.email}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={async () => { await navigator.clipboard?.writeText(`Register: ${link}\nCode: ${created.code}\nEmail: ${created.email}`); toast.success("Copied"); }}><Copy className="size-4" /> Copy details</Button>
                <Button asChild><a href={mailto}><Mail className="size-4" /> Open in email</a></Button>
              </div>
            </div>
          ) : (
            <>
              <Field label="Company name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Contact email"><Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <DialogFooter><Button onClick={invite} disabled={busy}>{busy ? "Creating…" : "Create invitation"}</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { EmptyState, Loading, PageHeader } from "@/components/app/ui-bits";
import { fmtDateTime, } from "@/lib/format";
import { humanize } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: Audit });

const ENTITIES = ["all", "projects", "project_requirements", "documents", "document_versions", "applications", "awards", "organizations", "invitations"];

function Audit() {
  const [entity, setEntity] = useState("all");
  const q = useQuery({
    queryKey: ["admin", "audit", entity],
    queryFn: async () => {
      let r = db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(200);
      if (entity !== "all") r = r.eq("entity", entity);
      const { data, error } = await r;
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean))];
      const names = ids.length ? (await db.from("profiles").select("id,full_name,email").in("id", ids)).data ?? [] : [];
      return (data ?? []).map((e) => ({ ...e, actor: names.find((n) => n.id === e.actor_id) }));
    },
  });
  return (
    <>
      <PageHeader title="Audit log" description="Every change is recorded automatically and cannot be edited." actions={
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{ENTITIES.map((e) => <SelectItem key={e} value={e}>{e === "all" ? "All records" : humanize(e)}</SelectItem>)}</SelectContent>
        </Select>
      } />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="The audit log could not be loaded" /> : !q.data?.length ? <EmptyState title="No events yet" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Record</th></tr></thead>
            <tbody className="divide-y">
              {q.data.map((e) => (
                <tr key={e.id}><td className="whitespace-nowrap px-4 py-2">{fmtDateTime(e.created_at)}</td><td className="px-4 py-2">{e.actor?.full_name || e.actor?.email || "System"}</td><td className="px-4 py-2">{humanize(String(e.action).toLowerCase())}</td><td className="px-4 py-2 text-muted-foreground">{humanize(e.entity)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

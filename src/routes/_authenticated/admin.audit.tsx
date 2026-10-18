import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { EmptyState, Loading, PageHeader } from "@/components/app/ui-bits";
import { fmtDateTime, } from "@/lib/format";
import { humanize } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: Audit });

const ENTITY_ONE: Record<string, string> = { projects: "project", project_requirements: "checklist item", documents: "document", document_versions: "document version", applications: "application", awards: "award", organizations: "company", invitations: "invitation", reviews: "review", mobilisation_items: "mobilisation item" };
const VERB: Record<string, string> = { insert: "Created", update: "Updated", delete: "Removed" };
function describe(action: string, entity: string) {
  const a = String(action).toLowerCase();
  if (a === "mobilisation_started") return "Mobilisation started";
  if (entity === "awards" && a === "insert") return "Contract awarded";
  if (entity === "awards" && a === "delete") return "Award removed";
  if (entity === "reviews" && a === "insert") return "Internal review saved";
  if (entity === "applications" && a === "update") return "Application status or details changed";
  return `${VERB[a] ?? humanize(a)} ${ENTITY_ONE[entity] ?? humanize(entity).toLowerCase()}`;
}
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
        <>
        <ul className="divide-y rounded-lg border bg-card md:hidden">
          {q.data.map((e) => (
            <li key={e.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{describe(e.action, e.entity)}</span><span className="text-xs text-muted-foreground">{humanize(e.entity)}</span></div>
              <div className="mt-0.5 text-xs text-muted-foreground">{e.actor?.full_name || e.actor?.email || "System"} · {fmtDateTime(e.created_at)}</div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Record</th></tr></thead>
            <tbody className="divide-y">
              {q.data.map((e) => (
                <tr key={e.id}><td className="whitespace-nowrap px-4 py-2">{fmtDateTime(e.created_at)}</td><td className="px-4 py-2">{e.actor?.full_name || e.actor?.email || "System"}</td><td className="px-4 py-2">{describe(e.action, e.entity)}</td><td className="px-4 py-2 text-muted-foreground">{humanize(e.entity)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  );
}

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { EmptyState, Loading, PageHeader, StatusBadge } from "@/components/app/ui-bits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, fmtZAR } from "@/lib/format";
import { humanize } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/admin/applications/")({ component: Applications });

const FILTERS = ["all", "submitted", "under_review", "shortlisted", "awarded", "unsuccessful", "withdrawn"];

function Applications() {
  const [status, setStatus] = useState("all");
  const q = useQuery({
    queryKey: ["admin", "applications", status],
    queryFn: async () => {
      let r = db.from("applications").select("id,status,price,duration_weeks,submitted_at,projects(title),organizations(name)").neq("status", "draft").order("submitted_at", { ascending: false, nullsFirst: false });
      if (status !== "all") r = r.eq("status", status);
      const { data, error } = await r;
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <PageHeader title="Applications" description="Review, compare and decide." actions={
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : humanize(s)}</SelectItem>)}</SelectContent></Select>
      } />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="Applications could not be loaded" /> : !q.data?.length ? (
        <EmptyState icon={<ClipboardList className="size-8" />} title="No applications here" body="Submitted applications appear once contractors apply." />
      ) : (
        <ul className="space-y-3">
          {q.data.map((a: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
            <li key={a.id}><Link to="/admin/applications/$applicationId" params={{ applicationId: a.id }} className="block rounded-lg border bg-card p-4 hover:border-primary/40">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-display font-semibold">{a.organizations?.name}</p><StatusBadge status={a.status} /></div>
              <p className="mt-1 text-sm text-muted-foreground">{a.projects?.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{fmtZAR(a.price)} · {a.duration_weeks ? `${a.duration_weeks} weeks` : "no duration given"} · submitted {fmtDate(a.submitted_at)}</p>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

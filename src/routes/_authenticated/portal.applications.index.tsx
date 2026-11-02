import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { db } from "@/lib/db";
import { EmptyState, Loading, PageHeader, StatusBadge } from "@/components/app/ui-bits";
import { fmtDate, fmtZAR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/portal/applications/")({ component: List });

function List() {
  const q = useQuery({
    queryKey: ["portal", "applications"],
    queryFn: async () => {
      const { data, error } = await db.from("applications").select("id,status,price,submitted_at,updated_at,projects(title)").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <PageHeader title="My applications" />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="Applications could not be loaded" /> : !q.data?.length ? (
        <EmptyState icon={<Send className="size-8" />} title="No applications yet" body="Start one from a project page." />
      ) : (
        <ul className="space-y-3">
          {q.data.map((a: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
            <li key={a.id}><Link to="/portal/applications/$applicationId" params={{ applicationId: a.id }} className="block rounded-lg border bg-card p-4 hover:border-primary/40">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-display font-semibold">{a.projects?.title ?? "Opportunity unavailable"}</p><StatusBadge status={a.status} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{a.status === "draft" ? `Draft, last edited ${fmtDate(a.updated_at)}` : `Submitted ${fmtDate(a.submitted_at)}`}{a.price ? ` · ${fmtZAR(a.price)}` : ""}</p>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

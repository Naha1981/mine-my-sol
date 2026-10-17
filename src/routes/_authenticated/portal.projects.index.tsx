import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban } from "lucide-react";
import { db } from "@/lib/db";
import { ClosingBadge, EmptyState, Loading, PageHeader, StatusBadge } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/portal/projects/")({ component: Projects });

function Projects() {
  const q = useQuery({
    queryKey: ["portal", "projects"],
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("id,title,summary,status,location,trade,closes_at,reference").order("closes_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <PageHeader title="Projects" description="Opportunities you are invited to, and public ones." />
      {q.isLoading ? <Loading /> : q.isError ? <EmptyState title="Projects could not be loaded" /> : !q.data?.length ? (
        <EmptyState icon={<FolderKanban className="size-8" />} title="No opportunities yet" body="When MySol invites you to a project it will appear here and you will be notified." />
      ) : (
        <ul className="space-y-3">
          {q.data.map((p) => (
            <li key={p.id}><Link to="/portal/projects/$projectId" params={{ projectId: p.id }} className="block rounded-lg border bg-card p-4 hover:border-primary/40">
              <div className="flex flex-wrap items-center gap-2"><p className="font-display font-semibold">{p.title}</p><StatusBadge status={p.status} /><ClosingBadge closesAt={p.closes_at} status={p.status} /></div>
              {p.summary && <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{[p.reference, p.location, p.trade].filter(Boolean).join(" · ")}{p.closes_at ? ` · closes ${fmtDate(p.closes_at)}` : ""}</p>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

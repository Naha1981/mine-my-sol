import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { ClosingBadge, EmptyState, Loading, PageHeader, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { fmtDate, fmtRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Overview });

function Overview() {
  const q = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const count = async (t: string, f: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const { count: c, error } = await f(db.from(t).select("id", { count: "exact", head: true }));
        if (error) throw error;
        return c ?? 0;
      };
      const [open, toReview, contractors, unverified, closing, recent] = await Promise.all([
        count("projects", (x) => x.eq("status", "open")),
        count("applications", (x) => x.in("status", ["submitted", "under_review"])),
        count("organizations", (x) => x.eq("kind", "contractor").eq("status", "active")),
        count("documents", (x) => x.eq("verification", "unverified").gt("current_version", 0)),
        db.from("projects").select("id,title,status,closes_at").eq("status", "open").not("closes_at", "is", null).order("closes_at").limit(5),
        db.from("applications").select("id,status,submitted_at,projects(title),organizations(name)").neq("status", "draft").order("submitted_at", { ascending: false, nullsFirst: false }).limit(6),
      ]);
      return { open, toReview, contractors, unverified, closing: closing.data ?? [], recent: recent.data ?? [] };
    },
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <EmptyState title="Overview could not be loaded" body="Refresh the page to try again." />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Overview" description="What needs your attention today." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open projects" value={d.open} />
        <StatCard label="To review" value={d.toReview} hint="Submitted applications" tone={d.toReview ? "gold" : undefined} />
        <StatCard label="Active contractors" value={d.contractors} />
        <StatCard label="Documents to verify" value={d.unverified} tone={d.unverified ? "gold" : undefined} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">Closing soon</h2>
          {!d.closing.length ? <EmptyState title="No open projects with a deadline" /> : (
            <ul className="divide-y rounded-lg border bg-card">
              {d.closing.map((p: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <li key={p.id}><Link to="/admin/projects/$projectId" params={{ projectId: p.id }} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0"><span className="block truncate font-medium">{p.title}</span><span className="text-xs text-muted-foreground">Closes {fmtDate(p.closes_at)}</span></span>
                  <ClosingBadge closesAt={p.closes_at} status={p.status} />
                </Link></li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Recent submissions</h2>
          {!d.recent.length ? <EmptyState title="No submissions yet" body="Applications appear here once contractors submit." /> : (
            <ul className="divide-y rounded-lg border bg-card">
              {d.recent.map((a: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <li key={a.id}><Link to="/admin/applications/$applicationId" params={{ applicationId: a.id }} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0"><span className="block truncate font-medium">{a.organizations?.name}</span><span className="block truncate text-xs text-muted-foreground">{a.projects?.title} · {fmtRelative(a.submitted_at)}</span></span>
                  <StatusBadge status={a.status} />
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

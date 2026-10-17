import { DOC_CATEGORIES } from "@/lib/constants";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app/AppShell";
import { ClosingBadge, EmptyState, Loading, StatusBadge } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/p/$projectId")({ component: PublicProject });

function PublicProject() {
  const { projectId } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-project", projectId],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("projects").select("id,title,summary,location,trade,status,closes_at,briefing_at").eq("id", projectId).eq("visibility", "public").maybeSingle(),
        supabase.from("project_requirements").select("id,category,label,mandatory").eq("project_id", projectId).eq("active", true).order("sort_order"),
      ]);
      if (p.error) throw p.error;
      return { p: p.data, reqs: r.data ?? [] };
    },
  });
  const share = async () => { await navigator.clipboard?.writeText(window.location.href); toast.success("Link copied"); };
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8"><Link to="/"><Brand /></Link><Button asChild size="sm"><Link to="/auth" search={{ mode: "signin" }}>Sign in</Link></Button></header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-8">
        {q.isLoading ? <Loading /> : !q.data?.p ? (
          <EmptyState title="This opportunity is not public" body="It may be invite-only, or it may have been removed. Sign in if MySol invited you." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{q.data.p.title}</h1><StatusBadge status={q.data.p.status} /><ClosingBadge closesAt={q.data.p.closes_at} status={q.data.p.status} /></div>
            <p className="mt-1 text-sm text-muted-foreground">{[q.data.p.location, q.data.p.trade].filter(Boolean).join(" · ")}{q.data.p.closes_at ? ` · closes ${fmtDate(q.data.p.closes_at)}` : ""}</p>
            {q.data.p.summary && <p className="mt-4">{q.data.p.summary}</p>}
            <h2 className="mt-8 text-lg font-semibold">What you need to submit</h2>
            {q.data.reqs.length ? (
              <ul className="mt-2 space-y-2">{q.data.reqs.map((r) => <li key={r.id} className="rounded-md border bg-card p-3 text-sm"><span className="font-medium">{r.label}</span> <span className="text-muted-foreground">· {(DOC_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category.replace(/_/g, " "))}{r.mandatory ? " · required" : ""}</span></li>)}</ul>
            ) : <p className="mt-2 text-sm text-muted-foreground">The checklist has not been published yet.</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              {q.data.p.status === "open" ? <Button asChild size="lg"><Link to="/auth" search={{ mode: "register" }}>Register your company to apply</Link></Button> : <p className="w-full text-sm font-medium text-muted-foreground">This opportunity is no longer taking submissions.</p>}
              <Button variant="outline" size="lg" onClick={share}><Copy className="size-4" /> Copy share link</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Registering does not give you access to invite-only projects.</p>
          </>
        )}
      </main>
    </div>
  );
}

import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, Loading, PageHeader } from "./ui-bits";

export function NotificationsPage({ alerts }: { alerts?: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({
    queryKey: ["notifications", "list"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const markAll = async () => {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const open = async (id: string, link: string | null) => {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    if (link) router.history.push(link);
  };
  return (
    <>
      <PageHeader title="Notifications" description="Deadlines, expiry alerts and status updates." actions={<Button variant="outline" size="sm" onClick={markAll}><CheckCheck className="size-4" /> Mark all read</Button>} />
      {alerts}
      {q.isLoading ? <Loading /> : q.isError ? (
        <div role="alert" className="rounded-lg border p-4">
          <p>Notifications could not be loaded. Your notifications have not been cleared.</p>
          <Button variant="outline" className="mt-3" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      ) : !q.data?.length ? (
        <EmptyState icon={<Bell className="size-8" />} title="No notifications yet" body="You'll see invitations, submission receipts and outcomes here." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {q.data.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n.id, n.link)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50", !n.read_at && "bg-accent/40")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-gold")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-muted-foreground">{fmtRelative(n.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

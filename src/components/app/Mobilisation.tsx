import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { errMsg } from "@/components/app/ui-bits";
import { fmtDate } from "@/lib/format";

type Item = { id: string; label: string; done: boolean; done_at: string | null };

/** Mobilisation tracker for an awarded application. Admin can start it and tick items; contractors see progress read-only. */
export function Mobilisation({ applicationId, admin }: { applicationId: string; admin: boolean }) {
  const qc = useQueryClient();
  const key = ["mobilisation", applicationId];
  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await db.from("mobilisation_items").select("id,label,done,done_at").eq("application_id", applicationId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const items = q.data ?? [];
  const done = items.filter((i) => i.done).length;
  async function start() {
    const { error } = await db.rpc("start_mobilisation", { _app: applicationId });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Mobilisation started. The contractor has been notified."); qc.invalidateQueries({ queryKey: key });
  }
  async function toggle(i: Item, v: boolean) {
    const { error } = await db.from("mobilisation_items").update({ done: v, done_at: v ? new Date().toISOString() : null }).eq("id", i.id);
    if (error) { toast.error(errMsg(error)); return; }
    qc.invalidateQueries({ queryKey: key });
  }
  if (q.isLoading) return null;
  if (q.isError) return null;
  return (
    <section className="rounded-lg border bg-card p-4" data-testid="mobilisation">
      <h2 className="font-display text-lg font-bold">Mobilisation</h2>
      {!items.length ? (
        admin ? (
          <div className="mt-2 space-y-3"><p className="text-sm text-muted-foreground">Track the contract, insurance, safety and site checks needed before work begins.</p><Button onClick={start}>Start mobilisation</Button></div>
        ) : <p className="mt-2 text-sm text-muted-foreground">MySol will list the contract and site requirements here once mobilisation starts.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{done} of {items.length} complete</p>
          <Progress value={(done / items.length) * 100} className="mt-2 h-2" />
          <ul className="mt-3 divide-y rounded-md border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {admin ? <Checkbox checked={i.done} onCheckedChange={(c) => toggle(i, c === true)} aria-label={i.label} /> : <span className={i.done ? "text-success" : "text-muted-foreground"}>{i.done ? "✓" : "○"}</span>}
                <span className={i.done ? "text-muted-foreground line-through" : ""}>{i.label}</span>
                {i.done_at && <span className="ml-auto text-xs text-muted-foreground">{fmtDate(i.done_at)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

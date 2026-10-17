import type { ReactNode } from "react";
import { categoryLabel } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { Readiness } from "@/lib/readiness";
import { ItemStatusBadge, Pill, VerificationBadge } from "./ui-bits";
import { Progress } from "@/components/ui/progress";

export function ReadinessSummary({ r }: { r: Readiness }) {
  const total = r.items.length || 1;
  const done = r.counts.complete + r.counts.expiring;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display font-semibold">{r.ready ? "Ready to submit against this checklist" : "Not ready yet"}</p>
        <span className="text-sm text-muted-foreground">{done} of {r.items.length} items</span>
      </div>
      <Progress value={(done / total) * 100} className="mt-3 h-2" />
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Pill tone="green">{r.counts.complete} complete</Pill>
        <Pill tone="gold">{r.counts.expiring} expiring soon</Pill>
        <Pill tone="red">{r.counts.expired} expired</Pill>
        <Pill tone="red">{r.counts.missing} missing</Pill>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        "Complete" means the checklist item has a current document attached. It does not mean MySol has verified or accepted it.
      </p>
    </div>
  );
}

export function ReadinessList({ r, renderAction }: { r: Readiness; renderAction?: (reqId: string, category: string) => ReactNode }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {r.items.map((i) => (
        <li key={i.requirement.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">
              {i.requirement.label} {!i.requirement.mandatory && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
            </p>
            <p className="text-xs text-muted-foreground">{categoryLabel(i.requirement.category)}</p>
            {i.document ? (
              <p className="mt-1 text-sm">
                {i.document.title} · v{i.document.current_version} · expires {fmtDate(i.document.expires_at)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-destructive">
                {i.requirement.mandatory ? "Required — upload this document to your vault." : "Optional — add it if you have it."}
              </p>
            )}
            {i.status === "expired" && <p className="text-sm text-destructive">Upload a current version; expired documents can't be submitted.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ItemStatusBadge status={i.status} />
            {i.document && <VerificationBadge v={i.document.verification} />}
            {renderAction?.(i.requirement.id, i.requirement.category)}
          </div>
        </li>
      ))}
    </ul>
  );
}

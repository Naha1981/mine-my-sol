import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { norm } from "@/lib/fleetpulse/api";
import { DEFAULT_SETTINGS, type FpRow, type FpSettings } from "@/lib/fleetpulse/engine";
import {
  EstimatorPanel,
  FaultPanel,
  IdleFuelPanel,
  SampleBanner,
  SummaryPanel,
  type Ctx,
} from "@/components/app/fleetpulse/Panels";

export const Route = createFileRoute("/f/$token")({ component: SharedView });
type View = { label: string; company: string; settings: FpSettings; rows: FpRow[] };
const TABS = [
  ["fuel", "Idle & fuel"],
  ["faults", "Faults"],
  ["summary", "Summary"],
  ["estimate", "Estimate"],
] as const;

function SharedView() {
  const { token } = Route.useParams();
  const [v, setV] = useState<View | null | undefined>(undefined);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("fuel");
  const [talked, setTalked] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = supabase as any;
  useEffect(() => {
    void (async () => {
      const { data, error } = await rpc.rpc("fp_open", {
        p_token: token,
        p_ua: navigator.userAgent,
      });
      if (error || !data) {
        setV(null);
        return;
      }
      setV({
        label: data.label,
        company: data.company,
        settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
        rows: (data.rows ?? []).map(norm),
      });
    })();
  }, [token, rpc]);
  const ev = (type: string, payload: Record<string, unknown> = {}) => {
    void rpc.rpc("fp_event", {
      p_token: token,
      p_type: type,
      p_payload: payload,
      p_ua: navigator.userAgent,
    });
  };
  useEffect(() => {
    if (v) ev("screen_viewed", { tab }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, !!v]);
  const ctx: Ctx | null = useMemo(
    () => (v ? { company: v.company, rows: v.rows, settings: v.settings, onEvent: ev } : null),
    [v],
  );
  if (v === undefined) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (v === null || !ctx)
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm">
        <h1 className="font-display text-lg">This link is not active</h1>
        <p className="mt-2 text-muted-foreground">
          It may have expired or been switched off. Ask the sender for a new one.
        </p>
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3" data-testid="shared-view">
      <div>
        <h1 className="font-display text-xl">FleetPulse</h1>
        <p className="text-xs text-muted-foreground">
          Shared by {v.company} for {v.label}. Read-only.
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${tab === k ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <SampleBanner rows={v.rows} />
      {tab === "fuel" && <IdleFuelPanel ctx={ctx} />}
      {tab === "faults" && <FaultPanel ctx={ctx} />}
      {tab === "summary" && <SummaryPanel ctx={ctx} />}
      {tab === "estimate" && <EstimatorPanel ctx={ctx} />}
      <div className="rounded-xl border bg-card p-3 text-sm">
        <button
          disabled={talked}
          className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60"
          onClick={() => {
            ev("talk_requested");
            setTalked(true);
          }}
        >
          {talked ? "Request sent" : "Talk to " + v.company}
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          Sends a note to {v.company} that you would like to talk.
        </p>
      </div>
    </div>
  );
}

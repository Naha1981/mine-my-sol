import { useMemo, useState } from "react";
import {
  analyse,
  estimate,
  machineStats,
  rand,
  totalImpact,
  type FpRow,
  type FpSettings,
  type Insight,
} from "@/lib/fleetpulse/engine";
import { dailySummary } from "@/lib/fleetpulse/summary";
import { ShareLinkProvider } from "@/lib/fleetpulse/messaging";

export type Ctx = {
  company: string;
  rows: FpRow[];
  settings: FpSettings;
  onEvent?: (type: string, payload?: Record<string, unknown>) => void;
};
const box = "rounded-xl border bg-card p-3 text-sm";
const label = {
  IDLE_EXCESS: "Idle",
  FUEL_RATE_OUTLIER: "Fuel rate",
  FAULT_REPEAT: "Fault",
} as const;

export function SampleBanner({ rows }: { rows: FpRow[] }) {
  if (!rows.some((r) => r.is_sample)) return null;
  return (
    <p
      className="rounded-lg border border-gold/40 bg-gold/20 px-3 py-2 text-xs"
      data-testid="sample-banner"
    >
      Sample data is loaded and mixed into these numbers. Remove it on the Data tab to see only your
      own fleet.
    </p>
  );
}

function InsightCard({ i }: { i: Insight }) {
  return (
    <li className="rounded-lg border p-2" data-testid="insight">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-800">
          {label[i.type]}
        </span>
        <span className="font-semibold">{i.headline}</span>
        {i.severity === "high" && (
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
            High
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {Object.entries(i.evidence)
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          .join(" · ")}
      </p>
      {i.randImpact != null && (
        <p className="mt-1">
          About <b>{rand(i.randImpact)}</b> a week in fuel (estimate)
        </p>
      )}
    </li>
  );
}

export function IdleFuelPanel({ ctx }: { ctx: Ctx }) {
  const stats = useMemo(() => machineStats(ctx.rows), [ctx.rows]);
  const ins = useMemo(
    () => analyse(ctx.rows, ctx.settings).filter((i) => i.type !== "FAULT_REPEAT"),
    [ctx.rows, ctx.settings],
  );
  const eng = stats.reduce((a, b) => a + b.engine, 0),
    idle = stats.reduce((a, b) => a + b.idle, 0),
    lit = stats.reduce((a, b) => a + b.litres, 0);
  if (!stats.length)
    return <div className={box}>No fleet data yet. Load your data on the Data tab.</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className={box}>
          <div className="text-xs text-muted-foreground">Machines</div>
          <div className="font-display text-lg">{stats.length}</div>
        </div>
        <div className={box}>
          <div className="text-xs text-muted-foreground">Idle share, 7 days</div>
          <div className="font-display text-lg">{eng ? Math.round((idle / eng) * 100) : 0}%</div>
        </div>
        <div className={box}>
          <div className="text-xs text-muted-foreground">Litres, 7 days</div>
          <div className="font-display text-lg">{Math.round(lit).toLocaleString("en-ZA")}</div>
        </div>
      </div>
      <div className={box}>
        <h2 className="mb-2 font-display">Signals</h2>
        {ins.length ? (
          <ul className="space-y-2">
            {ins.map((i) => (
              <InsightCard key={i.type + i.machine} i={i} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No idle or fuel signals this week.</p>
        )}
      </div>
      <div className={box}>
        <h2 className="mb-2 font-display">Machines by idle share</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1">Machine</th>
                <th>Site</th>
                <th className="text-right">Idle</th>
                <th className="text-right">L/h</th>
              </tr>
            </thead>
            <tbody>
              {[...stats]
                .sort((a, b) => b.idleShare - a.idleShare)
                .slice(0, 12)
                .map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-1 font-medium">{m.id}</td>
                    <td>{m.site}</td>
                    <td className="text-right">{Math.round(m.idleShare * 100)}%</td>
                    <td className="text-right">{m.lph.toFixed(1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function FaultPanel({ ctx }: { ctx: Ctx }) {
  const ins = useMemo(
    () => analyse(ctx.rows, ctx.settings).filter((i) => i.type === "FAULT_REPEAT"),
    [ctx.rows, ctx.settings],
  );
  return (
    <div className={box}>
      <h2 className="mb-2 font-display">Fault watchlist</h2>
      {ins.length ? (
        <ul className="space-y-2">
          {ins.map((i) => (
            <InsightCard key={i.machine + i.headline} i={i} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No repeating or stop faults in the last 7 days.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        A risk ranking from your fault log. It does not predict failures.
      </p>
    </div>
  );
}

export function SummaryPanel({ ctx }: { ctx: Ctx }) {
  const text = useMemo(() => dailySummary(ctx.company, ctx.rows, ctx.settings), [ctx]);
  const [phone, setPhone] = useState("");
  const link =
    phone.replace(/\D/g, "").length >= 9
      ? new ShareLinkProvider().link({ to: phone, body: text })
      : "";
  return (
    <div className={box}>
      <h2 className="mb-2 font-display">Daily summary</h2>
      <pre
        className="whitespace-pre-wrap rounded-lg border bg-background p-2 text-xs"
        data-testid="summary-text"
      >
        {text}
      </pre>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="rounded-lg border px-3 py-2"
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            ctx.onEvent?.("summary_shared", { how: "copy" });
          }}
        >
          Copy text
        </button>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="Send to (e.g. 27821234567)"
          className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2"
          aria-label="WhatsApp number"
        />
        {link ? (
          <a
            className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
            href={link}
            target="_blank"
            rel="noreferrer"
            onClick={() => ctx.onEvent?.("summary_shared", { how: "whatsapp" })}
          >
            Open in WhatsApp
          </a>
        ) : (
          <span className="px-1 py-2 text-xs text-muted-foreground">
            Enter a number to share. You tap send yourself.
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Automatic daily sending needs an approved business WhatsApp number. Until one is connected,
        summaries are shared by you from here.
      </p>
    </div>
  );
}

const field = "w-full rounded-md border bg-background px-2 py-1";
export function EstimatorPanel({ ctx }: { ctx: Ctx }) {
  const [v, setV] = useState({
    trucks: 10,
    idleHoursPerDay: 2,
    burnLph: ctx.settings.idle_burn_lph,
    dieselPrice: ctx.settings.diesel_price ?? 0,
    days: 26,
    reductionPct: 20,
  });
  const e = estimate(v);
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setV((o) => ({ ...o, [k]: Number(ev.target.value) }));
  const rows: [keyof typeof v, string, number?][] = [
    ["trucks", "Trucks"],
    ["idleHoursPerDay", "Idle hours per truck per day", 0.1],
    ["burnLph", "Idle burn (litres per hour)", 0.5],
    ["dieselPrice", "Diesel (R per litre)", 0.1],
    ["days", "Operating days per month"],
    ["reductionPct", "Expected reduction (%)"],
  ];
  return (
    <div className={box} data-testid="estimator">
      <h2 className="mb-2 font-display">Idle fuel estimate</h2>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([k, l, step]) => (
          <label key={k} className="text-xs text-muted-foreground">
            {l}
            <input
              type="number"
              min={0}
              step={step ?? 1}
              value={v[k]}
              onChange={set(k)}
              onBlur={() => ctx.onEvent?.("estimate_run", v)}
              className={field}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(["low", "base", "high"] as const).map((k) => (
          <div key={k} className="rounded-lg border p-2">
            <div className="text-xs uppercase text-muted-foreground">{k}</div>
            <div className="font-display text-lg" data-testid={`est-${k}`}>
              {rand(e[k])}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Rand per month = trucks × idle hours × burn × diesel × days × reduction. Low and high use
        half and one and a half times the reduction. Diesel default:{" "}
        {ctx.settings.diesel_price != null
          ? `R${ctx.settings.diesel_price}/L${ctx.settings.diesel_verified ? ", published price" : ", not verified"}`
          : "not set"}
        . Estimate. Replaced by your real data on day one.
      </p>
      <button
        onClick={() => window.print()}
        className="mt-2 rounded-lg border px-3 py-2 print:hidden"
      >
        Print / save as PDF
      </button>
    </div>
  );
}
void totalImpact;

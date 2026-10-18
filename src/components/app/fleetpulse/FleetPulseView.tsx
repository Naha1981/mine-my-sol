import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { clearRows, insertRows, loadMine, saveSettings } from "@/lib/fleetpulse/api";
import { DEFAULT_DIESEL, latestDay, type FpSettings } from "@/lib/fleetpulse/engine";
import { parseCsv, TEMPLATE } from "@/lib/fleetpulse/csv";
import { sampleRows } from "@/lib/fleetpulse/sample";
import {
  EstimatorPanel,
  FaultPanel,
  IdleFuelPanel,
  SampleBanner,
  SummaryPanel,
  type Ctx,
} from "./Panels";

const TABS = [
  ["fuel", "Idle & fuel"],
  ["faults", "Faults"],
  ["summary", "Summary"],
  ["estimate", "Estimate"],
  ["data", "Data"],
  ["settings", "Settings"],
  ["links", "Links"],
] as const;
type Tab = (typeof TABS)[number][0];
type Tk = {
  id: string;
  token: string;
  label: string;
  notes: string | null;
  expires_at: string;
  revoked_at: string | null;
};
type Ev = { token_id: string; type: string; is_bot: boolean; created_at: string };
const box = "rounded-xl border bg-card p-3 text-sm";
const btn = "rounded-lg border px-3 py-2";

export function FleetPulseView() {
  const [tab, setTab] = useState<Tab>("fuel");
  const q = useQuery({ queryKey: ["fleetpulse"], queryFn: loadMine });
  if (q.isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading fleet data…</p>;
  if (q.error || !q.data)
    return (
      <p className="p-4 text-sm text-destructive" role="alert">
        Could not load FleetPulse: {(q.error as Error)?.message ?? "unknown error"}. If this is new,
        the FleetPulse database setup may not be applied yet.
      </p>
    );
  const d = q.data;
  const ctx: Ctx = { company: d.company, rows: d.rows, settings: d.settings };
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3" data-testid="fleetpulse">
      <div>
        <h1 className="font-display text-xl">FleetPulse</h1>
        <p className="text-xs text-muted-foreground">
          {d.company}. Idle burn, fuel outliers and repeat faults from your own fleet data.
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
      <SampleBanner rows={d.rows} />
      {tab === "fuel" && <IdleFuelPanel ctx={ctx} />}
      {tab === "faults" && <FaultPanel ctx={ctx} />}
      {tab === "summary" && <SummaryPanel ctx={ctx} />}
      {tab === "estimate" && <EstimatorPanel ctx={ctx} />}
      {tab === "data" && (
        <DataTab
          orgId={d.orgId}
          rows={d.rows.length}
          sample={d.rows.filter((r) => r.is_sample).length}
          end={latestDay(d.rows)}
        />
      )}
      {tab === "settings" && <SettingsTab orgId={d.orgId} s={d.settings} />}
      {tab === "links" && <LinksTab orgId={d.orgId} />}
    </div>
  );
}

function DataTab({
  orgId,
  rows,
  sample,
  end,
}: {
  orgId: string;
  rows: number;
  sample: number;
  end: string | null;
}) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const run = async (f: () => Promise<string>) => {
    setBusy(true);
    setMsg("");
    try {
      setMsg(await f());
      await qc.invalidateQueries({ queryKey: ["fleetpulse"] });
    } catch (e) {
      setMsg("Failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onFile = (f: File | undefined) =>
    f &&
    run(async () => {
      const p = parseCsv(await f.text());
      if ("error" in p) return p.error;
      if (!p.rows.length) return "No valid rows found. " + p.skipped.join(" ");
      await clearRows(orgId, "mine");
      await insertRows(orgId, p.rows, false);
      return (
        `Loaded ${p.rows.length} rows from ${f.name}. Your previous uploaded data was replaced.` +
        (p.skipped.length ? ` ${p.total - p.rows.length} rows skipped. ${p.skipped.join(" ")}` : "")
      );
    });
  return (
    <div className="space-y-3">
      <div className={box}>
        <h2 className="font-display">Your fleet data</h2>
        <p className="text-muted-foreground">
          {rows
            ? `${rows} daily rows loaded (${sample} sample). Latest day: ${end}.`
            : "Nothing loaded yet."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          One row per machine per day: machine_id, site, machine_type, date, engine_hours,
          idle_hours, litres, fault_code, fault_severity (info, warn or stop). Up to 20 000 rows. A
          new upload replaces your previous upload.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
            onClick={() => file.current?.click()}
          >
            Upload CSV
          </button>
          <a
            className={btn}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="fleetpulse-template.csv"
          >
            Download template
          </a>
        </div>
      </div>
      <div className={box}>
        <h2 className="font-display">Sample data</h2>
        <p className="text-muted-foreground">
          Optional. Loads a labelled sample fleet so you can look around. It is only ever visible to
          your company and you can remove it at any time.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            disabled={busy || sample > 0}
            className={btn}
            onClick={() =>
              run(async () => {
                await insertRows(orgId, sampleRows(new Date().toISOString().slice(0, 10)), true);
                return "Sample data loaded.";
              })
            }
          >
            Load sample data
          </button>
          <button
            disabled={busy || sample === 0}
            className={btn}
            onClick={() =>
              run(async () => {
                await clearRows(orgId, "sample");
                return "Sample data removed.";
              })
            }
          >
            Remove sample data
          </button>
        </div>
      </div>
      <div className={box}>
        <h2 className="font-display">Delete all my fleet data</h2>
        <button
          disabled={busy || rows === 0}
          className={`${btn} text-destructive`}
          onClick={() => {
            if (confirm("Delete all fleet data for your company? This cannot be undone."))
              void run(async () => {
                await clearRows(orgId, "all");
                return "All fleet data deleted.";
              });
          }}
        >
          Delete everything
        </button>
      </div>
      {msg && (
        <p className="text-sm" role="status" data-testid="data-msg">
          {msg}
        </p>
      )}
    </div>
  );
}

function SettingsTab({ orgId, s }: { orgId: string; s: FpSettings }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ ...s });
  const [msg, setMsg] = useState("");
  const set = (k: keyof FpSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((o) => ({ ...o, [k]: e.target.value === "" ? null : Number(e.target.value) }));
  const fields: [keyof FpSettings, string, number][] = [
    ["diesel_price", "Diesel, R per litre", 0.01],
    ["idle_limit", "Idle share limit (0.35 = 35%)", 0.01],
    ["baseline_idle_share", "Normal idle share (0.15 = 15%)", 0.01],
    ["idle_burn_lph", "Idle burn, litres per hour", 0.5],
    ["fuel_sd", "Fuel outlier: deviations above peers", 0.5],
    ["fault_repeat", "Same fault, times in 7 days", 1],
  ];
  return (
    <div className={box}>
      <h2 className="mb-2 font-display">Thresholds and assumptions</h2>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([k, l, st]) => (
          <label key={k} className="text-xs text-muted-foreground">
            {l}
            <input
              type="number"
              step={st}
              value={(v[k] as number | null) ?? ""}
              onChange={set(k)}
              className="w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Diesel default R{DEFAULT_DIESEL.price}/L: {DEFAULT_DIESEL.source}. Change it to your own
        contract price and it is saved as your price.
      </p>
      <button
        className="mt-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground"
        onClick={async () => {
          try {
            const own = v.diesel_price !== DEFAULT_DIESEL.price;
            await saveSettings(orgId, {
              ...v,
              diesel_source: own ? "Entered by your company" : DEFAULT_DIESEL.source,
              diesel_verified: !own,
            });
            await qc.invalidateQueries({ queryKey: ["fleetpulse"] });
            setMsg("Saved.");
          } catch (e) {
            setMsg("Failed: " + (e as Error).message);
          }
        }}
      >
        Save
      </button>
      {msg && (
        <span className="ml-2 text-sm" role="status">
          {msg}
        </span>
      )}
    </div>
  );
}

function LinksTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const t = useQuery({
    queryKey: ["fp-tokens"],
    queryFn: async () =>
      (
        await db
          .from("fp_tokens")
          .select("id,token,label,notes,expires_at,revoked_at,created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
      ).data as Tk[],
  });
  const ev = useQuery({
    queryKey: ["fp-events"],
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () =>
      (
        await db
          .from("fp_events")
          .select("token_id,type,is_bot,created_at,payload")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(500)
      ).data as Ev[],
  });
  const tokens = t.data ?? [];
  const events = ev.data ?? [];
  const human = events.filter((e) => !e.is_bot);
  const score = {
    sent: tokens.length,
    opened: new Set(human.filter((e) => e.type === "link_opened").map((e) => e.token_id)).size,
    estimates: human.filter((e) => e.type === "estimate_run").length,
    talk: human.filter((e) => e.type === "talk_requested").length,
  };
  const url = (tk: string) => `${location.origin}/f/${tk}`;
  return (
    <div className="space-y-3">
      <div className={box}>
        <h2 className="font-display">Share a read-only view</h2>
        <p className="text-xs text-muted-foreground">
          Each link opens your current insights, summary and estimator with no sign-in. Use one link
          per person so you can see who looked. Links expire after 30 days and you can revoke them.
        </p>
        <div className="mt-2 grid gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Who is it for (name or company)"
            maxLength={80}
            className="rounded-md border bg-background px-2 py-2"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            maxLength={500}
            className="rounded-md border bg-background px-2 py-2"
          />
          <button
            className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
            onClick={async () => {
              setErr("");
              if (!label.trim()) {
                setErr("Enter who the link is for.");
                return;
              }
              const { error } = await db
                .from("fp_tokens")
                .insert({ org_id: orgId, label: label.trim(), notes: notes.trim() || null });
              if (error) setErr(error.message);
              else {
                setLabel("");
                setNotes("");
                await qc.invalidateQueries({ queryKey: ["fp-tokens"] });
              }
            }}
          >
            Create link
          </button>
          {err && (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          )}
        </div>
      </div>
      <div className={box} data-testid="scorecard">
        <h2 className="mb-2 font-display">Signals</h2>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div className="font-display text-lg">{score.sent}</div>links
          </div>
          <div>
            <div className="font-display text-lg">{score.opened}</div>opened
          </div>
          <div>
            <div className="font-display text-lg">{score.estimates}</div>estimates
          </div>
          <div>
            <div className="font-display text-lg">{score.talk}</div>talk requests
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Link previews and crawlers are not counted as opens.
        </p>
      </div>
      <div className="space-y-2">
        {tokens.map((k) => {
          const es = events.filter((e) => e.token_id === k.id && !e.is_bot);
          const dead = !!k.revoked_at || new Date(k.expires_at) < new Date();
          return (
            <div key={k.id} className={box}>
              <div className="flex items-center justify-between gap-2">
                <b>{k.label}</b>
                <span className="text-xs text-muted-foreground">
                  {k.revoked_at
                    ? "Revoked"
                    : dead
                      ? "Expired"
                      : `Expires ${String(k.expires_at).slice(0, 10)}`}
                </span>
              </div>
              {k.notes && <p className="text-xs text-muted-foreground">{k.notes}</p>}
              {!dead && (
                <code className="mt-1 block break-all rounded border bg-background p-1 text-xs">
                  {url(k.token)}
                </code>
              )}
              <ul className="mt-1 text-xs text-muted-foreground">
                {es.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    {String(e.created_at).replace("T", " ").slice(0, 16)}{" "}
                    {String(e.type).replace(/_/g, " ")}
                  </li>
                ))}
                {!es.length && <li>No views yet.</li>}
              </ul>
              <div className="mt-1 flex gap-2">
                {!dead && (
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => void navigator.clipboard?.writeText(url(k.token))}
                  >
                    Copy link
                  </button>
                )}
                {!k.revoked_at && (
                  <button
                    className="rounded border px-2 py-1 text-xs text-destructive"
                    onClick={async () => {
                      await db
                        .from("fp_tokens")
                        .update({ revoked_at: new Date().toISOString() })
                        .eq("id", k.id);
                      await qc.invalidateQueries({ queryKey: ["fp-tokens"] });
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

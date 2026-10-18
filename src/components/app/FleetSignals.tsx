import { useMemo, useState } from "react";
import { DEFAULTS, FLEET, type FleetMachine } from "@/lib/eye/fleet";
import { money, runRules, totalLeak, type Signal } from "@/lib/eye/rules";

const label = { idle: "Idle share", fuel: "Fuel rate", fault: "Repeat fault" } as const;
const SITES: Record<string, string> = { s4: "Site 4", s2: "Site 2", s7: "Site 7" };

export function fleetLines(siteId: string, diesel: number): string[] {
  const sigs = runRules(FLEET, { ...DEFAULTS, dieselRPerL: diesel }).filter((s) => s.site === siteId);
  if (!sigs.length) return ["Fleet signals: none raised for this site (sample fleet, 7 days)."];
  return [`Fleet signals (sample fleet, 7 days, diesel R${diesel}/L): ${sigs.length} raised, estimated leak ${money(totalLeak(sigs))} a week`, ...sigs.map((s) => `${label[s.rule]}: ${s.headline}, about ${money(s.leakR)}`)];
}

export function FleetSignals({ siteId, locked = false, fleet = FLEET, imported = false }: { siteId: string; locked?: boolean; fleet?: FleetMachine[]; imported?: boolean }) {
  const [diesel, setDiesel] = useState(DEFAULTS.dieselRPerL);
  const [all, setAll] = useState(imported);
  const sigs = useMemo(() => runRules(fleet, { ...DEFAULTS, dieselRPerL: diesel }), [diesel, fleet]);
  const shown = all ? sigs : sigs.filter((s) => s.site === siteId);
  const siteTotal = totalLeak(sigs.filter((s) => s.site === siteId));
  return (
    <div className="rounded-xl border bg-card p-3 text-sm" data-testid="fleet-signals">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display">Fleet signals <span className="text-xs font-normal text-muted-foreground">{imported ? `${fleet.length} machines, your file` : "24 machines, 7 days, sample"}</span></h2>
        {!locked && !imported && <button onClick={() => setAll((v) => !v)} className="rounded-full border px-2 py-0.5 text-xs">{all ? "Show this site" : "Show all sites"}</button>}
      </div>
      <p className="mb-2 text-muted-foreground"><b>Purpose:</b> find money leaking from idle machines, heavy fuel use and repeat faults. <b>Look at:</b> the rand figure on each signal. <b>Then:</b> Add to evidence puts this site's signals in the pack.</p>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">{all ? "Whole fleet" : SITES[siteId]} leak a week</div><div className="font-display text-lg" data-testid="leak-total">{money(totalLeak(shown))}</div></div>
        <label className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Diesel R per litre</div><input type="number" min={10} max={50} step={0.5} value={diesel} onChange={(e) => setDiesel(Math.min(50, Math.max(10, Number(e.target.value) || DEFAULTS.dieselRPerL)))} className="w-full bg-transparent font-display text-lg" /></label>
      </div>
      {shown.length === 0 && <p className="text-muted-foreground">No signals raised.</p>}
      <ul className="space-y-2">
        {shown.map((s: Signal) => (
          <li key={s.rule + s.machine} className="rounded-lg border p-2">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-800">{label[s.rule]}</span><span className="font-semibold">{s.headline}</span></div>
            <div className="mt-1 flex flex-wrap items-center gap-2"><span className="font-display">about {money(s.leakR)} a week</span><span className={`rounded px-1.5 py-0.5 text-xs ${s.conf === "confirmed" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{s.conf}</span>{all && <span className="text-xs text-muted-foreground">{SITES[s.site] ?? s.site}</span>}</div>
            <p className="mt-1 text-muted-foreground">{s.detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Limits: {imported ? "your file, read in this browser only." : "synthetic data."} Rand figures are estimates from the stated assumptions (diesel price above, idle burn 5 to 12 L/h by machine type, hauler margin R1,800/h, 1.5 h lost per fault). Not a finding of fact.</p>
    </div>
  );
}

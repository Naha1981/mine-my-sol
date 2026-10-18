// FleetPulse rules engine. Pure functions, no I/O. Thresholds come from settings, never hard-coded.
export type FpRow = {
  machine_id: string;
  site: string;
  machine_type: string;
  day: string;
  engine_h: number;
  idle_h: number;
  litres: number;
  fault_code?: string | null;
  fault_severity?: "info" | "warn" | "stop" | null;
  is_sample?: boolean;
};
export type FpSettings = {
  diesel_price: number | null;
  diesel_source?: string | null;
  diesel_verified?: boolean;
  idle_limit: number;
  fuel_sd: number;
  fault_repeat: number;
  baseline_idle_share: number;
  idle_burn_lph: number;
};
export type Insight = {
  type: "IDLE_EXCESS" | "FUEL_RATE_OUTLIER" | "FAULT_REPEAT";
  machine: string;
  site: string;
  severity: "high" | "medium";
  headline: string;
  evidence: Record<string, string | number>;
  randImpact: number | null;
};

/** Published inland wholesale diesel (0.05% sulphur), official price from 7 October 2026. Companies replace it with their own price. */
export const DEFAULT_DIESEL = {
  price: 31.95,
  source:
    "Official inland diesel 0.05% price from 7 Oct 2026 (Dept of Mineral and Petroleum Resources, via BusinessTech)",
  verified: true,
};
export const DEFAULT_SETTINGS: FpSettings = {
  diesel_price: DEFAULT_DIESEL.price,
  diesel_source: DEFAULT_DIESEL.source,
  diesel_verified: true,
  idle_limit: 0.35,
  fuel_sd: 2,
  fault_repeat: 3,
  baseline_idle_share: 0.15,
  idle_burn_lph: 8,
};

const num = (n: unknown) => Number(n) || 0;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export const rand = (n: number) =>
  `R${Math.round(n)
    .toLocaleString("en-ZA")
    .replace(/\u00a0/g, " ")}`;

export function latestDay(rows: FpRow[]): string | null {
  return rows.reduce<string | null>((m, r) => (m === null || r.day > m ? r.day : m), null);
}
function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Rows in the 7 days ending on the newest day in the data (so imported history of any date works). */
export function lastWeek(rows: FpRow[], days = 7): FpRow[] {
  const end = latestDay(rows);
  if (!end) return [];
  const from = addDays(end, -(days - 1));
  return rows.filter((r) => r.day >= from && r.day <= end);
}

export function analyse(allRows: FpRow[], s: FpSettings): Insight[] {
  const rows = lastWeek(allRows);
  const out: Insight[] = [];
  const price = s.diesel_price;
  const by = new Map<string, FpRow[]>();
  for (const r of rows) {
    const k = r.machine_id;
    (by.get(k) ?? by.set(k, []).get(k)!).push(r);
  }
  const first = (rs: FpRow[]) => rs[0]!;
  // IDLE_EXCESS
  for (const [id, rs] of by) {
    const eng = sum(rs.map((r) => num(r.engine_h)));
    const idle = sum(rs.map((r) => num(r.idle_h)));
    if (eng <= 0) continue;
    const share = idle / eng;
    if (share > s.idle_limit) {
      const excess = Math.max(0, idle - eng * s.baseline_idle_share);
      out.push({
        type: "IDLE_EXCESS",
        machine: id,
        site: first(rs).site,
        severity: share > s.idle_limit + 0.15 ? "high" : "medium",
        headline: `${id} idled ${Math.round(share * 100)}% of engine hours`,
        evidence: {
          idle_hours: +idle.toFixed(1),
          engine_hours: +eng.toFixed(1),
          idle_share_pct: Math.round(share * 100),
          excess_idle_hours: +excess.toFixed(1),
        },
        randImpact: price == null ? null : excess * s.idle_burn_lph * price,
      });
    }
  }
  // FUEL_RATE_OUTLIER: litres per engine hour against same-type peers, robust (median and MAD).
  const types = new Set([...by.values()].map((rs) => first(rs).machine_type));
  for (const type of types) {
    const group = [...by.entries()]
      .filter(([, rs]) => first(rs).machine_type === type)
      .map(([id, rs]) => ({
        id,
        rs,
        eng: sum(rs.map((r) => num(r.engine_h))),
        lit: sum(rs.map((r) => num(r.litres))),
      }))
      .filter((g) => g.eng > 0);
    if (group.length < 4) continue;
    const rates = group.map((g) => g.lit / g.eng);
    const med = median(rates);
    const sd = Math.max(1.4826 * median(rates.map((r) => Math.abs(r - med))), 0.05 * med);
    for (const g of group) {
      const rate = g.lit / g.eng;
      const z = (rate - med) / sd;
      if (z > s.fuel_sd)
        out.push({
          type: "FUEL_RATE_OUTLIER",
          machine: g.id,
          site: first(g.rs).site,
          severity: z > s.fuel_sd + 2 ? "high" : "medium",
          headline: `${g.id} burns ${rate.toFixed(1)} L per engine hour, peers ${med.toFixed(1)}`,
          evidence: {
            litres_per_engine_hour: +rate.toFixed(2),
            peer_median: +med.toFixed(2),
            peers: group.length - 1,
            deviations_above_peers: +z.toFixed(1),
          },
          randImpact: price == null ? null : (rate - med) * g.eng * price,
        });
    }
  }
  // FAULT_REPEAT
  for (const [id, rs] of by) {
    const counts = new Map<string, number>();
    let stop: FpRow | null = null;
    for (const r of rs)
      if (r.fault_code) {
        counts.set(r.fault_code, (counts.get(r.fault_code) ?? 0) + 1);
        if (r.fault_severity === "stop") stop = r;
      }
    const done = new Set<string>();
    for (const [code, n] of counts)
      if (n >= s.fault_repeat) {
        done.add(code);
        out.push({
          type: "FAULT_REPEAT",
          machine: id,
          site: first(rs).site,
          severity: n >= s.fault_repeat + 2 ? "high" : "medium",
          headline: `${id}: ${code} ${n} times in 7 days`,
          evidence: { fault_code: code, occurrences: n },
          randImpact: null,
        });
      }
    if (stop && !done.has(stop.fault_code!))
      out.push({
        type: "FAULT_REPEAT",
        machine: id,
        site: stop.site,
        severity: "high",
        headline: `${id}: stop-severity fault ${stop.fault_code}`,
        evidence: { fault_code: stop.fault_code!, severity: "stop", last_seen: stop.day },
        randImpact: null,
      });
  }
  return out.sort(
    (a, b) =>
      (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0) ||
      (b.randImpact ?? 0) - (a.randImpact ?? 0),
  );
}
export const totalImpact = (i: Insight[]) => i.reduce((x, y) => x + (y.randImpact ?? 0), 0);

/** Ranked machine tables for the dashboard. */
export function machineStats(allRows: FpRow[]) {
  const rows = lastWeek(allRows);
  const by = new Map<string, FpRow[]>();
  for (const r of rows)
    (by.get(r.machine_id) ?? by.set(r.machine_id, []).get(r.machine_id)!).push(r);
  return [...by.entries()].map(([id, rs]) => {
    const eng = sum(rs.map((r) => num(r.engine_h)));
    const idle = sum(rs.map((r) => num(r.idle_h)));
    const lit = sum(rs.map((r) => num(r.litres)));
    return {
      id,
      site: rs[0]!.site,
      type: rs[0]!.machine_type,
      engine: eng,
      idle,
      litres: lit,
      idleShare: eng > 0 ? idle / eng : 0,
      lph: eng > 0 ? lit / eng : 0,
    };
  });
}

export type Estimate = {
  trucks: number;
  idleHoursPerDay: number;
  burnLph: number;
  dieselPrice: number;
  days: number;
  reductionPct: number;
};
export function estimate(e: Estimate) {
  const at = (pct: number) =>
    (Math.max(0, e.trucks) *
      Math.max(0, e.idleHoursPerDay) *
      Math.max(0, e.burnLph) *
      Math.max(0, e.dieselPrice) *
      Math.max(0, e.days) *
      Math.min(100, Math.max(0, pct))) /
    100;
  return {
    low: at(e.reductionPct * 0.5),
    base: at(e.reductionPct),
    high: at(e.reductionPct * 1.5),
  };
}

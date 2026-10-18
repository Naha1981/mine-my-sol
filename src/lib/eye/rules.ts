import { DEFAULTS, FLEET, type Assumptions, type FleetMachine } from "./fleet";

export type Signal = { rule: "idle" | "fuel" | "fault"; machine: string; site: string; type: string; headline: string; detail: string; leakR: number; conf: "confirmed" | "inferred"; };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA").replace(/\u00a0/g, " ")}`;

export const IDLE_LIMIT = 0.25;      // idle share of engine hours that raises a signal
export const FUEL_LIMIT = 1.25;      // litres per tonne vs median of the same machine type
export const FAULT_LIMIT = 3;        // same fault code this many times in 7 days

export function runRules(fleet: FleetMachine[] = FLEET, a: Assumptions = DEFAULTS): Signal[] {
  const out: Signal[] = [];
  // 1. Idle share
  for (const m of fleet) {
    const eng = sum(m.days.map((d) => d.engineH)); const idle = sum(m.days.map((d) => d.idleH)); const share = idle / eng;
    if (share > IDLE_LIMIT) {
      const excess = Math.max(0, idle - eng * a.baselineIdleShare);
      const leak = excess * (a.idleBurnLPerH[m.type] ?? 8) * a.dieselRPerL;
      out.push({ rule: "idle", machine: m.id, site: m.site, type: m.type, headline: `${m.id} idled ${Math.round(share * 100)}% of engine hours`, detail: `${idle.toFixed(1)} of ${eng.toFixed(1)} engine hours in 7 days. Limit ${IDLE_LIMIT * 100}%. Fuel cost above a ${a.baselineIdleShare * 100}% baseline.`, leakR: leak, conf: "confirmed" });
    }
  }
  // 2. Fuel-rate outlier vs same type
  const rate = (m: FleetMachine) => { const t = sum(m.days.map((d) => d.tonnes)); return t > 0 ? sum(m.days.map((d) => d.litres)) / t : 0; };
  for (const type of [...new Set(fleet.map((m) => m.type))]) {
    const group = fleet.filter((m) => m.type === type && rate(m) > 0); if (group.length < 3) continue;
    const med = median(group.map(rate));
    for (const m of group) {
      const r = rate(m);
      if (r > med * FUEL_LIMIT) {
        const t = sum(m.days.map((d) => d.tonnes));
        out.push({ rule: "fuel", machine: m.id, site: m.site, type: m.type, headline: `${m.id} burns ${(r / med).toFixed(2)}x the fuel per tonne`, detail: `${r.toFixed(2)} L/t against a ${med.toFixed(2)} L/t median for ${type}s. Limit ${FUEL_LIMIT}x. Extra litres over 7 days priced at diesel.`, leakR: (r - med) * t * a.dieselRPerL, conf: "inferred" });
      }
    }
  }
  // 3. Repeat fault
  for (const m of fleet) {
    const counts = new Map<string, number>(); m.days.forEach((d) => d.faults.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1)));
    for (const [code, n] of counts) if (n >= FAULT_LIMIT) {
      out.push({ rule: "fault", machine: m.id, site: m.site, type: m.type, headline: `${m.id}: ${code}, ${n} times in 7 days`, detail: `Same fault repeating. Estimated ${a.hoursPerFault} h lost each time at ${rand(a.marginRPerH[m.type] ?? 1000)}/h margin.`, leakR: n * a.hoursPerFault * (a.marginRPerH[m.type] ?? 1000), conf: "inferred" });
    }
  }
  return out.sort((x, y) => y.leakR - x.leakR);
}
export const totalLeak = (s: Signal[]) => s.reduce((x, y) => x + y.leakR, 0);
export const money = rand;

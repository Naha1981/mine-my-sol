// SAMPLE DATA ONLY. Synthetic 24-machine fleet, 7 days. Replace with imported machine / fuel / fault CSVs.
export type Day = { engineH: number; idleH: number; litres: number; tonnes: number; faults: string[] };
export type FleetMachine = { id: string; site: string; type: string; days: Day[] };
export type Assumptions = { dieselRPerL: number; idleBurnLPerH: Record<string, number>; baselineIdleShare: number; marginRPerH: Record<string, number>; hoursPerFault: number };
export const DEFAULTS: Assumptions = {
  dieselRPerL: 22,
  idleBurnLPerH: { "A40 hauler": 8, Excavator: 12, Dozer: 9, "Water cart": 5 },
  baselineIdleShare: 0.15,
  marginRPerH: { "A40 hauler": 1800, Excavator: 3000, Dozer: 1500, "Water cart": 400 },
  hoursPerFault: 1.5,
};

let seed = 20261018;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const spec: [string, string, string][] = [
  ["A40-09","s4","A40 hauler"],["A40-12","s4","A40 hauler"],["A40-17","s4","A40 hauler"],["A40-18","s4","A40 hauler"],["A40-19","s4","A40 hauler"],
  ["EX-03","s4","Excavator"],["EX-04","s4","Excavator"],["DZ-02","s4","Dozer"],["DZ-03","s4","Dozer"],["WC-01","s4","Water cart"],
  ["A40-21","s2","A40 hauler"],["A40-22","s2","A40 hauler"],["A40-23","s2","A40 hauler"],["A40-24","s2","A40 hauler"],["EX-05","s2","Excavator"],["EX-06","s2","Excavator"],["DZ-05","s2","Dozer"],["WC-02","s2","Water cart"],
  ["A40-31","s7","A40 hauler"],["A40-32","s7","A40 hauler"],["A40-33","s7","A40 hauler"],["EX-08","s7","Excavator"],["EX-09","s7","Excavator"],["DZ-07","s7","Dozer"],
];
const base: Record<string, { burn: number; tph: number }> = { "A40 hauler": { burn: 38, tph: 95 }, Excavator: { burn: 55, tph: 190 }, Dozer: { burn: 32, tph: 40 }, "Water cart": { burn: 18, tph: 0 } };
// Planted problems so the rules have something real-looking to find.
const idleBias: Record<string, number> = { "A40-17": 0.42, "A40-12": 0.3, "EX-08": 0.34, "A40-32": 0.27 };
const fuelBias: Record<string, number> = { "EX-03": 1.45, "A40-22": 1.32 };
const faultPlan: Record<string, { code: string; days: number[] }> = { "A40-31": { code: "P0087 low rail pressure", days: [0, 2, 3, 5] }, "DZ-03": { code: "SPN110 coolant temp high", days: [1, 4, 6] } };

export const FLEET: FleetMachine[] = spec.map(([id, site, type]) => ({
  id, site, type,
  days: Array.from({ length: 7 }, (_, d) => {
    const b = base[type]!; const engineH = 9.5 + rnd() * 2;
    const idleShare = (idleBias[id] ?? 0.1) + (rnd() - 0.5) * 0.06;
    const idleH = +(engineH * idleShare).toFixed(1);
    const work = engineH - idleH;
    const tonnes = Math.round(work * b.tph * (0.9 + rnd() * 0.2));
    const litres = Math.round((work * b.burn * (fuelBias[id] ?? 1) + idleH * (DEFAULTS.idleBurnLPerH[type] ?? 8)) * (0.96 + rnd() * 0.08));
    const fp = faultPlan[id]; const faults = fp && fp.days.includes(d) ? [fp.code] : [];
    return { engineH: +engineH.toFixed(1), idleH, litres, tonnes, faults };
  }),
}));

import type { Day, FleetMachine } from "./fleet";
export const TEMPLATE = "machine_id,site,type,date,engine_hours,idle_hours,litres,tonnes,fault_code,lat,lon\nA40-01,Site 1,A40 hauler,2026-10-12,10.5,2.1,420,980,,-26.2041,28.0473\nA40-01,Site 1,A40 hauler,2026-10-13,10.2,1.8,400,1010,P0087 low rail pressure,-26.2043,28.0476\n";
const COLS = ["machine_id", "site", "type", "date", "engine_hours", "idle_hours", "litres", "tonnes", "fault_code", "lat", "lon"];
export type Parsed = { fleet: FleetMachine[]; rows: number; errors: string[] };

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]!; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out.map((x) => x.trim());
}
export function parseFleetCsv(text: string): Parsed {
  const errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { fleet: [], rows: 0, errors: ["The file has no data rows."] };
  const head = splitLine(lines[0]!).map((h) => h.toLowerCase());
  const miss = COLS.filter((c) => c !== "fault_code" && c !== "lat" && c !== "lon" && !head.includes(c));
  if (miss.length) return { fleet: [], rows: 0, errors: [`Missing columns: ${miss.join(", ")}. Download the template to see the format.`] };
  const ix = Object.fromEntries(COLS.map((c) => [c, head.indexOf(c)])) as Record<string, number>;
  const by = new Map<string, FleetMachine>(); let rows = 0;
  lines.slice(1, 20001).forEach((l, n) => {
    const f = splitLine(l); const g = (c: string) => (ix[c]! >= 0 ? f[ix[c]!] ?? "" : "");
    const id = g("machine_id"); const eng = Number(g("engine_hours")); const idle = Number(g("idle_hours")); const lit = Number(g("litres")); const t = Number(g("tonnes"));
    const bad = !id || ![eng, idle, lit, t].every(Number.isFinite) || eng < 0 || idle < 0 || lit < 0 || t < 0 || idle > eng || eng > 24;
    if (bad) { if (errors.length < 8) errors.push(`Row ${n + 2}: skipped (${!id ? "no machine_id" : idle > eng ? "idle hours above engine hours" : "number missing or out of range"}).`); return; }
    const key = id.toUpperCase(); let m = by.get(key);
    if (!m) { m = { id, site: g("site") || "Unassigned", type: g("type") || "Machine", days: [] }; by.set(key, m); }
    const d: Day = { engineH: eng, idleH: idle, litres: lit, tonnes: t, faults: g("fault_code") ? [g("fault_code")] : [] };
    const la = Number(g("lat")), lo = Number(g("lon"));
    if (g("lat") && g("lon") && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) m.at = [lo, la];
    m.days.push(d); rows++;
  });
  return { fleet: [...by.values()], rows, errors };
}

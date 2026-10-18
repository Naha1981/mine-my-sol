import type { FpRow } from "./engine";
export const TEMPLATE =
  "machine_id,site,machine_type,date,engine_hours,idle_hours,litres,fault_code,fault_severity\nTRK-01,Site 1,Articulated hauler,2026-10-12,10.5,2.1,420,,\nTRK-01,Site 1,Articulated hauler,2026-10-13,10.2,1.8,400,P0087 low rail pressure,warn\n";
const REQ = ["machine_id", "date", "engine_hours", "idle_hours", "litres"];
export type ParsedCsv = { rows: Omit<FpRow, "is_sample">[]; skipped: string[]; total: number };
function split(line: string): string[] {
  const o: string[] = [];
  let c = "",
    q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        c += '"';
        i++;
      } else q = !q;
    } else if (ch === "," && !q) {
      o.push(c);
      c = "";
    } else c += ch;
  }
  o.push(c);
  return o.map((x) => x.trim());
}
export function parseCsv(text: string): ParsedCsv | { error: string } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { error: "The file has no data rows." };
  const head = split(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  if (head.includes("type") && !head.includes("machine_type"))
    head[head.indexOf("type")] = "machine_type";
  const miss = REQ.filter((c) => !head.includes(c));
  if (miss.length)
    return {
      error: `Missing columns: ${miss.join(", ")}. Download the template to see the format.`,
    };
  const ix = (c: string) => head.indexOf(c);
  const skipped: string[] = [];
  const rows: ParsedCsv["rows"] = [];
  const data = lines.slice(1, 20001);
  data.forEach((l, n) => {
    const f = split(l);
    const g = (c: string) => (ix(c) >= 0 ? (f[ix(c)] ?? "") : "");
    const eng = Number(g("engine_hours")),
      idle = Number(g("idle_hours")),
      lit = Number(g("litres"));
    const day = g("date");
    const sev = g("fault_severity").toLowerCase();
    const why = !g("machine_id")
      ? "no machine_id"
      : !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))
        ? "date must be YYYY-MM-DD"
        : ![eng, idle, lit].every(Number.isFinite) || eng < 0 || idle < 0 || lit < 0
          ? "number missing or negative"
          : eng > 24
            ? "engine hours above 24"
            : idle > eng
              ? "idle hours above engine hours"
              : sev && !["info", "warn", "stop"].includes(sev)
                ? "fault_severity must be info, warn or stop"
                : "";
    if (why) {
      if (skipped.length < 8) skipped.push(`Row ${n + 2}: skipped (${why}).`);
      return;
    }
    rows.push({
      machine_id: g("machine_id").slice(0, 40),
      site: (g("site") || "Unassigned").slice(0, 60),
      machine_type: (g("machine_type") || "Machine").slice(0, 60),
      day,
      engine_h: eng,
      idle_h: idle,
      litres: lit,
      fault_code: g("fault_code") ? g("fault_code").slice(0, 80) : null,
      fault_severity: g("fault_code") ? (sev as "info" | "warn" | "stop") || "warn" : null,
    });
  });
  return { rows, skipped, total: data.length };
}

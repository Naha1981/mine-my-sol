import type { Day, FleetMachine } from "./fleet";

export const TEMPLATE = "machine_id,site,type,date,engine_hours,idle_hours,litres,tonnes,fault_code,lat,lon\nA40-01,Site 1,A40 hauler,2026-10-12,10.5,2.1,420,980,,-26.2041,28.0473\nA40-01,Site 1,A40 hauler,2026-10-13,10.2,1.8,400,1010,P0087 low rail pressure,-26.2043,28.0476\n";
const COLS = ["machine_id", "site", "type", "date", "engine_hours", "idle_hours", "litres", "tonnes", "fault_code", "lat", "lon"];
const MAX_ROWS = 20_000;
const DAY_MS = 86_400_000;
export type Parsed = { fleet: FleetMachine[]; rows: number; errors: string[]; warnings: string[] };

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]!; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out.map((x) => x.trim());
}

/** Accept only real ISO calendar dates; timestamps are UTC to avoid local-time/DST drift. */
function dateTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

type CsvRow = {
  line: number;
  id: string;
  site: string;
  type: string;
  date: string;
  dateTimestamp: number;
  engineH: number;
  idleH: number;
  litres: number;
  tonnes: number;
  fault: string;
  lat: string;
  lon: string;
};

export function parseFleetCsv(text: string): Parsed {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { fleet: [], rows: 0, errors: ["The file has no data rows."], warnings: [] };
  if (lines.length - 1 > MAX_ROWS) {
    return { fleet: [], rows: 0, errors: [`The file has more than ${MAX_ROWS.toLocaleString("en-ZA")} data rows. Split it into smaller CSVs; no data was imported.`], warnings: [] };
  }

  const head = splitLine(lines[0]!).map((h) => h.toLowerCase());
  const miss = COLS.filter((c) => c !== "fault_code" && c !== "lat" && c !== "lon" && !head.includes(c));
  if (miss.length) return { fleet: [], rows: 0, errors: [`Missing columns: ${miss.join(", ")}. Download the template to see the format.`], warnings: [] };
  const ix = Object.fromEntries(COLS.map((c) => [c, head.indexOf(c)])) as Record<string, number>;
  const rowErrors: string[] = [];
  const addRowError = (message: string) => { if (rowErrors.length < 8) rowErrors.push(message); };
  const candidates: CsvRow[] = [];

  lines.slice(1).forEach((line, index) => {
    const f = splitLine(line); const g = (c: string) => (ix[c]! >= 0 ? f[ix[c]!] ?? "" : "");
    const id = g("machine_id");
    const site = g("site") || "Unassigned";
    const type = g("type") || "Machine";
    const date = g("date");
    const timestamp = dateTimestamp(date);
    const numericFields = ["engine_hours", "idle_hours", "litres", "tonnes"];
    const missingNumeric = numericFields.find((column) => !g(column));
    const eng = Number(g("engine_hours"));
    const idle = Number(g("idle_hours"));
    const litres = Number(g("litres"));
    const tonnes = Number(g("tonnes"));

    if (!id) { addRowError(`Row ${index + 2}: skipped (no machine_id).`); return; }
    if (timestamp === null) { addRowError(`Row ${index + 2}: skipped (date must be a real YYYY-MM-DD date).`); return; }
    if (missingNumeric) { addRowError(`Row ${index + 2}: skipped (missing ${missingNumeric}).`); return; }
    if (![eng, idle, litres, tonnes].every(Number.isFinite) || eng < 0 || idle < 0 || litres < 0 || tonnes < 0 || idle > eng || eng > 24) {
      addRowError(`Row ${index + 2}: skipped (${idle > eng ? "idle hours above engine hours" : "number out of range"}).`);
      return;
    }

    candidates.push({
      line: index + 2, id, site, type, date, dateTimestamp: timestamp,
      engineH: eng, idleH: idle, litres, tonnes, fault: g("fault_code"), lat: g("lat"), lon: g("lon"),
    });
  });

  if (!candidates.length) return { fleet: [], rows: 0, errors: rowErrors.length ? rowErrors : ["No valid data rows found."], warnings: [] };

  // All downstream rules assume a seven-day sample. Anchor that window to the newest
  // valid date in the file, and never silently mix older weeks into the same calculation.
  const latestTimestamp = Math.max(...candidates.map((row) => row.dateTimestamp));
  const startTimestamp = latestTimestamp - 6 * DAY_MS;
  const latestDate = new Date(latestTimestamp).toISOString().slice(0, 10);
  const startDate = new Date(startTimestamp).toISOString().slice(0, 10);
  const currentWindow = candidates.filter((row) => row.dateTimestamp >= startTimestamp);
  const skippedOlder = candidates.length - currentWindow.length;
  const by = new Map<string, FleetMachine>();
  const seenMachineDates = new Set<string>();
  const importedDates = new Set<string>();
  let rows = 0;

  for (const row of currentWindow) {
    const key = row.id.toUpperCase();
    let machine = by.get(key);
    if (machine && (machine.site !== row.site || machine.type !== row.type)) {
      addRowError(`Row ${row.line}: skipped (machine ${row.id} has conflicting site or type values).`);
      continue;
    }
    const machineDate = `${key}| ${row.date}`;
    if (seenMachineDates.has(machineDate)) {
      addRowError(`Row ${row.line}: skipped (duplicate record for machine ${row.id} on ${row.date}; use one daily total per machine).`);
      continue;
    }
    seenMachineDates.add(machineDate);
    if (!machine) {
      machine = { id: row.id, site: row.site, type: row.type, days: [] };
      by.set(key, machine);
    }
    const day: Day = { engineH: row.engineH, idleH: row.idleH, litres: row.litres, tonnes: row.tonnes, faults: row.fault ? [row.fault] : [] };
    const lat = Number(row.lat), lon = Number(row.lon);
    if (row.lat && row.lon && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) machine.at = [lon, lat];
    machine.days.push(day);
    rows++;
    importedDates.add(row.date);
  }

  const dates = [...importedDates].sort();
  const warnings: string[] = [];
  if (dates.length) {
    warnings.push(`Imported data dates: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} distinct date(s)).`);
    if (dates.length < 7) warnings.push(`Only ${dates.length} distinct date(s) have records in the seven-day window; weekly-equivalent costs are extrapolated from observed days.`);
  }
  if (skippedOlder) warnings.push(`Skipped ${skippedOlder} older row(s) outside the latest seven-day window (${startDate} to ${latestDate}).`);
  return { fleet: [...by.values()], rows, errors: rowErrors, warnings };
}

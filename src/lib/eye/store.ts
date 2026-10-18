import type { FleetMachine } from "./fleet";
const KEY = "mms-fleet-csv-v1";
export function loadMine(): { fleet: FleetMachine[]; name: string } | null {
  try { const r = JSON.parse(localStorage.getItem(KEY) ?? "null"); return r && Array.isArray(r.fleet) && r.fleet.length ? r : null; } catch { return null; }
}
export function saveMine(fleet: FleetMachine[] | null, name = "") {
  try { if (fleet && fleet.length) localStorage.setItem(KEY, JSON.stringify({ fleet, name })); else localStorage.removeItem(KEY); } catch { /* storage full or blocked */ }
}

// Shift operations: forecast, reports, accountability board, corrective actions.
// Pure functions over the same Site model the Eye renders. No I/O here.
import type { Site, Evidence } from "./sample";
import { causes, type Cause } from "./engine";

export type Fix = { id: string; action: string; owner: string; due: string; cause: string; status: "open" | "done"; createdAt: string };
export type UploadedClip = { id: string; at: string; label: string; shows: Evidence["shows"]; note: string; url: string; kind: "video" | "photo"; disputed: boolean };

/** Area supervisor is derived from the delay wording - a role, never an invented name. */
export function supervisorFor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("pit b")) return "Pit B supervisor";
  if (l.includes("pit c")) return "Pit C supervisor";
  if (l.includes("pit d")) return "Pit D supervisor";
  if (l.includes("ramp")) return "Ramp supervisor";
  if (l.includes("crusher")) return "Crusher supervisor";
  if (l.includes("dust") || l.includes("weather")) return "Shift supervisor";
  return "Shift supervisor";
}

export type Forecast = {
  elapsedH: number; rateNow: number; projected: number; neededRate: number;
  catchupRate: number; onPace: boolean; reachClock: string | null; shortfall: number;
};
const clock = (minsAfter18: number) => { const m = (18 * 60 + minsAfter18) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** Projection for the 18:00-06:00 shift (720 minutes). elapsedMin = replay position. */
export function forecast(s: Site, elapsedMin: number): Forecast {
  const elapsedH = Math.max(elapsedMin / 60, 0.5);
  const rateNow = s.actual / elapsedH;
  const projected = Math.round(rateNow * 12);
  const neededRate = Math.round(s.target / 12);
  const remainH = Math.max(12 - elapsedH, 0.5);
  const catchupRate = Math.round(Math.max(s.target - s.actual, 0) / remainH);
  const onPace = projected >= s.target;
  const reachMin = rateNow > 0 ? (s.target / rateNow) * 60 : Infinity;
  const reachClock = reachMin <= 720 ? clock(Math.round(reachMin)) : null;
  return { elapsedH: Math.round(elapsedH * 10) / 10, rateNow: Math.round(rateNow), projected, neededRate, catchupRate, onPace, reachClock, shortfall: Math.max(s.target - s.actual, 0) };
}

/** 05:00 handover: what the night shift did, what is disputed, what the day shift must watch. One screen. */
export function handoverText(s: Site, cs: Cause[], fixes: Fix[]): string {
  const p = Math.round((s.actual / s.target) * 100);
  const L = [
    `NIGHT HANDOVER 05:00 - ${s.name.split(" (")[0]}`,
    `Production: ${s.actual.toLocaleString()} t of ${s.target.toLocaleString()} t (${p}%). ${p >= 100 ? "Target reached." : `${(s.target - s.actual).toLocaleString()} t short.`}`,
    "",
    "Where the tonnes went:",
    ...cs.map((c) => `${c.rank}. ${c.label} - about ${c.tonnes.toLocaleString()} t (${c.conf}${c.disputed ? ", DISPUTED: clip contradicts the report" : ""})`),
  ];
  const disputed = cs.filter((c) => c.disputed);
  if (disputed.length) { L.push("", "Needs an answer before 06:00:", ...disputed.map((c) => `- ${supervisorFor(c.label)}: ${c.label} - the clip shows loading during the reported stop.`)); }
  const idle = s.machines.filter((m) => m.idleHours >= 2);
  if (idle.length) L.push("", `Machines idle 2h+: ${idle.map((m) => `${m.id} (${m.idleHours}h)`).join(", ")}.`);
  const open = fixes.filter((f) => f.status === "open");
  if (open.length) L.push("", "Open fixes for day shift:", ...open.map((f) => `- ${f.action} (${f.owner}, due ${f.due})`));
  L.push("", "Every figure above links to a clip or machine record in the evidence pack.");
  return L.join("\n");
}

/** 07:00 morning update for the CEO: where things stand, what changed overnight, what to expect. */
export function morningText(s: Site, cs: Cause[], f: Forecast, clips: UploadedClip[]): string {
  const p = Math.round((s.actual / s.target) * 100);
  const top = cs[0];
  const L = [
    `MORNING UPDATE 07:00 - ${s.name.split(" (")[0]}`,
    `Night shift: ${s.actual.toLocaleString()} t of ${s.target.toLocaleString()} t (${p}%).`,
    top ? `Biggest cause of lost tonnes: ${top.label}, about ${top.tonnes.toLocaleString()} t (${top.conf}).` : "No delays recorded.",
    f.elapsedH >= 11.9
      ? `The shift closed at ${s.actual.toLocaleString()} t (${p}% of target).`
      : f.onPace
        ? `Forecast: on pace - target reached inside the shift at the current rate (${f.rateNow.toLocaleString()} t/h).`
        : `Forecast: at the current rate (${f.rateNow.toLocaleString()} t/h) the shift ends near ${f.projected.toLocaleString()} t. To still hit target from here: ${f.catchupRate.toLocaleString()} t/h needed (shift average ${f.neededRate.toLocaleString()} t/h).${f.reachClock ? ` At current pace target is reached about ${f.reachClock}.` : ""}`,
  ];
  const fresh = clips.filter((c) => c.kind === "video" || c.kind === "photo");
  if (fresh.length) { L.push("", `Fresh site clips (${fresh.length}):`, ...fresh.map((c) => `- ${c.at}: ${c.label}${c.disputed ? " - CONTRADICTS a reported stop" : ""}`)); }
  L.push("", "Photos and clips from the pit are pinned on the live map with times.");
  return L.join("\n");
}

export type BoardRow = { supervisor: string; delays: number; unreported: number; disputes: number; tonnesLost: number; clips: number };
export function boardRows(s: Site, cs: Cause[], clips: UploadedClip[]): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  const get = (k: string) => { const r = rows.get(k) ?? { supervisor: k, delays: 0, unreported: 0, disputes: 0, tonnesLost: 0, clips: 0 }; rows.set(k, r); return r; };
  for (const d of s.delays) {
    const c = cs.find((x) => x.label.startsWith(d.label));
    const r = get(supervisorFor(d.label));
    r.delays += 1; if (!d.reported) r.unreported += 1; if (c?.disputed) r.disputes += 1; r.tonnesLost += c?.tonnes ?? Math.round(d.hours * d.rate);
  }
  for (const e of s.evidence) get(supervisorFor(e.label)).clips += 1;
  for (const c of clips) get("Shift supervisor").clips += 1;
  return [...rows.values()].sort((a, b) => b.tonnesLost - a.tonnesLost);
}

/** A first fix per cause - the practical next step, editable before saving. */
export function suggestFixes(cs: Cause[]): { cause: string; action: string; owner: string; due: string }[] {
  return cs.slice(0, 3).map((c) => {
    const l = c.label.toLowerCase();
    const owner = supervisorFor(c.label);
    let action = `Investigate ${c.label} and report back with a clip`;
    if (l.includes("blast")) action = "Move blast clearance prep before 01:00 and confirm with a clip when the face is clear";
    else if (l.includes("idle") || l.includes("hauler")) action = "Account for every parked hauler at 02:00 rounds - photo each one";
    else if (l.includes("crusher") || l.includes("breakdown")) action = "Fit the crusher spare from stores and clip the restart time";
    else if (l.includes("dust") || l.includes("weather")) action = "Pre-position the water cart before the wind window";
    return { cause: c.label, action, owner, due: "next shift" };
  });
}

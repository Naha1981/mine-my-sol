import { analyse, type FpRow, type FpSettings } from "./engine";
import {
  buildCauses,
  buildFlags,
  suggestActions,
  variance,
  type Cause,
  type Delay,
  type Evidence,
  type Flag,
  type MachineEvent,
  type Shift,
  type ShiftSettings,
  type Suggested,
} from "./shift";

export type Brief = {
  company: string;
  date: string;
  shift: "day" | "night";
  group: { planned_t: number; actual_t: number; variance_pct: number };
  sites: {
    site: string;
    planned_t: number;
    actual_t: number;
    variance_pct: number;
    flag: "shortfall" | "overperform" | "on_plan";
  }[];
  topCauses: { text: string; site: string; est_impact_t: number; label: Cause["label"] }[];
  machineExceptions: { machine: string; text: string }[];
  evidenceGaps: string[];
  flags: { type: Flag["type"]; text: string }[];
  actions: Suggested[];
  hasData: boolean;
};
export type BriefInput = {
  company: string;
  date: string;
  shift: "day" | "night";
  shifts: Shift[];
  delays: Delay[];
  events: MachineEvent[];
  evidence: Evidence[];
  fleetRows: FpRow[];
  fleetSettings: FpSettings;
  s: ShiftSettings;
};

export function buildBrief(i: BriefInput): Brief {
  const todays = i.shifts.filter((x) => x.day === i.date && x.shift === i.shift);
  const faults = i.fleetRows
    .filter((r) => r.fault_code)
    .map((r) => ({ machine_id: r.machine_id, day: r.day }));
  const vs = todays.map((sh) => variance(sh, i.shifts, i.s));
  const causes = todays
    .flatMap((sh) => buildCauses(sh, i.delays, i.events, i.evidence, faults, i.s))
    .sort((a, b) => b.est_impact_t - a.est_impact_t);
  const flags = todays.flatMap((sh) =>
    buildFlags(
      sh,
      causes.filter((c) => c.shift_id === sh.id),
      i.delays,
      i.events,
      i.evidence,
      i.s,
    ),
  );
  const planned = vs.reduce((a, v) => a + v.shift.planned_t, 0),
    actual = vs.reduce((a, v) => a + v.shift.actual_t, 0);
  const exceptions = analyse(i.fleetRows, i.fleetSettings)
    .filter((x) => x.type === "FAULT_REPEAT")
    .slice(0, 3)
    .map((x) => ({ machine: x.machine, text: x.headline }));
  return {
    company: i.company,
    date: i.date,
    shift: i.shift,
    hasData: todays.length > 0,
    group: {
      planned_t: planned,
      actual_t: actual,
      variance_pct: planned > 0 ? (actual - planned) / planned : 0,
    },
    sites: vs
      .map((v) => ({
        site: v.shift.site,
        planned_t: v.shift.planned_t,
        actual_t: v.shift.actual_t,
        variance_pct: v.variance_pct,
        flag: v.flag,
      }))
      .sort((a, b) => a.variance_pct - b.variance_pct),
    topCauses: causes
      .slice(0, 3)
      .map((c) => ({ text: c.text, site: c.site, est_impact_t: c.est_impact_t, label: c.label })),
    machineExceptions: exceptions,
    evidenceGaps: causes.filter((c) => c.label === "missing").map((c) => `${c.site}: ${c.text}`),
    flags: flags
      .filter((f) => f.type !== "missing_evidence")
      .map((f) => ({ type: f.type, text: f.text })),
    actions: suggestActions(causes),
  };
}

const pct = (n: number) =>
  Math.abs(n) < 0.005 ? "on plan" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;
const t = (n: number) =>
  Math.round(n)
    .toLocaleString("en-ZA")
    .replace(/\u00a0/g, " ");
const lab = { confirmed: "Confirmed", inferred: "Inferred", missing: "Missing evidence" } as const;
/** WhatsApp text from the same Brief object. One phone screen. */
export function renderWhatsApp(b: Brief): string {
  if (!b.hasData) return `${b.company}: no shift data for ${b.shift} shift ${b.date}.`;
  const L = [
    `${b.company} - ${b.shift === "night" ? "Night" : "Day"} shift ${b.date}.`,
    `Group: ${t(b.group.actual_t)} t vs ${t(b.group.planned_t)} t plan (${pct(b.group.variance_pct)}).`,
    b.sites.map((s) => `${s.site} ${pct(s.variance_pct)}`).join(", ") + ".",
  ];
  if (b.topCauses.length)
    L.push(
      "Top causes: " +
        b.topCauses
          .map((c, n) => `${n + 1} ${c.text}, about ${t(c.est_impact_t)} t [${lab[c.label]}]`)
          .join(". ") +
        ".",
    );
  const nr = b.flags.filter((f) => f.type === "contradiction");
  if (nr.length)
    L.push(
      "Needs review: " +
        nr
          .map((f) => f.text.replace(/^Needs review: /, ""))
          .join(" ")
          .slice(0, 200),
    );
  if (b.flags.some((f) => f.type === "unexplained_gap"))
    L.push("Part of the shortfall is not explained yet.");
  L.push(
    `Actions before the next shift: ${b.actions.length}.`,
    "Estimates from your data and settings. Decision support, not proof.",
  );
  return L.join("\n");
}

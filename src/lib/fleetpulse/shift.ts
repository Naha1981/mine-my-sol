// Shift variance, cause ranking, labels, flags and suggested actions. Pure functions, no I/O.
// INTERPRETED RULES (the source plan is silent or loose here) are marked [I#] and listed in INTERPRETATIONS.
export const INTERPRETATIONS: Record<string, string> = {
  I1: "Downtime hours use the event's own duration, capped at the shift length (shift start and end times are not stored).",
  I2: "A delay with no named machine is corroborated by any breakdown, maintenance, idle or standby event at the same site that overlaps its window.",
  I3: "Where a reported delay and a machine event are merged, impact is the reported figure if given, otherwise the downtime-based estimate. The mismatch check compares reported against the downtime-based estimate.",
  I4: "Causes labelled Confirmed or Inferred count as explained for the unexplained gap. Missing causes do not.",
  I5: "Only idle or standby of loading units (excavators) counts as downtime without a report. Idle trucks are not treated as lost production.",
  I6: "Contradiction checks use delay rows of kind 'activity' (the site report says loading was active in a window).",
  I7: "Cause impact weights default to 1.0 for excavators and 0.2 for trucks. They are uncalibrated placeholders until real data exists.",
  I8: "Causes, flags and actions are computed from your data when you open a brief; they are not stored snapshots.",
};

export type Shift = {
  id: string;
  site: string;
  day: string;
  shift: "day" | "night";
  shift_hours: number;
  planned_t: number;
  actual_t: number;
};
export type Delay = {
  id: string;
  shift_id: string;
  kind: "delay" | "activity";
  reason: string;
  start_at: string;
  end_at: string;
  reported_impact_t: number | null;
  machine_id: string | null;
  note?: string | null;
};
export type MachineEvent = {
  id: string;
  shift_id: string | null;
  site: string;
  machine_id: string;
  machine_type: "excavator" | "truck" | "other";
  status: "operating" | "idle" | "standby" | "breakdown" | "maintenance" | "refuelling";
  start_at: string;
  end_at: string;
};
export type Evidence = {
  id: string;
  shift_id: string;
  machine_id: string | null;
  delay_id: string | null;
  status: "verified" | "needs_review" | "disputed";
};
export type FaultRef = { machine_id: string; day: string };
export type ShiftSettings = {
  variance_flag_pct: number;
  unexplained_gap_share: number;
  impact_mismatch_pct: number;
  crit_excavator: number;
  crit_truck: number;
};
export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  variance_flag_pct: 0.05,
  unexplained_gap_share: 0.25,
  impact_mismatch_pct: 0.25,
  crit_excavator: 1.0,
  crit_truck: 0.2,
};

export type Label = "confirmed" | "inferred" | "missing";
export type Cause = {
  key: string;
  shift_id: string;
  site: string;
  kind: "delay" | "downtime" | "merged";
  type: "breakdown" | "blast" | "queueing" | "loading_unit" | "other";
  text: string;
  machine_id: string | null;
  label: Label;
  est_impact_t: number;
  reported_impact_t: number | null;
  evidence_refs: string[];
  delay_id: string | null;
  event_id: string | null;
};
export type Flag = {
  type: "contradiction" | "unexplained_gap" | "missing_evidence";
  shift_id: string;
  site: string;
  text: string;
};

const ms = (s: string) => Date.parse(s);
export const hoursBetween = (a: string, b: string) => Math.max(0, (ms(b) - ms(a)) / 3600000);
const overlap = (a0: string, a1: string, b0: string, b1: string) =>
  Math.max(0, Math.min(ms(a1), ms(b1)) - Math.max(ms(a0), ms(b0))) / 3600000;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---- variance -------------------------------------------------------------
export type Variance = {
  shift: Shift;
  variance_t: number;
  variance_pct: number;
  flag: "shortfall" | "overperform" | "on_plan";
  prior7_avg: number | null;
  vs_prior7_t: number | null;
};
export function variance(sh: Shift, all: Shift[], s: ShiftSettings): Variance {
  const v = sh.actual_t - sh.planned_t;
  const pct = sh.planned_t > 0 ? v / sh.planned_t : 0;
  const end = ms(sh.day + "T00:00:00Z");
  const prior = all.filter(
    (x) =>
      x.site === sh.site &&
      x.shift === sh.shift &&
      ms(x.day + "T00:00:00Z") < end &&
      ms(x.day + "T00:00:00Z") >= end - 7 * 86400000,
  );
  const avg = prior.length ? sum(prior.map((p) => p.actual_t)) / prior.length : null;
  return {
    shift: sh,
    variance_t: v,
    variance_pct: pct,
    flag:
      pct <= -s.variance_flag_pct
        ? "shortfall"
        : pct >= s.variance_flag_pct
          ? "overperform"
          : "on_plan",
    prior7_avg: avg,
    vs_prior7_t: avg == null ? null : sh.actual_t - avg,
  };
}
export const siteRate = (sh: Shift) => (sh.shift_hours > 0 ? sh.planned_t / sh.shift_hours : 0); // site_t_per_h

// ---- causes ---------------------------------------------------------------
const weight = (t: MachineEvent["machine_type"], s: ShiftSettings) =>
  t === "excavator" ? s.crit_excavator : t === "truck" ? s.crit_truck : 0;
const causeType = (
  reason: string,
  machineType?: MachineEvent["machine_type"],
  status?: string,
): Cause["type"] =>
  /blast/i.test(reason)
    ? "blast"
    : /queue|queuing|queueing/i.test(reason)
      ? "queueing"
      : /breakdown|fault|repair|hydraul|engine/i.test(reason) ||
          status === "breakdown" ||
          status === "maintenance"
        ? "breakdown"
        : /loading unit|no excavator|loader|shortage/i.test(reason) ||
            (machineType === "excavator" && (status === "idle" || status === "standby"))
          ? "loading_unit"
          : "other";
const downtimeStatus = (e: MachineEvent) =>
  e.status === "breakdown" ||
  e.status === "maintenance" ||
  (e.machine_type === "excavator" && (e.status === "idle" || e.status === "standby")); // [I5]

export function buildCauses(
  sh: Shift,
  delays: Delay[],
  events: MachineEvent[],
  evidence: Evidence[],
  faults: FaultRef[],
  s: ShiftSettings,
): Cause[] {
  const rate = siteRate(sh);
  const out: Cause[] = [];
  const usedEvents = new Set<string>();
  const evs = events.filter(
    (e) => e.shift_id === sh.id || (e.shift_id === null && e.site === sh.site),
  );
  const ds = delays.filter((d) => d.shift_id === sh.id && d.kind === "delay");
  const okEvidence = (f: (e: Evidence) => boolean) =>
    evidence.filter((e) => e.shift_id === sh.id && e.status !== "disputed" && f(e));
  for (const d of ds) {
    const dh = hoursBetween(d.start_at, d.end_at);
    const day = d.start_at.slice(0, 10);
    // merge with an overlapping machine event for the same machine [8.1]
    const ev = d.machine_id
      ? evs.find(
          (e) =>
            e.machine_id === d.machine_id &&
            downtimeStatus(e) &&
            overlap(d.start_at, d.end_at, e.start_at, e.end_at) > 0,
        )
      : undefined;
    // corroboration without a named machine [I2]
    const loose = !d.machine_id
      ? evs.find(
          (e) =>
            (e.status === "breakdown" ||
              e.status === "maintenance" ||
              e.status === "idle" ||
              e.status === "standby") &&
            overlap(d.start_at, d.end_at, e.start_at, e.end_at) > 0,
        )
      : undefined;
    const fault = d.machine_id
      ? faults.some((f) => f.machine_id === d.machine_id && f.day === day)
      : false;
    const ev2 = ev ?? loose;
    if (ev2) usedEvents.add(ev2.id);
    const evid = okEvidence(
      (e) => e.delay_id === d.id || (!!d.machine_id && e.machine_id === d.machine_id),
    );
    const corroborated = !!ev2 || fault || evid.length > 0;
    const refs = [
      ...(ev2 ? [`event:${ev2.id}`] : []),
      ...(fault ? [`fault:${d.machine_id}:${day}`] : []),
      ...evid.map((e) => `evidence:${e.id}`),
    ];
    const downH = ev ? Math.min(hoursBetween(ev.start_at, ev.end_at), sh.shift_hours) : 0; // [I1]
    const computed = ev ? downH * rate * weight(ev.machine_type, s) : dh * rate;
    const est = d.reported_impact_t ?? computed; // [I3]
    let label: Label = !corroborated ? "missing" : "confirmed";
    if (
      corroborated &&
      d.reported_impact_t != null &&
      computed > 0 &&
      Math.abs(d.reported_impact_t - computed) / computed > s.impact_mismatch_pct
    )
      label = "inferred";
    const type = causeType(d.reason, ev2?.machine_type, ev2?.status);
    out.push({
      key: `delay:${d.id}`,
      shift_id: sh.id,
      site: sh.site,
      kind: ev ? "merged" : "delay",
      type,
      text: `${d.reason}${d.machine_id ? " (" + d.machine_id + ")" : ""}, ${r1(dh)} h`,
      machine_id: d.machine_id,
      label,
      est_impact_t: r1(est),
      reported_impact_t: d.reported_impact_t,
      evidence_refs: refs,
      delay_id: d.id,
      event_id: ev?.id ?? null,
    });
  }
  // downtime with no report: Inferred [I5]
  for (const e of evs)
    if (!usedEvents.has(e.id) && downtimeStatus(e)) {
      const h = Math.min(hoursBetween(e.start_at, e.end_at), sh.shift_hours);
      const est = h * rate * weight(e.machine_type, s);
      if (est <= 0) continue;
      out.push({
        key: `event:${e.id}`,
        shift_id: sh.id,
        site: sh.site,
        kind: "downtime",
        type: causeType("", e.machine_type, e.status),
        text: `${e.machine_id} ${e.status}, ${r1(h)} h`,
        machine_id: e.machine_id,
        label: "inferred",
        est_impact_t: r1(est),
        reported_impact_t: null,
        evidence_refs: [`event:${e.id}`],
        delay_id: null,
        event_id: e.id,
      });
    }
  return out.sort((a, b) => b.est_impact_t - a.est_impact_t);
}

// ---- flags ----------------------------------------------------------------
export function buildFlags(
  sh: Shift,
  causes: Cause[],
  delays: Delay[],
  events: MachineEvent[],
  evidence: Evidence[],
  s: ShiftSettings,
): Flag[] {
  const flags: Flag[] = [];
  const shortfall = Math.max(0, sh.planned_t - sh.actual_t);
  const explained = sum(causes.filter((c) => c.label !== "missing").map((c) => c.est_impact_t)); // [I4]
  const gap = shortfall - explained;
  if (shortfall > 0 && gap > s.unexplained_gap_share * shortfall)
    flags.push({
      type: "unexplained_gap",
      shift_id: sh.id,
      site: sh.site,
      text: `${Math.round(gap)} t of the ${Math.round(shortfall)} t shortfall at ${sh.site} is not explained by the causes above.`,
    });
  for (const c of causes)
    if (c.label === "missing")
      flags.push({
        type: "missing_evidence",
        shift_id: sh.id,
        site: sh.site,
        text: `${c.text} at ${sh.site}: reported, no machine data or evidence yet.`,
      });
  for (const d of delays.filter(
    (x) => x.shift_id === sh.id && x.kind === "activity" && x.machine_id,
  )) {
    // [I6]
    const dur = hoursBetween(d.start_at, d.end_at);
    if (dur <= 0) continue;
    const bad = sum(
      events
        .filter(
          (e) =>
            e.machine_id === d.machine_id &&
            (e.status === "idle" || e.status === "breakdown" || e.status === "standby"),
        )
        .map((e) => overlap(d.start_at, d.end_at, e.start_at, e.end_at)),
    );
    const hasEvidence = evidence.some(
      (e) =>
        e.shift_id === sh.id &&
        e.status !== "disputed" &&
        (e.delay_id === d.id || e.machine_id === d.machine_id),
    );
    if (bad / dur > 0.5 && !hasEvidence)
      flags.push({
        type: "contradiction",
        shift_id: sh.id,
        site: sh.site,
        text: `Needs review: ${sh.site} report says ${d.reason || "loading"} was active for ${r1(dur)} h, while ${d.machine_id} machine data shows it not working for most of that time. No evidence is attached yet.`,
      });
  }
  return flags;
}

// ---- actions --------------------------------------------------------------
export type Suggested = {
  cause_key: string;
  title: string;
  owner_role: "site manager" | "fleet planner" | "general manager";
  due: string;
};
export function suggestActions(causes: Cause[]): Suggested[] {
  return causes.slice(0, 3).map((c) => {
    const due = "Before the next shift";
    switch (c.type) {
      case "breakdown":
        return {
          cause_key: c.key,
          title: `Confirm repair status and parts for ${c.machine_id ?? "the machine"}`,
          owner_role: "fleet planner" as const,
          due,
        };
      case "blast":
        return {
          cause_key: c.key,
          title: `Agree blast timing and clearance with the site team (${c.site})`,
          owner_role: "site manager" as const,
          due,
        };
      case "queueing":
        return {
          cause_key: c.key,
          title: `Review truck queueing at the loading point (${c.site})`,
          owner_role: "site manager" as const,
          due,
        };
      case "loading_unit":
        return {
          cause_key: c.key,
          title: `Check loading unit availability at ${c.site}`,
          owner_role: "general manager" as const,
          due,
        };
      default:
        return {
          cause_key: c.key,
          title: `Review: ${c.text}`,
          owner_role: "site manager" as const,
          due,
        };
    }
  });
}

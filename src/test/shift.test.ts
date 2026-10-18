import { describe, expect, it } from "vitest";
import { buildBrief, renderWhatsApp } from "@/lib/fleetpulse/brief";
import {
  buildCauses,
  buildFlags,
  DEFAULT_SHIFT_SETTINGS,
  suggestActions,
  variance,
  type Delay,
  type Evidence,
  type MachineEvent,
  type Shift,
} from "@/lib/fleetpulse/shift";
import { DEFAULT_SETTINGS } from "@/lib/fleetpulse/engine";

const S = { ...DEFAULT_SHIFT_SETTINGS, crit_excavator: 0.4 };
const D = "2026-10-17";
const sh = (id: string, site: string, actual: number, day = D): Shift => ({
  id,
  site,
  day,
  shift: "night",
  shift_hours: 10,
  planned_t: 1000,
  actual_t: actual,
});
const t = (h: number, m = 0) =>
  `${D}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
const shifts = [
  sh("a", "Site A", 950),
  sh("b", "Site B", 860),
  sh("c", "Site C", 1040),
  sh("d", "Site D", 1000),
];
const delays: Delay[] = [
  {
    id: "d1",
    shift_id: "b",
    kind: "delay",
    reason: "Excavator breakdown",
    start_at: t(1),
    end_at: t(3, 30),
    reported_impact_t: null,
    machine_id: "EXC-02",
  },
  {
    id: "d2",
    shift_id: "b",
    kind: "delay",
    reason: "Truck queueing",
    start_at: t(4),
    end_at: t(5),
    reported_impact_t: null,
    machine_id: null,
  },
  {
    id: "d3",
    shift_id: "a",
    kind: "delay",
    reason: "Blast delay",
    start_at: t(2),
    end_at: t(3, 30),
    reported_impact_t: null,
    machine_id: null,
  },
  {
    id: "d4",
    shift_id: "a",
    kind: "activity",
    reason: "Loading active",
    start_at: t(0),
    end_at: t(2),
    reported_impact_t: null,
    machine_id: "EXC-01",
  },
];
const events: MachineEvent[] = [
  {
    id: "e1",
    shift_id: "b",
    site: "Site B",
    machine_id: "EXC-02",
    machine_type: "excavator",
    status: "breakdown",
    start_at: t(1),
    end_at: t(3, 30),
  },
  {
    id: "e2",
    shift_id: "a",
    site: "Site A",
    machine_id: "EXC-01",
    machine_type: "excavator",
    status: "idle",
    start_at: t(0),
    end_at: t(2),
  },
];
const ev: Evidence[] = [
  { id: "v1", shift_id: "b", machine_id: "EXC-02", delay_id: "d1", status: "verified" },
];
const faults = [{ machine_id: "EXC-02", day: D }];

describe("variance", () => {
  it("computes variance and flags", () => {
    expect(variance(shifts[1]!, shifts, S).variance_pct).toBeCloseTo(-0.14);
    expect(variance(shifts[1]!, shifts, S).flag).toBe("shortfall");
    expect(variance(shifts[0]!, shifts, S).flag).toBe("shortfall");
    expect(variance(shifts[2]!, shifts, S).flag).toBe("on_plan");
    expect(variance(sh("x", "Site C", 1100), shifts, S).flag).toBe("overperform");
  });
  it("prior 7-day average uses same site and shift", () => {
    const hist = [
      sh("h1", "Site B", 900, "2026-10-16"),
      sh("h2", "Site B", 1000, "2026-10-15"),
      sh("h3", "Site A", 1, "2026-10-16"),
    ];
    expect(variance(shifts[1]!, [...shifts, ...hist], S).prior7_avg).toBe(950);
  });
});
describe("causes and labels", () => {
  const b = shifts[1]!;
  const cs = buildCauses(b, delays, events, ev, faults, S);
  it("merges breakdown delay with its machine event and confirms it", () => {
    const c = cs.find((x) => x.delay_id === "d1")!;
    expect(c.kind).toBe("merged");
    expect(c.label).toBe("confirmed");
    expect(c.est_impact_t).toBeCloseTo(100);
    expect(c.evidence_refs.length).toBe(3);
  });
  it("labels an uncorroborated reported delay Missing", () => {
    expect(cs.find((x) => x.delay_id === "d2")!.label).toBe("missing");
  });
  it("exactly one label per cause and ranked by impact", () => {
    expect(cs.every((c) => ["confirmed", "inferred", "missing"].includes(c.label))).toBe(true);
    expect(cs[0]!.est_impact_t).toBeGreaterThanOrEqual(cs[1]!.est_impact_t);
  });
  it("downtime without a report is Inferred", () => {
    const c = buildCauses(b, [], events, [], [], S);
    expect(c).toHaveLength(1);
    expect(c[0]!.label).toBe("inferred");
  });
  it("big mismatch between reported and computed impact makes it Inferred", () => {
    const c = buildCauses(b, [{ ...delays[0]!, reported_impact_t: 300 }], events, ev, faults, S);
    expect(c[0]!.label).toBe("inferred");
  });
  it("disputed evidence does not corroborate", () => {
    const c = buildCauses(
      b,
      [delays[1]!],
      [],
      [{ id: "v9", shift_id: "b", machine_id: null, delay_id: "d2", status: "disputed" }],
      [],
      S,
    );
    expect(c[0]!.label).toBe("missing");
  });
  it("blast delay without evidence is Missing", () => {
    expect(
      buildCauses(shifts[0]!, delays, events, [], [], S).find((x) => x.delay_id === "d3")!.label,
    ).toBe("missing");
  });
});
describe("flags", () => {
  it("flags the unexplained gap at Site B", () => {
    const b = shifts[1]!;
    const cs = buildCauses(b, delays, events, ev, faults, S);
    const f = buildFlags(b, cs, delays, events, ev, S);
    expect(f.some((x) => x.type === "unexplained_gap")).toBe(true);
    expect(f.some((x) => x.type === "missing_evidence")).toBe(true);
  });
  it("flags the contradiction at Site A neutrally, and not when evidence exists", () => {
    const a = shifts[0]!;
    const f = buildFlags(a, buildCauses(a, delays, events, [], [], S), delays, events, [], S);
    const c = f.find((x) => x.type === "contradiction")!;
    expect(c.text).toMatch(/^Needs review/);
    expect(c.text).not.toMatch(/lie|excuse|fraud/i);
    expect(
      buildFlags(
        a,
        [],
        delays,
        events,
        [{ id: "z", shift_id: "a", machine_id: "EXC-01", delay_id: null, status: "verified" }],
        S,
      ).some((x) => x.type === "contradiction"),
    ).toBe(false);
  });
  it("no flags for a site on plan with nothing reported", () => {
    expect(buildFlags(shifts[3]!, [], delays, events, [], S)).toEqual([]);
  });
});
describe("actions and brief", () => {
  it("suggests at most three actions with owners", () => {
    const cs = buildCauses(shifts[1]!, delays, events, ev, faults, S);
    const a = suggestActions(cs);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(a[0]!.owner_role).toBe("fleet planner");
  });
  const brief = buildBrief({
    company: "Acme Mining",
    date: D,
    shift: "night",
    shifts,
    delays,
    events,
    evidence: ev,
    fleetRows: [],
    fleetSettings: DEFAULT_SETTINGS,
    s: S,
  });
  it("brief group totals and site order", () => {
    expect(brief.group.planned_t).toBe(4000);
    expect(brief.group.actual_t).toBe(3850);
    expect(brief.sites[0]!.site).toBe("Site B");
  });
  it("planted story shows in the brief and WhatsApp text", () => {
    const w = renderWhatsApp(brief);
    expect(w).toContain("[Confirmed]");
    expect(w).toContain("Needs review");
    expect(w).toContain("not explained");
    expect(w.length).toBeLessThan(900);
    expect(w).not.toMatch(/will fail|guarantee/i);
  });
  it("every number in the text comes from the brief object", () => {
    expect(renderWhatsApp(brief)).toContain("3 850 t vs 4 000 t plan");
  });
  it("no data gives a plain message", () => {
    expect(
      renderWhatsApp(
        buildBrief({
          company: "X",
          date: "2030-01-01",
          shift: "day",
          shifts: [],
          delays: [],
          events: [],
          evidence: [],
          fleetRows: [],
          fleetSettings: DEFAULT_SETTINGS,
          s: S,
        }),
      ),
    ).toContain("no shift data");
  });
});

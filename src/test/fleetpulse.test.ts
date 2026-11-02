import { describe, expect, it } from "vitest";
import { analyse, DEFAULT_SETTINGS, estimate, lastWeek } from "@/lib/fleetpulse/engine";
import { sampleRows } from "@/lib/fleetpulse/sample";
import { parseCsv, TEMPLATE } from "@/lib/fleetpulse/csv";
import { dailySummary } from "@/lib/fleetpulse/summary";
import { ShareLinkProvider, CloudApiProvider } from "@/lib/fleetpulse/messaging";

const rows = sampleRows("2026-10-17");
describe("fleetpulse engine", () => {
  it("sample data is deterministic", () => {
    expect(sampleRows("2026-10-17")).toEqual(rows);
    expect(rows.length).toBe(24 * 30);
  });
  it("finds the planted anomalies and nothing else", () => {
    const ins = analyse(rows, DEFAULT_SETTINGS);
    const idle = ins
      .filter((i) => i.type === "IDLE_EXCESS")
      .map((i) => i.machine)
      .sort();
    expect(idle).toEqual(["TRK-03", "TRK-08", "TRK-14"]);
    expect(ins.filter((i) => i.type === "FUEL_RATE_OUTLIER").map((i) => i.machine)).toContain(
      "EXC-02",
    );
    const f = ins
      .filter((i) => i.type === "FAULT_REPEAT")
      .map((i) => i.machine)
      .sort();
    expect(f).toEqual(["EXC-04", "TRK-11", "TRK-16"]);
  });
  it("uses last 7 days of the data, not the clock", () => {
    expect(lastWeek(rows).length).toBe(24 * 7);
  });
  it("rand impact is null without a diesel price", () => {
    const ins = analyse(rows, { ...DEFAULT_SETTINGS, diesel_price: null });
    expect(ins.find((i) => i.type === "IDLE_EXCESS")!.randImpact).toBeNull();
  });
  it("thresholds come from settings", () => {
    expect(
      analyse(rows, { ...DEFAULT_SETTINGS, idle_limit: 0.9 }).some((i) => i.type === "IDLE_EXCESS"),
    ).toBe(false);
  });
  it("estimator low < base < high and respects edits", () => {
    const e = estimate({
      trucks: 10,
      idleHoursPerDay: 2,
      burnLph: 8,
      dieselPrice: 30,
      days: 26,
      reductionPct: 20,
    });
    expect(e.base).toBeCloseTo(10 * 2 * 8 * 30 * 26 * 0.2);
    expect(e.low).toBeLessThan(e.base);
    expect(e.high).toBeGreaterThan(e.base);
  });
  it("summary is built from insights and says it is not a prediction", () => {
    const t = dailySummary("Acme Mining", rows, DEFAULT_SETTINGS);
    expect(t).toContain("TRK-");
    expect(t).toContain("not a prediction");
    expect(t).not.toMatch(/will fail/i);
    expect(t.length).toBeLessThan(900);
  });
});
describe("csv", () => {
  it("parses the template", () => {
    const p = parseCsv(TEMPLATE);
    expect("rows" in p && p.rows.length).toBe(2);
  });
  it("rejects bad rows and missing columns", () => {
    expect("error" in parseCsv("a,b\n1,2")).toBe(true);
    const p = parseCsv(
      "machine_id,date,engine_hours,idle_hours,litres\nX,2026-10-01,5,9,10\nY,bad,5,1,10\nZ,2026-10-01,5,1,10",
    );
    expect("rows" in p && p.rows.length).toBe(1);
    expect("skipped" in p && p.skipped.length).toBe(2);
  });
});
describe("messaging", () => {
  it("share link provider prefilled, official provider reports missing credentials", async () => {
    expect(
      (await new ShareLinkProvider().send({ to: "+27 82 000 0000", body: "hi there" })).id,
    ).toBe("https://wa.me/27820000000?text=hi%20there");
    expect((await new CloudApiProvider({}).send({ to: "1", body: "x" })).ok).toBe(false);
  });
});

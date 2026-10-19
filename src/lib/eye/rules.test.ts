import { describe, expect, it } from "vitest";
import { DEFAULTS, type FleetMachine } from "./fleet";
import { runRules } from "./rules";

describe("runRules weekly-equivalent estimates", () => {
  it("scales cost estimates from observed days to a seven-day equivalent", () => {
    const fleet: FleetMachine[] = [{
      id: "A1",
      site: "Site 1",
      type: "A40 hauler",
      days: [
        { engineH: 10, idleH: 5, litres: 100, tonnes: 100, faults: [] },
        { engineH: 10, idleH: 5, litres: 100, tonnes: 100, faults: [] },
      ],
    }];

    const idle = runRules(fleet, DEFAULTS).find((signal) => signal.rule === "idle");

    expect(idle?.leakR).toBeCloseTo(4312);
    expect(idle?.detail).toContain("2 observed day(s)");
    expect(idle?.detail).toContain("extrapolated");
  });

  it("keeps the existing weekly value unchanged for a full seven-day sample", () => {
    const fleet: FleetMachine[] = [{
      id: "A1",
      site: "Site 1",
      type: "A40 hauler",
      days: Array.from({ length: 7 }, () => ({
        engineH: 10, idleH: 5, litres: 100, tonnes: 100, faults: [],
      })),
    }];

    const idle = runRules(fleet, DEFAULTS).find((signal) => signal.rule === "idle");

    expect(idle?.leakR).toBeCloseTo(4312);
    expect(idle?.detail).toContain("Cost estimate uses 7 observed days");
  });
});

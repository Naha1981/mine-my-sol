import { describe, expect, it } from "vitest";
import { parseFleetCsv, TEMPLATE } from "./csv";

const header = "machine_id,site,type,date,engine_hours,idle_hours,litres,tonnes,fault_code,lat,lon";
const row = (id: string, date: string, site = "Site 1", type = "Hauler", extra = "") =>
  `${id},${site},${type},${date},10,2,100,50,${extra},-26.2,28.0`;

describe("parseFleetCsv", () => {
  it("parses the bundled template", () => {
    const parsed = parseFleetCsv(TEMPLATE);
    expect(parsed.rows).toBe(2);
    expect(parsed.fleet).toHaveLength(1);
    expect(parsed.fleet[0]?.days).toHaveLength(2);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings.join(" ")).toContain("2026-10-12 to 2026-10-13");
    expect(parsed.warnings.join(" ")).toContain("2 distinct date(s)");
  });

  it("uses only the latest seven-calendar-day window in the file", () => {
    const parsed = parseFleetCsv([
      header,
      row("A1", "2026-10-01"),
      row("A1", "2026-10-02"),
      row("A1", "2026-10-08"),
    ].join("\n"));

    expect(parsed.rows).toBe(2);
    expect(parsed.fleet[0]?.days).toHaveLength(2);
    expect(parsed.warnings.join(" ")).toContain("2026-10-02 to 2026-10-08");
    expect(parsed.warnings.join(" ")).toContain("Skipped 1 older row");
  });

  it("rejects impossible or non-ISO dates instead of treating them as current data", () => {
    const parsed = parseFleetCsv([
      header,
      row("A1", "2026-02-30"),
      row("A2", "10/13/2026"),
    ].join("\n"));

    expect(parsed.rows).toBe(0);
    expect(parsed.fleet).toHaveLength(0);
    expect(parsed.errors.join(" ")).toContain("real YYYY-MM-DD date");
  });

  it("rejects blank required measurements instead of silently converting them to zero", () => {
    const parsed = parseFleetCsv([
      header,
      "A1,Site 1,Hauler,2026-10-13,,2,100,50,,,-",
    ].join("\n"));

    expect(parsed.rows).toBe(0);
    expect(parsed.errors.join(" ")).toContain("missing engine_hours");
  });

  it("skips conflicting site or type records for the same machine", () => {
    const parsed = parseFleetCsv([
      header,
      row("A1", "2026-10-13", "Site 1", "Hauler"),
      row("A1", "2026-10-13", "Site 2", "Hauler"),
    ].join("\n"));

    expect(parsed.rows).toBe(1);
    expect(parsed.fleet).toHaveLength(1);
    expect(parsed.errors.join(" ")).toContain("conflicting site or type");
  });

  it("skips duplicate machine/date records to avoid double-counting daily totals", () => {
    const parsed = parseFleetCsv([
      header,
      row("A1", "2026-10-13"),
      row("A1", "2026-10-13"),
    ].join("\n"));

    expect(parsed.rows).toBe(1);
    expect(parsed.fleet[0]?.days).toHaveLength(1);
    expect(parsed.errors.join(" ")).toContain("duplicate record for machine A1");
  });

  it("refuses oversized CSVs instead of silently processing only the first 20,000 rows", () => {
    const oversized = [header, ...Array.from({ length: 20_001 }, (_, i) => row(`A${i}`, "2026-10-13"))].join("\n");
    const parsed = parseFleetCsv(oversized);

    expect(parsed.rows).toBe(0);
    expect(parsed.fleet).toHaveLength(0);
    expect(parsed.errors.join(" ")).toContain("no data was imported");
  });
});

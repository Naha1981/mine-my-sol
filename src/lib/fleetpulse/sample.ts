import type { FpRow } from "./engine";
/** Deterministic sample fleet (same seed, same data). Rows are flagged is_sample so a company can remove them. */
export function sampleRows(endDay: string, seed = 20261018): FpRow[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const fleet: [string, string, string][] = [];
  for (let i = 1; i <= 18; i++)
    fleet.push([
      `TRK-${String(i).padStart(2, "0")}`,
      `Pit ${"ABC"[(i - 1) % 3]}`,
      "Articulated hauler",
    ]);
  for (let i = 1; i <= 4; i++)
    fleet.push([`EXC-${String(i).padStart(2, "0")}`, `Pit ${"ABC"[(i - 1) % 3]}`, "Excavator 75t"]);
  for (let i = 5; i <= 6; i++)
    fleet.push([`EXC-${String(i).padStart(2, "0")}`, `Pit ${"AB"[i % 2]}`, "Excavator 95t"]);
  const burn: Record<string, number> = {
    "Articulated hauler": 28,
    "Excavator 75t": 62,
    "Excavator 95t": 80,
  };
  const idleBias: Record<string, number> = { "TRK-03": 0.45, "TRK-08": 0.4, "TRK-14": 0.42 };
  const out: FpRow[] = [];
  for (const [id, site, type] of fleet)
    for (let d = 29; d >= 0; d--) {
      const day = new Date(endDay + "T00:00:00Z");
      day.setUTCDate(day.getUTCDate() - d);
      const ds = day.toISOString().slice(0, 10);
      const eng = type === "Articulated hauler" ? 14 + rnd() * 4 : 15 + rnd() * 4;
      const idleShare = (idleBias[id] ?? 0.14) + (rnd() - 0.5) * 0.06;
      const idle = +(eng * idleShare).toFixed(2);
      let lph = burn[type]! * (0.96 + rnd() * 0.08);
      if (id === "EXC-02" && d < 10) lph *= 1 + (10 - d) * 0.035;
      let code: string | null = null,
        sev: FpRow["fault_severity"] = null;
      if (id === "TRK-11" && [1, 3, 5].includes(d)) {
        code = "P0087 low rail pressure";
        sev = "warn";
      }
      if (id === "TRK-16" && [0, 2, 4].includes(d)) {
        code = "SPN110 coolant temp high";
        sev = "warn";
      }
      if (id === "EXC-04" && d === 1) {
        code = "HYD-ST1 hydraulic pressure loss";
        sev = "stop";
      }
      out.push({
        machine_id: id,
        site,
        machine_type: type,
        day: ds,
        engine_h: +eng.toFixed(2),
        idle_h: idle,
        litres: +(eng * lph).toFixed(1),
        fault_code: code,
        fault_severity: sev,
        is_sample: true,
      });
    }
  return out;
}

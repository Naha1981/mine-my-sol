import {
  analyse,
  latestDay,
  lastWeek,
  rand,
  totalImpact,
  type FpRow,
  type FpSettings,
} from "./engine";

/** Fixed-template daily summary. Built only from computed insights. One WhatsApp screen. */
export function dailySummary(company: string, rows: FpRow[], s: FpSettings): string {
  const end = latestDay(rows);
  const wk = lastWeek(rows);
  if (!end) return `FleetPulse - ${company}\nNo fleet data loaded yet.`;
  const ins = analyse(rows, s);
  const machines = new Set(wk.map((r) => r.machine_id)).size;
  const sample = rows.some((r) => r.is_sample);
  const L: string[] = [
    `FleetPulse daily summary - ${company}`,
    `Data up to ${end}, last 7 days, ${machines} machines${sample ? " (includes sample data)" : ""}`,
    "",
  ];
  if (!ins.length) L.push("No signals raised this week.");
  else {
    const g = (t: string) => ins.filter((i) => i.type === t);
    const idle = g("IDLE_EXCESS"),
      fuel = g("FUEL_RATE_OUTLIER"),
      fault = g("FAULT_REPEAT");
    if (idle.length)
      L.push(
        `Idle: ${idle.length} machine${idle.length > 1 ? "s" : ""} above limit. Worst ${idle[0]!.machine} (${idle[0]!.evidence["idle_share_pct"]}%).`,
      );
    if (fuel.length)
      L.push(
        `Fuel: ${fuel.length} above peers. Worst ${fuel[0]!.machine} (${fuel[0]!.evidence["litres_per_engine_hour"]} L/h vs ${fuel[0]!.evidence["peer_median"]}).`,
      );
    if (fault.length)
      L.push(
        `Faults: ${fault.length} to check. ${fault
          .slice(0, 2)
          .map((f) => f.headline)
          .join("; ")}.`,
      );
    if (s.diesel_price != null)
      L.push(
        "",
        `Estimated fuel cost of these signals: ${rand(totalImpact(ins))} a week at R${s.diesel_price}/L.`,
      );
  }
  L.push("", "Estimates from your data and settings. Risk ranking, not a prediction.");
  return L.join("\n");
}

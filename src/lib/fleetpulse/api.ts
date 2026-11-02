import { db, type Row } from "@/lib/db";
import { DEFAULT_SETTINGS, type FpRow, type FpSettings } from "./engine";

export async function loadMine(): Promise<{
  orgId: string;
  company: string;
  rows: FpRow[];
  settings: FpSettings;
}> {
  const { data: org, error: e0 } = await db.rpc("fp_org");
  if (e0) throw e0;
  if (!org) throw new Error("No company on this account");
  const [o, s] = await Promise.all([
    db.from("organizations").select("name").eq("id", org).maybeSingle(),
    db.from("fp_settings").select("*").eq("org_id", org).maybeSingle(),
  ]);
  const rows: FpRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db
      .from("fp_daily")
      .select(
        "machine_id,site,machine_type,day,engine_h,idle_h,litres,fault_code,fault_severity,is_sample",
      )
      .eq("org_id", org)
      .order("day", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]).map(norm));
    if (!data || data.length < 1000) break;
  }
  return {
    orgId: org as string,
    company: (o.data?.name as string) ?? "Your company",
    rows,
    settings: s.data ? ({ ...(s.data as Row) } as unknown as FpSettings) : { ...DEFAULT_SETTINGS },
  };
}
export const norm = (r: Row): FpRow =>
  ({
    ...r,
    engine_h: Number(r["engine_h"]),
    idle_h: Number(r["idle_h"]),
    litres: Number(r["litres"]),
  }) as FpRow;

export async function insertRows(orgId: string, rows: Omit<FpRow, "is_sample">[], sample: boolean) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("fp_daily")
      .insert(rows.slice(i, i + 500).map((r) => ({ ...r, org_id: orgId, is_sample: sample })));
    if (error) throw error;
  }
}
export async function clearRows(orgId: string, which: "sample" | "mine" | "all") {
  let q = db.from("fp_daily").delete().eq("org_id", orgId);
  if (which === "sample") q = q.eq("is_sample", true);
  else if (which === "mine") q = q.eq("is_sample", false);
  const { error } = await q;
  if (error) throw error;
}
export async function saveSettings(orgId: string, s: FpSettings) {
  const { error } = await db.from("fp_settings").upsert({
    org_id: orgId,
    diesel_price: s.diesel_price,
    diesel_source: s.diesel_source ?? null,
    diesel_verified: !!s.diesel_verified,
    idle_limit: s.idle_limit,
    fuel_sd: s.fuel_sd,
    fault_repeat: s.fault_repeat,
    baseline_idle_share: s.baseline_idle_share,
    idle_burn_lph: s.idle_burn_lph,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

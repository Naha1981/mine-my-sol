import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Loading, PageHeader, errMsg } from "@/components/app/ui-bits";

export const Route = createFileRoute("/_authenticated/portal/profile")({ component: Profile });

const TEXT = ["registration_no", "tax_no", "vat_no", "csd_no", "bbbee_level", "cidb_grade", "contact_name", "contact_phone", "contact_email", "address", "description"] as const;

function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["profile", me.org?.id],
    enabled: !!me.org,
    queryFn: async () => {
      const { data, error } = await db.from("contractor_profiles").select("*").eq("organization_id", me.org!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.isSuccess) {
      const d = q.data ?? {};
      setF({ ...Object.fromEntries(TEXT.map((k) => [k, d[k] ?? ""])), trades: (d.trades ?? []).join(", "), regions: (d.regions ?? []).join(", "), employees: d.employees?.toString() ?? "", years_operating: d.years_operating?.toString() ?? "" });
    }
  }, [q.isSuccess, q.data]);
  if (!me.org) return <EmptyState title="No company is linked to your account" />;
  if (q.isLoading) return <Loading />;
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  async function save() {
    const emp = f["employees"] ? Number(f["employees"]) : null;
    const yrs = f["years_operating"] ? Number(f["years_operating"]) : null;
    if ((emp !== null && (!Number.isInteger(emp) || emp < 0)) || (yrs !== null && (!Number.isInteger(yrs) || yrs < 0))) return toast.error("Employees and years operating must be whole numbers");
    if (f["contact_email"] && !/^\S+@\S+\.\S+$/.test(f["contact_email"])) return toast.error("Enter a valid contact email");
    setBusy(true);
    const row = { organization_id: me.org!.id, ...Object.fromEntries(TEXT.map((k) => [k, f[k]?.trim() || null])), trades: list(f["trades"] ?? ""), regions: list(f["regions"] ?? ""), employees: emp, years_operating: yrs, updated_at: new Date().toISOString() };
    const { error } = q.data ? await db.from("contractor_profiles").update(row).eq("organization_id", me.org!.id) : await db.from("contractor_profiles").insert(row);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  const T = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><Input value={f[k] ?? ""} onChange={set(k)} /></Field>;
  return (
    <>
      <PageHeader title="Company profile" description={`${me.org.name}. This information is shared with MySol and frozen into each application you submit.`} />
      <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {T("registration_no", "Company registration number")}{T("tax_no", "Tax reference number")}{T("vat_no", "VAT number")}{T("csd_no", "CSD supplier number")}
          {T("cidb_grade", "CIDB grading", "e.g. 6CE")}{T("bbbee_level", "B-BBEE level", "e.g. Level 2")}
          {T("contact_name", "Contact person")}{T("contact_phone", "Contact phone")}{T("contact_email", "Contact email")}
          <Field label="Employees"><Input inputMode="numeric" value={f["employees"] ?? ""} onChange={set("employees")} /></Field>
          <Field label="Years operating"><Input inputMode="numeric" value={f["years_operating"] ?? ""} onChange={set("years_operating")} /></Field>
        </div>
        {T("trades", "Trades and services", "Separate with commas")}
        {T("regions", "Regions you operate in", "Separate with commas")}
        {T("address", "Business address")}
        <Field label="About the company"><Textarea rows={4} value={f["description"] ?? ""} onChange={set("description")} /></Field>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      </div>
    </>
  );
}

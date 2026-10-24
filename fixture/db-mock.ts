// Mock for @/lib/db used only by fixture bundles.
const state = () => (new URLSearchParams(location.search).get("state") ?? (window as any).__fixtureState ?? "form");
export const db = {
  rpc: async (name: string, args: any) => {
    (window as any).__rpcCalls = [...((window as any).__rpcCalls ?? []), { name, args }];
    if (state() === "error") return { data: null, error: new Error("Invalid or expired invitation code") };
    return { data: { buyer_org_name: "NahaLabs QA TestCo" }, error: null };
  },
  from: (table: string) => {
    const rows = table === "projects" ? []
      : table === "applications" ? [{ id: "a1", status: "awarded", updated_at: "2026-10-24T09:00:00Z", projects: { title: "QA Journey Test 24 Oct - Conveyor belt splicing" } }]
      : [];
    const q: any = new Promise((res) => res({ data: rows, error: null }));
    q.select = () => q; q.eq = () => q; q.order = () => q; q.limit = () => q;
    return q;
  },
};
export const supabase = db;
export const useMe = () => ({ fullName: "QA Contractor", org: { name: "QA Contracting Pty Ltd", status: "active" } });
export const myDocsQuery = { queryKey: ["fixture-docs"], queryFn: async () => [] };

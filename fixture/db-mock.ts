// Mock for @/lib/db used only by the fixture bundle.
export const db = {
  rpc: async (name: string, args: any) => {
    (window as any).__rpcCalls = [...((window as any).__rpcCalls ?? []), { name, args }];
    if ((new URLSearchParams(location.search).get("state") ?? (window).__fixtureState) === "error") return { data: null, error: new Error("Invalid or expired invitation code") };
    return { data: { buyer_org_name: "NahaLabs QA TestCo" }, error: null };
  },
  from: () => { throw new Error("fixture: db.from not expected"); },
};
export const supabase = db;

export const useMe = () => ({ fullName: "QA Contractor", org: { name: "QA Contracting Pty Ltd", status: "active" } });
export const myDocsQuery = { queryKey: ["fixture-docs"], queryFn: async () => [] };

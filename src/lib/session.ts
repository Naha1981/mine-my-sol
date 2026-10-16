import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Me = {
  userId: string;
  email: string;
  fullName: string | null;
  isAdmin: boolean;
  org: { id: string; name: string; kind: "buyer" | "contractor"; status: "active" | "suspended" } | null;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const [roles, mems, profile] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("memberships").select("organizations(id,name,kind,status)").eq("user_id", user.id).limit(1),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    const org = (mems.data?.[0]?.organizations as Me["org"]) ?? null;
    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: profile.data?.full_name ?? null,
      isAdmin: !!roles.data?.some((r) => r.role === "admin"),
      org,
    };
  },
  staleTime: 60_000,
});

export function useMe() {
  const { data } = useSuspenseQuery(meQuery);
  if (!data) throw new Error("Not signed in");
  return data;
}

/** Contractor org id for the signed-in contractor (throws if missing). */
export function useOrgId() {
  const me = useMe();
  if (!me.org) throw new Error("No organisation");
  return me.org.id;
}

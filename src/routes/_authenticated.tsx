import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meQuery } from "@/lib/session";
import { Loading } from "@/components/app/ui-bits";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/auth", search: { mode: "signin" } });
    return { me };
  },
  pendingComponent: () => <Loading />,
  component: Outlet,
});

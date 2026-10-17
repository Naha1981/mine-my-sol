import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Briefcase, FileText, FolderKanban, LayoutDashboard, Send, UserRound } from "lucide-react";
import { AppShell, type NavItem } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/portal")({
  beforeLoad: ({ context }) => {
    if (context.me.isAdmin) throw redirect({ to: "/admin" });
  },
  component: PortalLayout,
});

const nav: NavItem[] = [
  { to: "/portal", label: "Home", icon: LayoutDashboard, exact: true, mobile: true },
  { to: "/portal/projects", label: "Projects", icon: FolderKanban, mobile: true },
  { to: "/portal/vault", label: "Vault", icon: FileText, mobile: true },
  { to: "/portal/applications", label: "Applications", icon: Send, mobile: true },
  { to: "/portal/tenderready", label: "TenderReady", icon: Briefcase, mobile: false },
  { to: "/portal/profile", label: "Company profile", icon: UserRound },
];

function PortalLayout() {
  const qc = useQueryClient();
  useEffect(() => {
    // Idempotent: creates one reminder per document version that is expired or expires within 30 days.
    void db.rpc("refresh_my_expiry_reminders").then(({ data }) => { if (data) void qc.invalidateQueries({ queryKey: ["notifications"] }); });
  }, [qc]);
  return <AppShell nav={nav} area="Contractor portal" notificationsTo="/portal/notifications"><Outlet /></AppShell>;
}

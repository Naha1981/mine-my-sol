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
  { to: "/portal/profile", label: "Company profile", icon: UserRound },
];
void Briefcase;

function PortalLayout() {
  return <AppShell nav={nav} area="Contractor portal" notificationsTo="/portal/notifications"><Outlet /></AppShell>;
}

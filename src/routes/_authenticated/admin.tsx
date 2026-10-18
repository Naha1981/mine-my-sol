import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Building2, ClipboardList, FolderKanban, History, Eye, LayoutDashboard, Users } from "lucide-react";
import { AppShell, type NavItem } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.me.isAdmin) throw redirect({ to: "/portal" });
  },
  component: AdminLayout,
});

const nav: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true, mobile: true },
  { to: "/admin/eye", label: "Operations Eye", icon: Eye, mobile: true },
  { to: "/admin/projects", label: "Projects", icon: FolderKanban, mobile: true },
  { to: "/admin/applications", label: "Applications", icon: ClipboardList, mobile: true },
  { to: "/admin/contractors", label: "Contractors", icon: Users, mobile: true },
  { to: "/admin/audit", label: "Audit log", icon: History },
];
void Building2;

function AdminLayout() {
  return <AppShell nav={nav} area="MySol administration" notificationsTo="/admin/notifications"><Outlet /></AppShell>;
}

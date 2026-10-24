import { useState, type ReactNode } from "react";
import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMe } from "@/lib/session";
import { useNotificationUpdates } from "@/lib/notification-updates";
import { cn } from "@/lib/utils";

export type NavItem = { to: LinkProps["to"]; label: string; icon: LucideIcon; exact?: boolean; mobile?: boolean };

export function Brand({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-display text-xl font-extrabold italic tracking-tight">
      {light ? <img src="/icon-192.png" alt="" className="size-8 rounded-md" /> : <img src="/mark.png" alt="" className="h-8 w-auto" />}
      <span className={light ? "text-white" : "text-primary"}>Mine<span className="text-gold">MySol</span></span>
    </span>
  );
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

export function AppShell({ nav, children, notificationsTo, area }: { nav: NavItem[]; children: ReactNode; notificationsTo: LinkProps["to"]; area: string }) {
  const me = useMe();
  useNotificationUpdates(me.userId);
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  const navLinks = (onClick?: () => void) =>
    nav.map((item) => (
      <Link
        key={item.label}
        to={item.to}
        onClick={onClick}
        activeOptions={{ exact: item.exact }}
        className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
      >
        <item.icon className="size-4" />
        {item.label}
      </Link>
    ));

  const mobileItems = nav.filter((n) => n.mobile).slice(0, 4);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
        <div className="px-5 py-5"><Brand light /></div>
        <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">{area}</p>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">{navLinks()}</nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{me.fullName || me.email}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">{me.org?.name}</p>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur lg:ml-64 lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-muted">
            <Menu className="size-5" />
          </button>
          <Brand />
        </div>
        <p className="hidden text-sm text-muted-foreground lg:block">{me.org?.name}</p>
        <Link to={notificationsTo} aria-label="Notifications" className="relative rounded-md p-2 hover:bg-muted">
          <Bell className="size-5" />
          {!!unread.data && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-foreground">
              {unread.data > 9 ? "9+" : unread.data}
            </span>
          )}
        </Link>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="px-5 py-5"><SheetTitle><Brand light /></SheetTitle></SheetHeader>
          <nav className="space-y-1 px-3">{navLinks(() => setOpen(false))}</nav>
          <div className="mt-6 border-t border-sidebar-border p-4">
            <p className="truncate text-sm text-sidebar-foreground">{me.fullName || me.email}</p>
            <button onClick={signOut} className="mt-2 flex items-center gap-2 text-sm text-sidebar-foreground/80">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="px-4 pb-28 pt-6 lg:ml-64 lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobileItems.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

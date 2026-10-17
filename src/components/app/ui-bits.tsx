import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileQuestion, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ExpiryState, ItemStatus } from "@/lib/readiness";

type Tone = "green" | "gold" | "red" | "muted" | "blue";
const toneClass: Record<Tone, string> = {
  green: "bg-primary/10 text-primary border-primary/20",
  gold: "bg-gold/20 text-gold-foreground border-gold/40",
  red: "bg-destructive/10 text-destructive border-destructive/25",
  muted: "bg-muted text-muted-foreground border-border",
  blue: "bg-secondary text-secondary-foreground border-border",
};

export function Pill({ tone = "muted", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone])}>
      {icon}
      {children}
    </span>
  );
}

const statusTone: Record<string, Tone> = {
  draft: "muted", open: "green", closed: "muted", awarded: "gold", cancelled: "red",
  submitted: "blue", under_review: "blue", shortlisted: "gold", unsuccessful: "muted", withdrawn: "muted",
  active: "green", suspended: "red", pending: "gold", accepted: "green", revoked: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  return <Pill tone={statusTone[status] ?? "muted"}>{humanize(status)}</Pill>;
}

export function ClosingBadge({ closesAt, status }: { closesAt: string | null; status: string }) {
  if (status !== "open" || !closesAt) return null;
  const days = (new Date(closesAt).getTime() - Date.now()) / 86400000;
  if (days < 0) return <Pill tone="red" icon={<Clock className="size-3" />}>Deadline passed</Pill>;
  if (days <= 7) return <Pill tone="gold" icon={<Clock className="size-3" />}>Closing soon</Pill>;
  return null;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  if (status === "complete") return <Pill tone="green" icon={<CheckCircle2 className="size-3" />}>Complete</Pill>;
  if (status === "expiring") return <Pill tone="gold" icon={<AlertTriangle className="size-3" />}>Expiring soon</Pill>;
  if (status === "expired") return <Pill tone="red" icon={<XCircle className="size-3" />}>Expired</Pill>;
  return <Pill tone="red" icon={<FileQuestion className="size-3" />}>Missing</Pill>;
}

export function ExpiryBadge({ state }: { state: ExpiryState }) {
  if (state === "expired") return <Pill tone="red" icon={<XCircle className="size-3" />}>Expired</Pill>;
  if (state === "expiring") return <Pill tone="gold" icon={<AlertTriangle className="size-3" />}>Expiring soon</Pill>;
  if (state === "valid") return <Pill tone="green" icon={<CheckCircle2 className="size-3" />}>Valid</Pill>;
  return <Pill tone="muted">No expiry date</Pill>;
}

export function VerificationBadge({ v }: { v: string }) {
  if (v === "verified") return <Pill tone="green" icon={<ShieldCheck className="size-3" />}>Verified by MySol</Pill>;
  if (v === "rejected") return <Pill tone="red">Rejected by MySol</Pill>;
  return <Pill tone="muted">Not yet verified</Pill>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="font-display font-semibold text-foreground">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "gold" | "red" }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone === "gold" && "border-gold/50", tone === "red" && "border-destructive/40")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string | undefined; error?: string | undefined }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}

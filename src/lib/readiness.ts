import { EXPIRY_WARNING_DAYS } from "./constants";

export type ReqLike = { id: string; category: string; label: string; mandatory: boolean };
export type DocLike = {
  id: string;
  category: string;
  title: string;
  expires_at: string | null;
  current_version: number;
  verification: string;
};
export type ExpiryState = "valid" | "expiring" | "expired" | "no_expiry";
export type ItemStatus = "complete" | "expiring" | "expired" | "missing";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Days until expiry (negative when expired). Dates are compared as calendar days. */
export function daysUntil(expires: string, today: Date = new Date()) {
  const [y, m, d] = expires.slice(0, 10).split("-").map(Number);
  const exp = new Date(y, m - 1, d);
  return Math.round((exp.getTime() - startOfDay(today).getTime()) / 86400000);
}

export function expiryState(expires: string | null, today: Date = new Date()): ExpiryState {
  if (!expires) return "no_expiry";
  const days = daysUntil(expires, today);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "expiring";
  return "valid";
}

export type ReadinessItem = {
  requirement: ReqLike;
  document: DocLike | null;
  status: ItemStatus;
  verified: boolean;
};

export type Readiness = {
  items: ReadinessItem[];
  ready: boolean;
  counts: Record<ItemStatus, number>;
  blocking: ReadinessItem[];
};

/**
 * Evaluates a configured checklist against the vault.
 * - attachments given: only the attached document counts (application mode)
 * - otherwise: best uploaded vault document in the same category counts
 * "complete" means complete against the checklist, NOT verified by MySol.
 */
export function evaluateReadiness(
  requirements: ReqLike[],
  documents: DocLike[],
  opts: { today?: Date; attachments?: Record<string, string> } = {},
): Readiness {
  const today = opts.today ?? new Date();
  const uploaded = documents.filter((d) => d.current_version > 0);
  const items = requirements.map<ReadinessItem>((req) => {
    let doc: DocLike | null = null;
    if (opts.attachments) {
      const id = opts.attachments[req.id];
      doc = id ? (uploaded.find((d) => d.id === id) ?? null) : null;
    } else {
      const candidates = uploaded
        .filter((d) => d.category === req.category)
        .sort((a, b) => rank(b, today) - rank(a, today));
      doc = candidates[0] ?? null;
    }
    let status: ItemStatus = "missing";
    if (doc) {
      const e = expiryState(doc.expires_at, today);
      status = e === "expired" ? "expired" : e === "expiring" ? "expiring" : "complete";
    }
    return { requirement: req, document: doc, status, verified: doc?.verification === "verified" };
  });
  const counts: Record<ItemStatus, number> = { complete: 0, expiring: 0, expired: 0, missing: 0 };
  items.forEach((i) => counts[i.status]++);
  const blocking = items.filter(
    (i) => i.requirement.mandatory && (i.status === "missing" || i.status === "expired"),
  );
  return { items, counts, blocking, ready: blocking.length === 0 };
}

function rank(d: DocLike, today: Date) {
  if (!d.expires_at) return 1e6;
  return daysUntil(d.expires_at, today);
}

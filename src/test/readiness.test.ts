import { describe, expect, it } from "vitest";
import { evaluateReadiness, expiryState } from "@/lib/readiness";

const today = new Date(2026, 9, 16); // 16 Oct 2026
const req = (id: string, category: string, mandatory = true) => ({ id, category, label: id, mandatory });
const doc = (id: string, category: string, expires_at: string | null, current_version = 1) => ({
  id, category, title: id, expires_at, current_version, verification: "unverified",
});

describe("expiry rules", () => {
  it("marks a past date as expired", () => {
    expect(expiryState("2026-10-15", today)).toBe("expired");
  });
  it("marks a date within 30 days as expiring", () => {
    expect(expiryState("2026-11-15", today)).toBe("expiring");
  });
  it("marks a date 31+ days away as valid", () => {
    expect(expiryState("2026-11-16", today)).toBe("valid");
  });
  it("expiry today is still valid (expiring)", () => {
    expect(expiryState("2026-10-16", today)).toBe("expiring");
  });
});

describe("readiness", () => {
  it("flags missing, expired and expiring documents", () => {
    const r = evaluateReadiness(
      [req("tax", "tax_compliance"), req("bee", "bbbee"), req("ins", "insurance")],
      [doc("t", "tax_compliance", "2026-10-01"), doc("i", "insurance", "2026-10-30")],
      { today },
    );
    expect(r.items.map((i) => i.status)).toEqual(["expired", "missing", "expiring"]);
    expect(r.ready).toBe(false);
  });

  it("is not ready while a mandatory item is incomplete", () => {
    const r = evaluateReadiness([req("a", "csd")], [], { today });
    expect(r.ready).toBe(false);
    expect(r.blocking).toHaveLength(1);
  });

  it("optional items do not block readiness", () => {
    const r = evaluateReadiness([req("a", "csd", false)], [], { today });
    expect(r.ready).toBe(true);
  });

  it("only counts requirements configured for the tender", () => {
    const r = evaluateReadiness([req("a", "csd")], [doc("c", "csd", null)], { today });
    expect(r.items).toHaveLength(1);
    expect(r.ready).toBe(true);
  });

  it("ignores documents with no uploaded file", () => {
    const r = evaluateReadiness([req("a", "csd")], [doc("c", "csd", null, 0)], { today });
    expect(r.items[0].status).toBe("missing");
  });

  it("in application mode only attached documents count", () => {
    const docs = [doc("c", "csd", null)];
    expect(evaluateReadiness([req("a", "csd")], docs, { today, attachments: {} }).ready).toBe(false);
    expect(evaluateReadiness([req("a", "csd")], docs, { today, attachments: { a: "c" } }).ready).toBe(true);
  });

  it("complete is not the same as verified", () => {
    const r = evaluateReadiness([req("a", "csd")], [doc("c", "csd", null)], { today });
    expect(r.items[0].status).toBe("complete");
    expect(r.items[0].verified).toBe(false);
  });
});

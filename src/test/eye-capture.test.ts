import { describe, expect, it } from "vitest";
import { pinDrawOps } from "@/lib/eye/capture";

const pin = (over: Partial<Parameters<typeof pinDrawOps>[0][0]> = {}) => ({
  label: "2h", bg: "#b45309", fg: "#fff", cx: 100, cy: 50, w: 30, h: 19, visible: true, ...over,
});

describe("pinDrawOps", () => {
  it("centers the pill on the rendered position, scaled to canvas px", () => {
    const [op] = pinDrawOps([pin()], 2, 2, 800, 600);
    expect(op!.cx).toBe(200); expect(op!.cy).toBe(100);
    expect(op!.w).toBe(60); expect(op!.h).toBe(38);
    expect(op!.x).toBe(170); expect(op!.y).toBe(81);
    expect(op!.bg).toBe("#b45309");
  });
  it("drops hidden pins and empty labels", () => {
    const ops = pinDrawOps([pin({ visible: false }), pin({ label: "" }), pin({ label: "EX-03" })], 1, 1, 800, 600);
    expect(ops.map((o) => o.label)).toEqual(["EX-03"]);
  });
  it("keeps partially clipped pins but drops fully off-canvas ones", () => {
    const ops = pinDrawOps([
      pin({ label: "edge", cx: -5, cy: 50, w: 30 }),   // partially off left
      pin({ label: "gone-left", cx: -40, cy: 50, w: 30 }),
      pin({ label: "gone-below", cx: 100, cy: 700, h: 19 }),
      pin({ label: "ok", cx: 400, cy: 300 }),
    ], 1, 1, 800, 600);
    expect(ops.map((o) => o.label)).toEqual(["edge", "ok"]);
  });
  it("applies device-pixel scaling", () => {
    const [a] = pinDrawOps([pin()], 1, 1, 800, 600);
    const [b] = pinDrawOps([pin()], 3, 3, 2400, 1800);
    expect(b!.w / a!.w).toBeCloseTo(3);
    expect(b!.cx / a!.cx).toBeCloseTo(3);
  });
});

// Compositing support for sealing an Eye map view: the map canvas alone does not
// contain the DOM pin overlays (delays, DISPUTED, clips, machines) or the basemap
// attribution control, so a sealed snapshot must draw them on top. Positions and
// sizes come from the pins' real rendered rects, so the composite matches the
// screen exactly, including replay visibility and edge clipping. pinDrawOps is
// the pure, unit-tested part.
import type { Map as MapLibreMap } from "maplibre-gl";

// Single source for the pin styling (also injected by the Eye component).
export const EYE_PIN_CSS = `.eye-pin{font:600 11px/1 "Hind",system-ui;padding:4px 7px;border-radius:6px;color:#fff;white-space:nowrap;box-shadow:0 1px 4px #0008}
.eye-delay{background:#b45309}.eye-ev{background:#1d4ed8}.eye-m{background:#14532d}.eye-idle{background:#a16207}.eye-down{background:#991b1b}
.eye-disp{background:#b91c1c;letter-spacing:.06em;animation:eyep 1.4s infinite}@keyframes eyep{50%{box-shadow:0 0 0 8px #b91c1c33}}`;

export type PinInput = {
  label: string;
  bg: string;
  fg: string;
  cx: number; // pill center, CSS px relative to the map container
  cy: number;
  w: number; // rendered pill size, CSS px
  h: number;
  visible: boolean;
};
export type PinOp = { x: number; y: number; w: number; h: number; cx: number; cy: number; label: string; bg: string; fg: string };

// sx/sy scale CSS px to canvas px (device pixel ratio). Mirrors .eye-pin radius 6px.
// Pins fully outside the canvas are dropped; partially visible ones are kept and
// clipped by the canvas itself. cw/ch are the canvas pixel dimensions.
export function pinDrawOps(pins: PinInput[], sx: number, sy: number, cw: number, ch: number): PinOp[] {
  const out: PinOp[] = [];
  for (const p of pins) {
    if (!p.visible || !p.label) continue;
    const w = p.w * sx, h = p.h * sy, cx = p.cx * sx, cy = p.cy * sy;
    if (cx + w / 2 < 0 || cy + h / 2 < 0 || cx - w / 2 > cw || cy - h / 2 > ch) continue;
    out.push({ x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, label: p.label, bg: p.bg, fg: p.fg });
  }
  return out;
}

// Composite the current view: basemap canvas + every visible .eye-pin overlay +
// the basemap attribution, as a PNG data URL.
export function compositeSnapshot(m: MapLibreMap): string {
  const base = m.getCanvas();
  const cont = m.getContainer();
  const sx = base.width / cont.clientWidth, sy = base.height / cont.clientHeight;
  const out = document.createElement("canvas");
  out.width = base.width; out.height = base.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(base, 0, 0);

  const cr = cont.getBoundingClientRect();
  const pins: PinInput[] = [...cont.querySelectorAll<HTMLElement>(".maplibregl-marker.eye-pin")].map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      label: el.textContent ?? "",
      bg: cs.backgroundColor,
      fg: cs.color,
      cx: r.left - cr.left + r.width / 2,
      cy: r.top - cr.top + r.height / 2,
      w: r.width,
      h: r.height,
      visible: el.style.display !== "none" && el.style.opacity !== "0" && r.width > 0 && r.height > 0,
    };
  });
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const op of pinDrawOps(pins, sx, sy, out.width, out.height)) {
    ctx.font = `600 ${11 * sy}px Hind, system-ui, sans-serif`;
    ctx.fillStyle = op.bg;
    ctx.beginPath();
    ctx.roundRect(op.x, op.y, op.w, op.h, 6 * sx);
    ctx.fill();
    ctx.fillStyle = op.fg;
    ctx.fillText(op.label, op.cx, op.cy + 0.5 * sy);
  }

  // Basemap attribution is a DOM control too - seal it into the image.
  const attr = cont.querySelector(".maplibregl-ctrl-attrib")?.textContent?.trim();
  if (attr) {
    ctx.font = `${10 * sy}px system-ui, sans-serif`;
    const w = ctx.measureText(attr).width + 8 * sx;
    const h = 16 * sy;
    const x = out.width - w - 4 * sx, y = out.height - h - 4 * sy;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#333";
    ctx.textAlign = "left";
    ctx.fillText(attr, x + 4 * sx, y + h / 2 + 0.5 * sy);
  }
  return out.toDataURL("image/png");
}

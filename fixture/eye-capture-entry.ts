// Fixture: real maplibre map (same style options as the Eye component), real DOM
// markers using the shared EYE_PIN_CSS, then the REAL compositeSnapshot capture.
// Produces a composite <img> plus a JSON report comparing pin rects to draw ops.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SAMPLE_SITES } from "../src/lib/eye/sample";
import { EYE_PIN_CSS, compositeSnapshot, pinDrawOps, type PinInput } from "../src/lib/eye/capture";

const site = SAMPLE_SITES[0]!;
const styleEl = document.createElement("style");
styleEl.textContent = EYE_PIN_CSS;
document.head.appendChild(styleEl);
const el0 = document.getElementById("map")!;

const m = new maplibregl.Map({
  container: el0, center: site.center, zoom: 14.2, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: { compact: true },
  style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, attribution: "Imagery Esri, Maxar", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
});

const el = (cls: string, text = "") => { const d = document.createElement("div"); d.className = cls; d.textContent = text; return d; };
const report: Record<string, unknown> = { pins: [], hiddenSkipped: false, clippedKept: false, attribution: null };

m.on("load", () => { try { console.error("STAGE:load");
  // same geometry layers as the component (in-canvas; must pass through)
  m.addSource("pits", { type: "geojson", data: { type: "FeatureCollection", features: site.pits.map((p) => ({ type: "Feature" as const, properties: { n: p.name }, geometry: { type: "Polygon" as const, coordinates: [p.ring] } })) } });
  m.addLayer({ id: "pits", type: "fill", source: "pits", paint: { "fill-color": "#e6b800", "fill-opacity": 0.18 } });
  m.addSource("road", { type: "geojson", data: { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: site.road } } });
  m.addLayer({ id: "road", type: "line", source: "road", paint: { "line-color": "#ffffff", "line-width": 3, "line-dasharray": [2, 2] } });

  const b = new maplibregl.LngLatBounds();
  [...site.road, ...site.pits.flatMap((p) => p.ring), ...site.machines.map((x) => x.at), ...site.delays.map((d) => d.at)].forEach((c) => b.extend(c));
  m.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });

  // pins like the component: delay (orange), DISPUTED (red), clip (blue), machines
  new maplibregl.Marker({ element: el("eye-pin eye-delay", "2h"), offset: [0, -14] }).setLngLat(site.delays[0]!.at).addTo(m);
  new maplibregl.Marker({ element: el("eye-pin eye-disp", "DISPUTED"), offset: [0, -14] }).setLngLat(site.delays[1]!.at).addTo(m);
  new maplibregl.Marker({ element: el("eye-pin eye-ev", "Clip 03:30"), offset: [0, 14] }).setLngLat(site.evidence[1]!.at).addTo(m);
  for (const x of site.machines.slice(0, 3)) new maplibregl.Marker({ element: el(`eye-pin eye-m eye-${x.status}`, x.id) }).setLngLat(x.at).addTo(m);
  // replay-hidden pin (must NOT appear) and an off-edge pin (must clip, not crash)
  const hid = el("eye-pin eye-delay", "REPLAY-HIDDEN");
  new maplibregl.Marker({ element: hid }).setLngLat(site.machines[0]!.at).addTo(m);
  hid.style.display = "none";
  const c = m.getCenter();
  const topEdge = m.unproject([m.getContainer().clientWidth / 2, -8]);
  new maplibregl.Marker({ element: el("eye-pin eye-ev", "EDGE-CLIP"), offset: [0, 0] }).setLngLat([c.lng, topEdge.lat]).addTo(m);

  console.error("STAGE:markers-added", document.querySelectorAll(".maplibregl-marker").length);
  } catch (e) { console.error("FIXTURE-ERR-load", String(e && (e as Error).stack || e)); }
  let fxDone = false;
  const finish = () => { if (fxDone) return; fxDone = true; try { console.error("STAGE:finish");
    const cont = m.getContainer();
    const cr = cont.getBoundingClientRect();
    const base = m.getCanvas();
    const sx = base.width / cont.clientWidth, sy = base.height / cont.clientHeight;
    const pinEls = [...cont.querySelectorAll<HTMLElement>(".maplibregl-marker.eye-pin")];
    const pins: PinInput[] = pinEls.map((e) => {
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      return { label: e.textContent ?? "", bg: cs.backgroundColor, fg: cs.color, cx: r.left - cr.left + r.width / 2, cy: r.top - cr.top + r.height / 2, w: r.width, h: r.height, visible: e.style.display !== "none" && r.width > 0 };
    });
    const ops = pinDrawOps(pins, sx, sy, base.width, base.height);
    report.dpr = sx;
    report.domPins = pinEls.length;
    report.visiblePins = pins.filter((p) => p.visible).length;
    report.ops = ops.length;
    report.hiddenSkipped = !ops.some((o) => o.label === "REPLAY-HIDDEN");
    report.clippedKept = ops.some((o) => o.label === "EDGE-CLIP");
    // every op must sit at its pin's scaled center
    const bad = ops.filter((o) => {
      const p = pins.find((x) => x.label === o.label)!;
      return Math.abs(o.cx - p.cx * sx) > 2 || Math.abs(o.cy - p.cy * sy) > 2;
    });
    report.mispositioned = bad.map((o) => o.label);
    report.attribution = cont.querySelector(".maplibregl-ctrl-attrib")?.textContent?.trim() ?? null;

    const img = compositeSnapshot(m);
    (window as unknown as { __img: string }).__img = img;
    const im = document.createElement("img");
    im.src = img; im.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#222";
    document.body.appendChild(im);
    const pre = document.createElement("pre");
    pre.id = "report"; pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
    document.title = "FIXTURE-DONE"; console.error("STAGE:done");
  } catch (e) { console.error("FIXTURE-ERR-idle", String(e && (e as Error).stack || e)); } };
  m.on("idle", finish);
  setTimeout(finish, 9000);
});

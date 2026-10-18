import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Mic, Send, Volume2 } from "lucide-react";
import { SAMPLE_SITES, type Site } from "@/lib/eye/sample";
import { answer, causes, pct, risk } from "@/lib/eye/engine";


const chip = (c: string) => c === "confirmed" ? "bg-emerald-100 text-emerald-900" : c === "inferred" ? "bg-amber-100 text-amber-900" : "bg-stone-200 text-stone-800";

function el(cls: string, text = "") { const d = document.createElement("div"); d.className = cls; d.textContent = text; return d; }

export function EyeView() {
  const sites = SAMPLE_SITES;
  const [site, setSite] = useState<Site>(sites[0]!);
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  const [q, setQ] = useState("");
  const [listening, setListening] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cs = useMemo(() => causes(site), [site]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapEl.current, center: sites[0]!.center, zoom: 14.2, attributionControl: { compact: true },
      style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, attribution: "Imagery Esri, Maxar", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const draw = () => {
      markers.current.forEach((x) => x.remove()); markers.current = [];
      for (const id of ["pits", "pits-l", "road"]) { if (m.getLayer(id)) m.removeLayer(id); }
      for (const id of ["pits", "road"]) { if (m.getSource(id)) m.removeSource(id); }
      m.addSource("pits", { type: "geojson", data: { type: "FeatureCollection", features: site.pits.map((p) => ({ type: "Feature", properties: { n: p.name }, geometry: { type: "Polygon", coordinates: [p.ring] } })) } });
      m.addLayer({ id: "pits", type: "line", source: "pits", paint: { "line-color": "#e6b800", "line-width": 2.5 } });
      m.addSource("road", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: site.road } } });
      m.addLayer({ id: "road", type: "line", source: "road", paint: { "line-color": "#ffffff", "line-width": 3, "line-dasharray": [2, 2] } });
      for (const d of site.delays) {
        const disp = causes(site).find((c) => c.label.startsWith(d.label))?.disputed;
        const e = el(disp ? "eye-pin eye-disp" : "eye-pin eye-delay", disp ? "DISPUTED" : `${d.hours}h`);
        markers.current.push(new maplibregl.Marker({ element: e }).setLngLat(d.at).addTo(m));
      }
      for (const v of site.evidence) markers.current.push(new maplibregl.Marker({ element: el("eye-pin eye-ev", `Clip ${v.time}`) }).setLngLat(v.at).addTo(m));
      for (const x of site.machines) markers.current.push(new maplibregl.Marker({ element: el(`eye-pin eye-m eye-${x.status}`, x.id) }).setLngLat(x.at).addTo(m));
    };
    if (m.loaded()) draw(); else m.once("load", draw);
    const b = new maplibregl.LngLatBounds();
    [...site.road, ...site.pits.flatMap((p) => p.ring), ...site.machines.map((x) => x.at), ...site.delays.map((d) => d.at)].forEach((c) => b.extend(c));
    m.fitBounds(b, { padding: 40, duration: 1800, maxZoom: 16 });
  }, [site]);

  function play(key: string) {
    audio.current?.pause();
    const a = new Audio(`/eye-audio/${key.replace(":", "-")}.mp3`);
    audio.current = a; a.play().catch(() => {});
  }
  function ask(text: string) {
    if (!text.trim()) return;
    const r = answer(text, sites, site);
    if (r.fly || r.site !== site) setSite(r.site);
    setLog((l) => [{ q: text, a: r.text }, ...l]);
    setQ(""); play(r.key);
  }
  function listen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setLog((l) => [{ q: "Voice input", a: "This browser has no speech input. Type your question." }, ...l]); return; }
    const rec = new SR(); rec.lang = "en-ZA"; setListening(true);
    rec.onresult = (e: any) => ask(e.results[0][0].transcript);
    rec.onend = () => setListening(false); rec.start();
  }
  const gap = site.target - site.actual;

  return (
    <div className="space-y-3">
      <style>{`.eye-pin{font:600 11px/1 "Hind",system-ui;padding:4px 7px;border-radius:6px;color:#fff;white-space:nowrap;box-shadow:0 1px 4px #0008}
      .eye-delay{background:#b45309}.eye-ev{background:#1d4ed8}.eye-m{background:#14532d}.eye-idle{background:#a16207}.eye-down{background:#991b1b}
      .eye-disp{background:#b91c1c;letter-spacing:.06em;animation:eyep 1.4s infinite}@keyframes eyep{50%{box-shadow:0 0 0 8px #b91c1c33}}`}</style>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl">Mine Operations Eye</h1>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">SAMPLE DATA</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sites.map((s) => (
          <button key={s.id} onClick={() => setSite(s)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${s.id === site.id ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {s.name.split(" (")[0]} <span className="opacity-70">{pct(s)}%</span>
          </button>
        ))}
      </div>
      <div ref={mapEl} className="h-[48vh] min-h-[300px] w-full overflow-hidden rounded-xl border" />
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">Actual</div><div className="font-display text-lg">{site.actual.toLocaleString()} t</div></div>
        <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">Target</div><div className="font-display text-lg">{site.target.toLocaleString()} t</div></div>
        <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">Risk</div><div className="font-display text-lg capitalize">{risk(site)}</div></div>
      </div>
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-display">Why {pct(site)}% ({gap > 0 ? `${gap.toLocaleString()} t short` : "on target"})</h2><span className="text-xs text-muted-foreground">{site.shift}</span></div>
        {cs.length === 0 && <p className="text-sm text-muted-foreground">No delays recorded.</p>}
        <ol className="space-y-2">
          {cs.map((c) => (
            <li key={c.rank} className="rounded-lg border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.rank}. {c.label}</span>
                <span className="text-muted-foreground">about {c.tonnes.toLocaleString()} t</span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${chip(c.conf)}`}>{c.conf}</span>
                {c.disputed && <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white">DISPUTED</span>}
              </div>
              <p className="mt-1 text-muted-foreground">{c.note}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border bg-card p-3">
        <div className="flex gap-2">
          <button onClick={listen} aria-label="Speak" className={`rounded-lg border px-3 ${listening ? "bg-red-600 text-white" : ""}`}><Mic size={18} /></button>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder="Why is Site 4 behind target?" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-base" />
          <button onClick={() => ask(q)} aria-label="Ask" className="rounded-lg bg-primary px-3 text-primary-foreground"><Send size={18} /></button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {[`Why is ${site.name.split(" (")[0]} behind target?`, `Which machines are idle at ${site.name.split(" (")[0]}?`, "Which sites are at risk today?"].map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border px-2.5 py-1">{s}</button>)}
        </div>
        <div className="mt-3 space-y-2">
          {log.map((l, i) => <div key={i} className="text-sm"><div className="font-semibold">{l.q}</div><div className="flex gap-2 text-muted-foreground"><Volume2 size={14} className="mt-1 shrink-0" />{l.a}</div></div>)}
        </div>
      </div>
    </div>
  );
}

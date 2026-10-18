import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Mic, Pause, Play, Send, Volume2 } from "lucide-react";
import { SAMPLE_SITES, type Site } from "@/lib/eye/sample";
import { answer, causes, pct, risk } from "@/lib/eye/engine";


const chip = (c: string) => c === "confirmed" ? "bg-emerald-100 text-emerald-900" : c === "inferred" ? "bg-amber-100 text-amber-900" : "bg-stone-200 text-stone-800";

const mins = (hhmm: string) => { const [h, mm] = hhmm.split(":").map(Number) as [number, number]; return (h * 60 + mm - 18 * 60 + 1440) % 1440; };
function clock(t: number) { const x = (18 * 60 + t) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; }

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
  const [card, setCard] = useState<{ title: string; kind: string; lines: [string, string][]; disputed?: boolean } | null>(null);
  const [t, setT] = useState(720);
  const [playing, setPlaying] = useState(false);
  const rec = useRef<{ kind: string; el: HTMLElement; mk: maplibregl.Marker; a?: number; b?: number; path?: [number, number][] }[]>([]);
  const cs = useMemo(() => causes(site), [site]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapEl.current, center: sites[0]!.center, zoom: 14.2, attributionControl: { compact: true },
      style: { version: 8, sources: { sat: { type: "raster", tileSize: 256, attribution: "Imagery Esri, Maxar", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
    });
    (window as any).__eyeMap = map.current;
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const draw = () => {
      markers.current.forEach((x) => x.remove()); markers.current = []; rec.current = [];
      for (const id of ["pits", "pits-l", "road"]) { if (m.getLayer(id)) m.removeLayer(id); }
      for (const id of ["pits", "road"]) { if (m.getSource(id)) m.removeSource(id); }
      m.addSource("pits", { type: "geojson", data: { type: "FeatureCollection", features: site.pits.map((p) => ({ type: "Feature", properties: { n: p.name }, geometry: { type: "Polygon", coordinates: [p.ring] } })) } });
      m.addLayer({ id: "pits", type: "fill", source: "pits", paint: { "fill-color": "#e6b800", "fill-opacity": 0.18 } });
      m.addLayer({ id: "pits-l", type: "line", source: "pits", paint: { "line-color": "#ffd23f", "line-width": 3 } });
      m.addSource("road", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: site.road } } });
      m.addLayer({ id: "road", type: "line", source: "road", paint: { "line-color": "#ffffff", "line-width": 3, "line-dasharray": [2, 2] } });
      for (const d of site.delays) {
        const disp = causes(site).find((c) => c.label.startsWith(d.label))?.disputed;
        const e = el(disp ? "eye-pin eye-disp" : "eye-pin eye-delay", disp ? "DISPUTED" : `${d.hours}h`);
        const mk = new maplibregl.Marker({ element: e, offset: [0, -14] }).setLngLat(d.at).addTo(m); markers.current.push(mk);
        rec.current.push({ kind: "delay", el: e, mk, a: mins(d.from), b: mins(d.to) });
        const cause = causes(site).find((c) => c.label.startsWith(d.label));
        const show = () => setCard({ title: d.label, kind: "Delay", disputed: !!disp, lines: [["Time", `${d.from} to ${d.to} (${d.hours} hours)`], ["Production lost", `about ${Math.round(d.hours * d.rate).toLocaleString()} tonnes`], ["Reported by a supervisor", d.reported ? "Yes" : "No, found from machine data"], ["Evidence", cause?.note ?? "None"], ["Confidence", cause?.conf ?? "missing"], ["In dispute", disp ? "YES: a clip contradicts the report" : "No"]] });
        e.onclick = show; e.onmouseenter = show;
      }
      for (const v of site.evidence) {
        const e = el("eye-pin eye-ev", `Clip ${v.time}`);
        const mk = new maplibregl.Marker({ element: e, offset: [0, 14] }).setLngLat(v.at).addTo(m); markers.current.push(mk);
        rec.current.push({ kind: "clip", el: e, mk, a: mins(v.time) });
        const show = () => setCard({ title: v.label, kind: "Video clip", disputed: v.shows === "loading", lines: [["Recorded at", v.time], ["What it shows", v.note], ["Shows loading activity", v.shows === "loading" ? "Yes" : "No"], ["In dispute", v.shows === "loading" ? "YES: it contradicts a reported delay" : "No"]] });
        e.onclick = show; e.onmouseenter = show;
      }
      for (const x of site.machines) {
        const e = el(`eye-pin eye-m eye-${x.status}`, x.id);
        const mk = new maplibregl.Marker({ element: e }).setLngLat(x.at).addTo(m); markers.current.push(mk);
        rec.current.push({ kind: "machine", el: e, mk, path: x.path });
        const show = () => setCard({ title: x.id, kind: x.type, lines: [["Status", x.status === "active" ? "Working" : x.status === "idle" ? "Standing idle" : "Broken down"], ["Idle time this shift", `${x.idleHours} hours`], ["Fuel used", `${x.litres} litres`], ["Tonnes moved", `${x.tonnes.toLocaleString()} t`], ["Last update", "Sample data"], ["In dispute", "No"]] });
        e.onclick = show; e.onmouseenter = show;
      }
      setT((v) => v);
    };
    if (m.loaded()) draw(); else m.once("load", draw);
    const b = new maplibregl.LngLatBounds();
    [...site.road, ...site.pits.flatMap((p) => p.ring), ...site.machines.map((x) => x.at), ...site.delays.map((d) => d.at)].forEach((c) => b.extend(c));
    m.fitBounds(b, { padding: 40, duration: 1800, maxZoom: 16 });
  }, [site]);

  useEffect(() => {
    for (const r of rec.current) {
      if (t >= 720) { r.el.style.opacity = "1"; r.el.style.display = ""; if (r.kind === "machine" && r.path) r.mk.setLngLat(r.path[0]!); continue; }
      if (r.kind === "delay") r.el.style.display = t >= r.a! && t <= r.b! ? "" : "none";
      if (r.kind === "clip") r.el.style.display = t >= r.a! ? "" : "none";
      if (r.kind === "machine" && r.path) { const f = ((t / 60) % 2) / 2 * (r.path.length - 1) * 2; const i = f <= r.path.length - 1 ? f : (r.path.length - 1) * 2 - f; const k = Math.floor(i); r.mk.setLngLat(r.path[k]!); }
    }
  }, [t, site]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((v) => { if (v >= 719) { setPlaying(false); return 720; } return v + 6; }), 120);
    return () => clearInterval(id);
  }, [playing]);

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
      <div className="relative">
        <div ref={mapEl} className="h-[48vh] min-h-[300px] w-full overflow-hidden rounded-xl border" onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "CANVAS") setCard(null); }} />
        {card && (
          <div className="absolute inset-x-2 bottom-2 z-10 max-h-[70%] overflow-auto rounded-xl border bg-card/95 p-3 text-sm shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">{card.kind}</div><div className="font-display text-base">{card.title}</div></div>
              <div className="flex items-center gap-2">{card.disputed && <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">DISPUTED</span>}<button onClick={() => setCard(null)} aria-label="Close" className="rounded border px-2">x</button></div>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{card.lines.map(([k, v]) => (<><dt key={k} className="text-muted-foreground">{k}</dt><dd key={k + "v"}>{v}</dd></>))}</dl>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-xl border bg-card p-2">
        <button onClick={() => { if (t >= 720) setT(0); setPlaying((p) => !p); }} aria-label="Replay shift" className="rounded-lg bg-primary p-2 text-primary-foreground">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <input type="range" min={0} max={720} step={6} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="min-w-0 flex-1" aria-label="Shift time" />
        <span className="w-24 text-right text-sm tabular-nums">{t >= 720 ? "Shift summary" : clock(t)}</span>
      </div>
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

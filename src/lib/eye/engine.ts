import type { Conf, Delay, Evidence, Site } from "./sample";

export type Cause = { rank: number; label: string; tonnes: number; conf: Conf; disputed: boolean; note: string };

const tpl = (s: Site) => s.target - s.actual;

export function evidenceFor(s: Site, d: Delay): Evidence[] { return s.evidence.filter((e) => d.evidence.includes(e.id)); }

/** Conflict: the reported delay says no work, but an evidence clip shows loading. */
export function isDisputed(s: Site, d: Delay): boolean { return d.reported && evidenceFor(s, d).some((e) => e.shows === "loading"); }

export function confidence(s: Site, d: Delay): Conf {
  const ev = evidenceFor(s, d);
  if (ev.length === 0) return d.reported ? "missing" : "inferred";
  if (isDisputed(s, d)) return "missing";
  return d.reported ? "confirmed" : "inferred";
}

export function causes(s: Site): Cause[] {
  return s.delays.map((d) => ({ d, t: Math.round(d.hours * d.rate) }))
    .sort((a, b) => b.t - a.t)
    .map(({ d, t }, i) => ({ rank: i + 1, label: `${d.label} ${d.from}-${d.to}`, tonnes: t, conf: confidence(s, d), disputed: isDisputed(s, d),
      note: isDisputed(s, d) ? "Reported delay, but a clip shows loading. Needs a supervisor answer." : evidenceFor(s, d).map((e) => `${e.time} clip: ${e.note}`).join(" ") || "No clip attached." }));
}

export function pct(s: Site) { return Math.round((s.actual / s.target) * 100); }
export function risk(s: Site): "high" | "medium" | "low" { const p = pct(s); return p < 80 ? "high" : p < 95 ? "medium" : "low"; }

export function why(s: Site): string {
  const gap = tpl(s); const cs = causes(s);
  if (gap <= 0) return `${s.name} is on or above target (${s.actual.toLocaleString()} of ${s.target.toLocaleString()} t).`;
  const top = cs[0];
  const lines = [`${s.name} is at ${pct(s)}% of target: ${s.actual.toLocaleString()} of ${s.target.toLocaleString()} tonnes. Shortfall about ${gap.toLocaleString()} tonnes.`];
  if (top) lines.push(`Largest likely cause: ${top.label}, about ${top.tonnes.toLocaleString()} tonnes (${top.conf}).`);
  const idle = s.machines.filter((m) => m.idleHours >= 2);
  if (idle.length) lines.push(`${idle.length} machine${idle.length > 1 ? "s" : ""} idle over 2 hours: ${idle.map((m) => m.id).join(", ")}.`);
  const disputed = cs.filter((c) => c.disputed);
  if (disputed.length) lines.push(`Disputed: ${disputed.map((c) => c.label).join("; ")}. A clip contradicts the report.`);
  lines.push("Sample data. Confidence reflects clips attached.");
  return lines.join(" ");
}

export function findSite(q: string, sites: Site[]): Site | undefined {
  const m = q.toLowerCase().match(/(?:site\s*|s)(\d+)/);
  if (m) return sites.find((s) => s.id === `s${m[1]}`);
  return sites.find((s) => q.toLowerCase().includes(s.name.toLowerCase().split(" (")[0]!));
}

export function answer(q: string, sites: Site[], current: Site): { text: string; site: Site; fly: boolean; key: string } {
  const l = q.toLowerCase();
  const site = findSite(q, sites) ?? current;
  const fly = /take me|fly|show me site|go to/.test(l) || !!findSite(q, sites);
  if (/idle|waste|fuel/.test(l)) {
    const ms = [...site.machines].sort((a, b) => b.idleHours - a.idleHours);
    const m = ms[0]!;
    return { site, fly, key: `idle:${site.id}`, text: `${m.id} has the highest idle time: ${m.idleHours} hours, about ${Math.round(m.idleHours * 28)} litres burned idling (estimate). Sample data.` };
  }
  if (/risk|miss target today|which site/.test(l)) {
    const r = [...sites].sort((a, b) => pct(a) - pct(b)) as [Site, Site];
    return { site: r[0], fly: true, key: "risk", text: `Highest risk: ${r[0].name} at ${pct(r[0])}% of target. Then ${r[1].name} at ${pct(r[1])}%. Sample data.` };
  }
  if (/why|behind|miss|target/.test(l)) return { site, fly, key: `why:${site.id}`, text: why(site) };
  return { site, fly, key: `info:${site.id}`, text: `${site.name}: ${pct(site)}% of target, ${site.machines.filter((m) => m.status === "active").length} machines active, ${site.delays.length} delay${site.delays.length === 1 ? "" : "s"}. Ask "why is ${site.name.split(" (")[0]} behind target?". Sample data.` };
}

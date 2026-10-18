import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { DEFAULTS, FLEET } from "@/lib/eye/fleet";
import { money, runRules, totalLeak } from "@/lib/eye/rules";

const SITES: Record<string, string> = { s4: "Site 4", s2: "Site 2", s7: "Site 7" };
const sigs = runRules(FLEET, DEFAULTS);

function reply(q: string): string {
  const t = q.toLowerCase();
  const site = Object.entries(SITES).find(([, n]) => t.includes(n.toLowerCase()))?.[0];
  const pool = site ? sigs.filter((s) => s.site === site) : sigs;
  const scope = site ? SITES[site] : "the whole fleet";
  if (/idle|standing/.test(t)) { const r = pool.filter((s) => s.rule === "idle"); return r.length ? `Idle machines at ${scope}:\n${r.map((s) => `- ${s.headline}, about ${money(s.leakR)} a week`).join("\n")}` : `No machine is over the idle limit at ${scope}.`; }
  if (/fuel|diesel/.test(t)) { const r = pool.filter((s) => s.rule === "fuel"); return r.length ? `Fuel use at ${scope}:\n${r.map((s) => `- ${s.headline}, about ${money(s.leakR)} a week`).join("\n")}` : `No fuel outliers at ${scope}.`; }
  if (/fault|breakdown|repeat/.test(t)) { const r = pool.filter((s) => s.rule === "fault"); return r.length ? `Repeat faults at ${scope}:\n${r.map((s) => `- ${s.headline}, about ${money(s.leakR)} a week`).join("\n")}` : `No repeat faults at ${scope}.`; }
  if (/leak|lose|losing|money|rand|cost|worst|biggest/.test(t)) { const top = pool[0]; return top ? `At ${scope} about ${money(totalLeak(pool))} a week is leaking across ${pool.length} signals. Biggest: ${top.headline}, about ${money(top.leakR)}.\nThese are estimates from sample data.` : `No leaks flagged at ${scope}.`; }
  return `I can answer about idle machines, fuel use, repeat faults, or where money is leaking. Add a site name, for example "idle at Site 4".`;
}

function Page() {
  const [msgs, setMsgs] = useState<{ from: "me" | "bot"; text: string }[]>([{ from: "bot", text: "Hi, I'm the MineMySol demo bot. Ask me about idle machines, fuel use, repeat faults or where money is leaking. This is a web simulation with sample data. It is not connected to WhatsApp." }]);
  const [q, setQ] = useState(""); const end = useRef<HTMLDivElement>(null);
  function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { from: "me", text }, { from: "bot", text: reply(text) }]); setQ("");
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-xl">Fleet bot demo</h1><span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">SAMPLE DATA</span></div>
      <p className="text-sm text-muted-foreground"><b>Purpose:</b> show how a mine manager would ask about fleet signals by chat. <b>Look at:</b> the answers and rand figures. They come from the same rules as the Fleet signals page.</p>
      <div className="h-[55vh] space-y-2 overflow-y-auto rounded-xl border bg-[#e7ded2] p-3" data-testid="bot-log">
        {msgs.map((m, i) => <div key={i} className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${m.from === "me" ? "ml-auto bg-[#d9fdd3]" : "bg-white"}`}>{m.text}</div>)}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">{["Which machines are idle at Site 4?", "Where is money leaking?", "Any repeat faults at Site 7?", "Fuel use at Site 4"].map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border bg-card px-3 py-1.5">{s}</button>)}</div>
      <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder="Type a question" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-base" /><button onClick={() => ask(q)} aria-label="Send" className="rounded-lg bg-primary px-3 text-primary-foreground"><Send size={18} /></button></div>
    </div>
  );
}
export const Route = createFileRoute("/bot")({ component: Page });

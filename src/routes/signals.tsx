import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FleetSignals } from "@/components/app/FleetSignals";
import { makeToken, readToken, type Demo } from "@/lib/eye/token";

const NAMES: Record<string, string> = { s4: "Site 4", s2: "Site 2", s7: "Site 7" };

function Creator({ onPick }: { onPick: (s: string) => void }) {
  const [site, setSite] = useState("s4"); const [days, setDays] = useState(7); const [label, setLabel] = useState(""); const [link, setLink] = useState(""); const [copied, setCopied] = useState(false);
  async function make() {
    const d: Demo = { s: site, l: label.trim().slice(0, 40) || "Demo", e: Date.now() + days * 86400000 };
    setLink(`${location.origin}/?demo=${await makeToken(d)}`); setCopied(false);
  }
  return (
    <div className="rounded-xl border bg-card p-3 text-sm" data-testid="demo-creator">
      <h2 className="font-display">Create a demo link</h2>
      <p className="mb-2 text-muted-foreground"><b>Purpose:</b> show one site's fleet signals to a potential customer. <b>Look at:</b> the expiry and label. <b>Then:</b> copy the link. It opens a view-only page of sample data.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Site</div><select value={site} onChange={(e) => { setSite(e.target.value); onPick(e.target.value); }} className="w-full bg-transparent">{Object.entries(NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Expires in days (1 to 30)</div><input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))} className="w-full bg-transparent" /></label>
        <label className="col-span-2 rounded-lg border p-2"><div className="text-xs text-muted-foreground">Label (who it is for)</div><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mine manager demo" className="w-full bg-transparent" /></label>
      </div>
      <button onClick={make} className="mt-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground">Create link</button>
      {link && <div className="mt-2 space-y-2"><code data-testid="demo-link" className="block break-all rounded border bg-background p-2 text-xs">{link}</code><button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }} className="rounded-lg border px-3 py-1.5">{copied ? "Copied" : "Copy link"}</button></div>}
      <p className="mt-2 text-xs text-muted-foreground">Limits: the link is not a password. It is stateless and only ever shows labelled sample data. Real customer data will need sign-in.</p>
    </div>
  );
}

function Page() {
  const [state, setState] = useState<"loading" | "open" | "demo" | "expired" | "bad">("loading");
  const [demo, setDemo] = useState<Demo | null>(null); const [site, setSite] = useState("s4");
  useEffect(() => { (async () => {
    const t = new URLSearchParams(location.search).get("t");
    if (!t) { setState("open"); return; }
    const r = await readToken(t);
    if (!r.ok) { setState("bad"); return; }
    setDemo(r.demo); setSite(r.demo.s); setState(r.expired ? "expired" : "demo");
  })(); }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-2xl">Fleet signals</h1><span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">SAMPLE DATA</span></div>
      {state === "loading" && <p>Loading...</p>}
      {state === "bad" && <p className="rounded-lg border bg-card p-3" data-testid="demo-bad">This link is not valid. Ask for a new one.</p>}
      {state === "expired" && <p className="rounded-lg border bg-card p-3" data-testid="demo-expired">This demo link has expired ({demo?.l}). Ask for a new one.</p>}
      {state === "demo" && demo && (<>
        <p className="rounded-lg border bg-card p-2 text-sm" data-testid="demo-banner">Demo for <b>{demo.l}</b>, {NAMES[demo.s]}. Expires {new Date(demo.e).toLocaleDateString("en-ZA")}. View only.</p>
        <FleetSignals siteId={demo.s} locked />
      </>)}
      {state === "open" && (<><FleetSignals siteId={site} /><Creator onPick={setSite} /></>)}
    </div>
  );
}
export const Route = createFileRoute("/signals")({ component: Page });

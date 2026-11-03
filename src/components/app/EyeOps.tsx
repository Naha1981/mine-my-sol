import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingUp, ClipboardList, Video, Users, Wrench, MessageCircle, Plus, Check } from "lucide-react";
import type { Site, Evidence } from "../../lib/eye/sample";
import type { Cause } from "../../lib/eye/engine";
import { forecast, handoverText, morningText, boardRows, suggestFixes, supervisorFor, type Fix, type UploadedClip } from "../../lib/eye/ops";

const FIX_KEY = "mms-eye-fixes";
const loadFixes = (): Fix[] => { try { return JSON.parse(localStorage.getItem(FIX_KEY) ?? "[]"); } catch { return []; } };
const saveFixes = (f: Fix[]) => { try { localStorage.setItem(FIX_KEY, JSON.stringify(f)); } catch { /* full */ } };

const wa = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;


type WaState = { phase: "loading" } | { phase: "ready"; phone: string } | { phase: "inactive" } | { phase: "error"; error: string };

function WaDirect({ text }: { text: string }) {
  const [st, setSt] = useState<WaState>({ phase: "loading" });
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const check = async () => {
    try {
      const r = await fetch("/api/wa/status");
      const d = await r.json();
      if (d.session?.status === "active" && d.session.phone) setSt({ phase: "ready", phone: d.session.phone.startsWith("+") ? d.session.phone : "+" + d.session.phone });
      else setSt({ phase: "inactive" });
    } catch { setSt({ phase: "error", error: "Could not reach the send service" }); }
  };
  useEffect(() => { check(); }, []);
  const sendNow = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/wa/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await r.json();
      setNote(d.ok ? `Sent to ${d.to}. Check WhatsApp.` : `Not sent: ${d.message || d.error || "send failed"}`);
    } catch { setNote("Not sent: network error"); }
    setBusy(false);
  };
  const activate = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/wa/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
      const d = await r.json();
      setNote(d.ok ? `An activation message was sent to ${phone} from ${d.sandboxNumber || "the service number"}. Reply to it in WhatsApp, then tap "I have replied".` : `Activation failed: ${d.error || "unknown"}`);
    } catch { setNote("Activation failed: network error"); }
    setBusy(false);
  };
  if (st.phase === "loading") return <p className="mt-1 text-xs text-muted-foreground">Checking direct WhatsApp send...</p>;
  if (st.phase === "error") return <p className="mt-1 text-xs text-muted-foreground">Direct send unavailable: {st.error}. Use the WhatsApp button above instead.</p>;
  return (
    <div className="mt-2 rounded-lg border p-2" data-testid="wa-direct">
      {st.phase === "ready" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={sendNow} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Sending..." : `Send straight to my WhatsApp (${st.phone})`}</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Direct send is not active yet. Enter the phone that should get the reports, activate it once, and reports go straight to its WhatsApp.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2761..." className="rounded-lg border bg-background px-3 py-1.5 text-sm" />
            <button disabled={busy} onClick={activate} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">{busy ? "Activating..." : "Activate this number"}</button>
            <button onClick={check} className="rounded-lg border px-3 py-1.5 text-sm">I have replied</button>
          </div>
        </div>
      )}
      {note && <p className="mt-1 text-xs">{note}</p>}
    </div>
  );
}

function ReportButton({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">{title}</button>
        <a href={wa(text)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"><MessageCircle size={14} />Send via WhatsApp</a>
      </div>
      {open && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{text}</pre>}
      <p className="mt-1 text-xs text-muted-foreground">WhatsApp opens with the report ready - you choose who it goes to. Nothing is sent automatically.</p>
      <WaDirect text={text} />
    </div>
  );
}

export function EyeOps({ site, causes, elapsedMin }: { site: Site; causes: Cause[]; elapsedMin: number }) {
  const f = useMemo(() => forecast(site, elapsedMin), [site, elapsedMin]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  useEffect(() => { setFixes(loadFixes()); }, []);
  const [clips, setClips] = useState<UploadedClip[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [clipNote, setClipNote] = useState("");
  const [clipShows, setClipShows] = useState<Evidence["shows"]>("loading");
  const [newFix, setNewFix] = useState<{ action: string; owner: string; due: string } | null>(null);
  const suggestions = useMemo(() => suggestFixes(causes), [causes]);
  const board = useMemo(() => boardRows(site, causes, clips), [site, causes, clips]);

  const addFix = (action: string, owner: string, due: string, cause: string) => {
    const next = [...fixes, { id: `f${Date.now()}`, action, owner, due, cause, status: "open" as const, createdAt: new Date().toISOString() }];
    setFixes(next); saveFixes(next);
  };
  const toggleFix = (id: string) => {
    const next = fixes.map((x) => (x.id === id ? { ...x, status: x.status === "open" ? ("done" as const) : ("open" as const) } : x));
    setFixes(next); saveFixes(next);
  };
  const onFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video");
    const now = new Date();
    const at = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    // An uploaded clip that shows loading inside a reported stop window contradicts that report.
    const hhmm = at;
    const disputed = clipShows === "loading" && site.delays.some((d) => d.reported && d.from <= hhmm && hhmm <= d.to);
    setClips((c) => [...c, { id: `u${Date.now()}`, at, label: clipNote.trim() || (isVideo ? "Site clip" : "Site photo"), shows: clipShows, note: clipNote.trim(), url, kind: isVideo ? "video" : "photo", disputed }]);
    setClipNote("");
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3" data-testid="forecast-card">
        <h2 className="mb-2 flex items-center gap-2 font-display"><TrendingUp size={16} />Shift forecast</h2>
        <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
          <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Rate so far</div><div className="font-display">{f.rateNow.toLocaleString()} t/h</div></div>
          <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Needed for target</div><div className="font-display">{f.neededRate.toLocaleString()} t/h</div></div>
          <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Projected at shift end</div><div className="font-display">{f.projected.toLocaleString()} t</div></div>
          {elapsedMin < 715 && <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">To catch up from here</div><div className="font-display">{f.catchupRate.toLocaleString()} t/h</div></div>}
        </div>
        {elapsedMin >= 715 ? (
          <p className="mt-2 text-sm">
            Shift over: {site.actual.toLocaleString()} t of {site.target.toLocaleString()} t ({Math.round((site.actual / site.target) * 100)}%).{f.onPace ? " Target reached." : ` ${f.shortfall.toLocaleString()} t short - the ranked causes are in the Why panel above.`}
          </p>
        ) : (
          <p className="mt-2 text-sm">
            {f.onPace
              ? `On pace. At the current rate the target is reached inside the shift${f.reachClock ? `, about ${f.reachClock}` : ""}.`
              : `Behind pace. At the current rate the shift ends near ${f.projected.toLocaleString()} t${f.reachClock ? ` and target is only reached about ${f.reachClock}` : " - the target is not reached this shift at this rate"}.`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Estimate from tonnes moved so far this shift, not a guarantee.</p>
      </div>

      <div className="rounded-xl border bg-card p-3" data-testid="reports-card">
        <h2 className="mb-2 flex items-center gap-2 font-display"><ClipboardList size={16} />Shift reports</h2>
        <div className="space-y-2">
          <ReportButton title="05:00 night handover" text={handoverText(site, causes, fixes)} />
          <ReportButton title="07:00 morning update" text={morningText(site, causes, f, clips)} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3" data-testid="upload-card">
        <h2 className="mb-2 flex items-center gap-2 font-display"><Video size={16} />Site clips and photos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">Upload clip or photo</button>
          <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) onFile(fl); e.target.value = ""; }} />
          <select value={clipShows} onChange={(e) => setClipShows(e.target.value as Evidence["shows"])} className="rounded-lg border bg-background px-2 py-1.5 text-sm" aria-label="What it shows">
            <option value="loading">Shows loading</option>
            <option value="no-activity">Shows no activity</option>
            <option value="queue">Shows a queue</option>
          </select>
          <input value={clipNote} onChange={(e) => setClipNote(e.target.value)} placeholder="Note (place, what to look at)" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">The clip is stamped with the time and checked against reported stops. It stays on this device until it is shared.</p>
        {clips.length > 0 && (
          <ul className="mt-2 space-y-2">
            {clips.map((c) => (
              <li key={c.id} className="rounded-lg border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.at} - {c.label}</span>
                  {c.disputed && <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">CONTRADICTS A REPORTED STOP</span>}
                </div>
                {c.kind === "video"
                  ? <video src={c.url} controls playsInline className="mt-1 max-h-48 w-full rounded border" />
                  : <img src={c.url} alt={c.label} className="mt-1 max-h-48 rounded border object-cover" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-3" data-testid="board-card">
        <h2 className="mb-2 flex items-center gap-2 font-display"><Users size={16} />Supervisor board</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1 pr-2">Supervisor</th><th className="py-1 pr-2">Delays</th><th className="py-1 pr-2">Not reported</th><th className="py-1 pr-2">Disputed</th><th className="py-1 pr-2">Tonnes lost</th><th className="py-1">Clips sent</th></tr></thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.supervisor} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-semibold">{r.supervisor}</td>
                  <td className="py-1.5 pr-2">{r.delays}</td>
                  <td className="py-1.5 pr-2">{r.unreported}</td>
                  <td className="py-1.5 pr-2">{r.disputes > 0 ? <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">{r.disputes}</span> : 0}</td>
                  <td className="py-1.5 pr-2">{r.tonnesLost.toLocaleString()} t</td>
                  <td className="py-1.5">{r.clips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Supervisors are shown by area role. Tonnes lost are the same estimates as the Why panel.</p>
      </div>

      <div className="rounded-xl border bg-card p-3" data-testid="fixes-card">
        <h2 className="mb-2 flex items-center gap-2 font-display"><Wrench size={16} />Fixes and follow-through</h2>
        {fixes.length === 0 && <p className="text-sm text-muted-foreground">No fixes logged yet. Suggested from this shift's causes:</p>}
        {fixes.length === 0 && (
          <div className="mt-2 space-y-2">
            {suggestions.map((s) => (
              <div key={s.cause} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="min-w-0 flex-1"><b>{s.cause}:</b> {s.action} <span className="text-muted-foreground">({s.owner}, {s.due})</span></span>
                <button onClick={() => addFix(s.action, s.owner, s.due, s.cause)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs"><Plus size={12} />Log this fix</button>
              </div>
            ))}
          </div>
        )}
        {fixes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {fixes.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <button onClick={() => toggleFix(x.id)} className={`flex h-6 w-6 items-center justify-center rounded border ${x.status === "done" ? "bg-green-600 text-white" : ""}`} aria-label="Toggle done">{x.status === "done" && <Check size={14} />}</button>
                <span className={`min-w-0 flex-1 ${x.status === "done" ? "line-through opacity-60" : ""}`}><b>{x.cause}:</b> {x.action} <span className="text-muted-foreground">({x.owner}, due {x.due})</span></span>
              </li>
            ))}
          </ul>
        )}
        {fixes.length > 0 && !newFix && <button onClick={() => setNewFix({ action: "", owner: "Shift supervisor", due: "next shift" })} className="mt-2 flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"><Plus size={14} />Add a fix</button>}
        {newFix && (
          <div className="mt-2 space-y-2 rounded-lg border p-2 text-sm">
            <input value={newFix.action} onChange={(e) => setNewFix({ ...newFix, action: e.target.value })} placeholder="What must be fixed" className="w-full rounded-lg border bg-background px-3 py-1.5" />
            <div className="flex flex-wrap gap-2">
              <input value={newFix.owner} onChange={(e) => setNewFix({ ...newFix, owner: e.target.value })} placeholder="Owner" className="rounded-lg border bg-background px-3 py-1.5" />
              <input value={newFix.due} onChange={(e) => setNewFix({ ...newFix, due: e.target.value })} placeholder="Due" className="rounded-lg border bg-background px-3 py-1.5" />
              <button onClick={() => { if (newFix.action.trim()) { addFix(newFix.action.trim(), newFix.owner, newFix.due, "Manual"); setNewFix(null); } }} className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">Save</button>
              <button onClick={() => setNewFix(null)} className="rounded-lg border px-3 py-1.5">Cancel</button>
            </div>
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Open fixes go into the 05:00 handover so the next shift inherits them.</p>
      </div>
    </div>
  );
}

// Demo-link tokens. Stateless: the link carries site, label and expiry plus a tamper check.
// This is NOT access control. The page only ever shows labelled sample data.
export type Demo = { s: string; l: string; e: number };
const b64 = (x: string) => btoa(unescape(encodeURIComponent(x))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (x: string) => decodeURIComponent(escape(atob(x.replace(/-/g, "+").replace(/_/g, "/"))));
async function check(p: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p + "|mms-demo-v1")); return [...new Uint8Array(h)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function makeToken(d: Demo) { const p = b64(JSON.stringify(d)); return `${p}.${await check(p)}`; }
export async function readToken(t: string): Promise<{ ok: true; demo: Demo; expired: boolean } | { ok: false }> {
  try {
    const [p, c] = t.split("."); if (!p || !c || (await check(p)) !== c) return { ok: false };
    const demo = JSON.parse(unb64(p)) as Demo;
    if (!["s4", "s2", "s7"].includes(demo.s) || typeof demo.e !== "number") return { ok: false };
    return { ok: true, demo, expired: Date.now() > demo.e };
  } catch { return { ok: false }; }
}

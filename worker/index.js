// MineMySol worker: serves the static app and proxies the WhatsApp report sends
// through the connected messaging API. The API key never reaches the browser.
const API = "https://zernio.com/api/v1";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

async function zcall(env, path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${env.ZERNIO_API_KEY}`, "content-type": "application/json", ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function status(env) {
  const [numbers, sessions, accounts] = await Promise.all([
    zcall(env, "/phone-numbers"),
    zcall(env, "/whatsapp/sandbox/sessions"),
    zcall(env, "/accounts"),
  ]);
  const sandbox = numbers.body?.sandbox
    ? { accountId: numbers.body.sandbox.accountId, number: numbers.body.sandbox.number ?? null, template: numbers.body.sandbox.template ?? null }
    : null;
  const session = (sessions.body?.sessions ?? []).find((s) => s.status === "active") ?? null;
  const waAccounts = (accounts.body?.accounts ?? []).filter((a) => a.platform === "whatsapp");
  return json({
    ok: true,
    sendingAccount: waAccounts[0]?._id ?? sandbox?.accountId ?? null,
    sandboxNumber: sandbox?.number ?? null,
    session: session ? { phone: session.phoneE164, status: session.status, expiresAt: session.expiresAt ?? null } : null,
    connectedWhatsAppNumbers: waAccounts.length,
  });
}

async function activate(env, request) {
  const { phone } = await request.json().catch(() => ({}));
  if (!phone || !/^\+[0-9]{8,15}$/.test(phone)) return json({ ok: false, error: "Phone must be in international format, e.g. +2761..." }, 400);
  const r = await zcall(env, "/whatsapp/sandbox/sessions", { method: "POST", body: JSON.stringify({ phone }) });
  if (r.status >= 400) return json({ ok: false, error: r.body?.error ?? "activation failed", detail: r.body }, r.status);
  return json({ ok: true, sandboxNumber: r.body?.sandboxNumber ?? null, status: r.body?.status ?? "pending" });
}

async function send(env, request) {
  const { text } = await request.json().catch(() => ({}));
  if (!text || typeof text !== "string" || text.length > 4000) return json({ ok: false, error: "Missing report text" }, 400);
  const numbers = await zcall(env, "/phone-numbers");
  const sandbox = numbers.body?.sandbox;
  if (!sandbox) return json({ ok: false, error: "No sending number available on the messaging account" }, 409);
  const sessions = await zcall(env, "/whatsapp/sandbox/sessions");
  const session = (sessions.body?.sessions ?? []).find((s) => s.status === "active");
  if (!session) return json({ ok: false, error: "not_activated", message: "No phone has activated yet. Activate one first." }, 409);
  // Sends ONLY to the activated session phone - never to an arbitrary number.
  const convs = await zcall(env, `/inbox/conversations?accountId=${sandbox.accountId}&limit=50`);
  const existing = (convs.body?.data ?? []).find((c) => (c.participantId ?? c.participant ?? "").includes(session.phoneE164.replace("+", "")));
  let conversationId = existing?._id ?? existing?.id;
  if (!conversationId) {
    const opened = await zcall(env, "/inbox/conversations", {
      method: "POST",
      body: JSON.stringify({ accountId: sandbox.accountId, participantId: session.phoneE164, templateName: sandbox.template.name, templateLanguage: sandbox.template.language, templateParams: [] }),
    });
    if (opened.status >= 400) return json({ ok: false, error: opened.body?.error ?? "could not open conversation", detail: opened.body }, opened.status);
    conversationId = opened.body?.data?.conversationId ?? opened.body?.conversationId;
  }
  const sent = await zcall(env, `/inbox/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ accountId: sandbox.accountId, message: text }),
  });
  if (sent.status >= 400) return json({ ok: false, error: sent.body?.error ?? "send failed", detail: sent.body }, sent.status);
  const messageId = sent.body?.data?.messageId ?? sent.body?.messageId ?? null;
  // Accepted is not delivered: poll delivery status briefly so the UI tells the truth.
  let delivery = "accepted";
  for (let i = 0; i < 6 && delivery === "accepted"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const list = await zcall(env, `/inbox/conversations/${conversationId}/messages?accountId=${sandbox.accountId}&limit=50`);
    const msgs = list.body?.messages ?? list.body?.data ?? [];
    const mine = messageId ? msgs.find((m) => m.id === messageId) : msgs[msgs.length - 1];
    const st = mine?.deliveryStatus;
    if (st && st !== "sent" && st !== "pending") delivery = st;
  }
  if (delivery === "failed") return json({ ok: false, error: "delivery_failed", message: "WhatsApp refused delivery. The phone must first reply once to the activation message from the sender (WhatsApp's 24-hour rule)." }, 409);
  return json({ ok: true, sent: true, deliveryStatus: delivery, to: session.phoneE164, conversationId });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.ZERNIO_API_KEY && url.pathname.startsWith("/api/wa/")) return json({ ok: false, error: "Messaging key not configured on the server" }, 503);
    if (url.pathname === "/api/wa/status" && request.method === "GET") return status(env);
    if (url.pathname === "/api/wa/activate" && request.method === "POST") return activate(env, request);
    if (url.pathname === "/api/wa/send" && request.method === "POST") return send(env, request);
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};

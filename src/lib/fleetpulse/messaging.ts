// Messaging provider abstraction. Business logic only ever calls a MessagingProvider.
export type Outbound = { to: string; body: string };
export type SendResult = { ok: boolean; id?: string | undefined; error?: string | undefined };
export interface MessagingProvider {
  readonly name: string;
  send(m: Outbound): Promise<SendResult>;
}

/** Opens a WhatsApp chat with the text prefilled; the person taps send. No API, no credentials, no automation. */
export class ShareLinkProvider implements MessagingProvider {
  readonly name = "share-link";
  link(m: Outbound) {
    return `https://wa.me/${m.to.replace(/\D/g, "")}?text=${encodeURIComponent(m.body)}`;
  }
  async send(m: Outbound) {
    return { ok: true, id: this.link(m) };
  }
}
/** Official WhatsApp Business Cloud API. Server side only. Needs a business-verified number, a token and an approved template for business-initiated sends. Not configured: reports why instead of failing silently. */
export class CloudApiProvider implements MessagingProvider {
  readonly name = "cloud-api";
  constructor(private cfg: { token?: string; phoneNumberId?: string }) {}
  async send(m: Outbound): Promise<SendResult> {
    if (!this.cfg.token || !this.cfg.phoneNumberId)
      return { ok: false, error: "Official WhatsApp credentials are not configured." };
    const r = await fetch(`https://graph.facebook.com/v20.0/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: m.to.replace(/\D/g, ""),
        type: "text",
        text: { body: m.body },
      }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    return r.ok
      ? { ok: true, id: j.messages?.[0]?.id }
      : { ok: false, error: j.error?.message ?? `HTTP ${r.status}` };
  }
}

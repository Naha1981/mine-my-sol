import { useEffect, useRef } from "react";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void } } }

export const CAPTCHA_SITE_KEY: string = (import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) ?? "";
export const captchaEnabled = CAPTCHA_SITE_KEY.length > 0;

/** Cloudflare Turnstile widget (free). Renders nothing until VITE_TURNSTILE_SITE_KEY is set, so CAPTCHA can be switched on in Auth settings and here together. */
export function Captcha({ onToken, resetKey }: { onToken: (t: string) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!captchaEnabled) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      if (id.current) window.turnstile.remove(id.current);
      id.current = window.turnstile.render(ref.current, { sitekey: CAPTCHA_SITE_KEY, callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    };
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!s) { s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.dataset["turnstile"] = "1"; document.head.appendChild(s); }
      s.addEventListener("load", mount);
    }
    return () => { cancelled = true; if (id.current && window.turnstile) window.turnstile.remove(id.current); };
  }, [onToken, resetKey]);
  if (!captchaEnabled) return null;
  return <div ref={ref} className="flex justify-center" data-testid="captcha" />;
}

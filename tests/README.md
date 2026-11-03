# Proof scripts (manual, dev-only)

Puppeteer scripts used to verify the live deployment at https://minemysol.nahalabs.co.za/eye.
They are not part of the app build and change nothing at runtime.

Setup: `npm i puppeteer-core` (uses the system Chrome at /usr/bin/google-chrome).

- `eye-ops-proof.mjs` - checks the forecast/reports/upload/board/fixes cards exist on the live
  site, generates the 05:00 handover, logs a suggested fix, uploads a generated test photo,
  and saves card screenshots to /downloads/.
- `eye-wa-proof.mjs` - checks the direct WhatsApp send row renders with the activated phone
  and screenshots the reports card. It does not press the send button.

Run: `node tests/eye-ops-proof.mjs`

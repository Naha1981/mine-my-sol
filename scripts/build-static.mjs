import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  env: { ...process.env, STATIC_SPA: "1" },
  stdio: "inherit",
});
// Cloudflare serves index.html as the SPA fallback. TanStack emits _shell.html.
copyFileSync(".output/public/_shell.html", ".output/public/index.html");

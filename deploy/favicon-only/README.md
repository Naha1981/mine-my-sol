# Icon-only serving layer

Approved 2 November 2026. This does not rebuild the app or upload static assets.
Deploy with the Cloudflare module upload API using keep_assets:true,
main_module:worker.mjs, compatibility_date:2025-09-01, ASSETS assets binding,
and assets.config.run_worker_first:true with the existing SPA not_found_handling.
Include worker.mjs as application/javascript+module and icons.json as
application/json. icons.json contains only the six approved public icon files.

Rollback: restore100% traffic to Cloudflare version
f9d9aeba-8476-4793-a8d0-c35871829918 via the deployments API. No domain or route
change is made. The old24Oct static asset set remains attached verbatim.

Tests: node --test deploy/favicon-only/worker.test.mjs

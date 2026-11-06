# Maintainer notes

Technical reference only, not customer-facing wording. Reviewed 6 November 2026. These commands are defined in the source, not newly executed in this documentation pass. Use the repository lockfile and established CI/runtime versions. No release or production migration is authorised by this file.

## Defined commands

```sh
npm run dev
npm run build
npm run test
npm run lint
npm run build:static
```

## Build and release

The previous README mixed requested scope with implementation. That build brief is not acceptance evidence. Retain and consult `roadmap.md`, migration histories, `scripts/build-static.mjs`, `worker/`, `deploy/` and the route tests before changing the release. A successful source build is not evidence a database migration is applied.

## Configuration and costs

Use current example environment schemas and source reads to determine required configuration. Examples contain placeholders only. Do not print credentials or replace licence/attribution files. Do not activate messages, payments, migrations or publication without the applicable approval. No unlimited free service or permanent quota is promised.

# MineMySol

Manage mining projects, contractors and operations in one place.

Product page: https://minemysol.nahalabs.co.za/

## What this repository contains

- The implementation contains project and contractor workflows, configurable document readiness, FleetPulse and Operations Eye.
- Document readiness means complete against a configured checklist, not officially accepted by a buyer.

## Current limits

- Operations views may contain sample data; keep that label visible. No real mine telemetry is established by this README.
- The current public HTML responds with the MineMySol title. Fresh signed-in end-to-end acceptance was not repeated during this documentation pass.
- No tender submission, award, external report or spending is authorised by this document.

## Verification

Documentation checked 6 November 2026 against current source, available public pages and recorded test evidence. Source implementation and live acceptance are separate. No new customer data, message, payment or production change was created in this review.

Source references:
- `src/routes/index.tsx`
- `src/routes/eye.tsx`
- `src/lib/readiness.ts`
- `src/test/fleetpulse.test.ts`

## Maintaining this repository

See [MAINTAINER.md](MAINTAINER.md) for setup, checks and retained technical notes. Keep credentials in private environment settings, never in this README. Existing licence and copyright files remain unchanged.

#!/usr/bin/env bash
# Static build for Cloudflare Workers static assets (SPA fallback).
# Needs env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
# (public values; project id clylxokjidjilaazcjjt, URL https://clylxokjidjilaazcjjt.supabase.co).
# Then: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler deploy --config deploy/cloudflare/wrangler.jsonc
set -euo pipefail
export STATIC_SPA=1 SUPABASE_URL="$VITE_SUPABASE_URL" SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY"
unset VITE_HASH_ROUTER
npm ci
npm run build
rm -rf deploy/cloudflare/dist && mkdir -p deploy/cloudflare/dist
cp -r .output/public/* deploy/cloudflare/dist/
cp deploy/cloudflare/dist/_shell.html deploy/cloudflare/dist/index.html
rm -f deploy/cloudflare/dist/_headers

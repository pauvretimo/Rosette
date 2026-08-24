# Self-hosted Firefox updates

Firefox's `update_url` mechanism only tells Firefox where to *check* for a newer version — the
version it finds still has to be signed by Mozilla. This directory doesn't replace that step; it
just hosts what AMO gives back.

## One-time setup

1. `cp .env.example .env` and fill in your real domain, Traefik network name, and cert
   resolver name. `docker-compose.yml` and `generate-manifest.mjs` both read this file — it's the
   single place those values live (`.env` is gitignored; `.env.example` isn't).
2. Also update `update_url` in `../wxt.config.ts` to `https://<ROSETTE_UPDATES_DOMAIN>/rosette/updates.json`
   using the same domain, then rebuild (`npm run build:firefox` from the project root). This one
   can't read `.env` itself — it's baked into the extension at build time, so it has to match by
   hand. `generate-manifest.mjs` warns you if the two ever drift apart.
3. `docker compose up -d` from this directory. `updates/` is served at
   `https://<ROSETTE_UPDATES_DOMAIN>/rosette/`.

## Per-release workflow

1. Bump the version in `package.json`, then `npm run zip:firefox` from the project root — this
   produces `.output/rosette-<version>-firefox.zip` and a matching `-sources.zip`.
2. Submit both zips on the [AMO Developer Hub](https://addons.mozilla.org/developers/) as
   **unlisted** (not listed publicly). Wait for the automated review — you'll get back a signed
   `.xpi` file. This is the mandatory, non-optional step; nothing here can skip it.
3. From this directory:
   ```
   node generate-manifest.mjs <version> <path-to-signed.xpi>
   ```
   This copies the signed xpi into `updates/`, computes its sha256, and adds/updates its entry
   in `updates/updates.json`.
4. Commit nothing (the `.xpi` and `updates.json` are gitignored — they're deployment artifacts,
   regenerated from AMO's output each release) — just leave the container running; it serves the
   updated directory immediately, no restart needed.

Existing installs pick up the new version on their next background update check (Firefox checks
roughly every day, and on browser restart). First-time installs still need the signed `.xpi`
downloaded and opened manually once — share a direct link to it, e.g.
`https://<your-domain>/rosette/rosette-<version>.xpi`.

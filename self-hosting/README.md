# Self-hosted updates

Both browsers' `update_url` mechanisms only tell the browser where to *check* for a newer
version — the package it finds still has to be signed. This directory doesn't replace that step;
it hosts what comes out of it. The two browsers work quite differently:

|                    | Firefox                                  | Chrome                                    |
|--------------------|-------------------------------------------|--------------------------------------------|
| Who signs it        | Mozilla (AMO, automated review)           | You, with your own keypair                |
| Manifest format      | JSON                                      | XML ("gupdate", Google's Omaha format)    |
| Works on unmanaged installs? | Yes — any Firefox, no policy needed | **No** — only for extensions installed via `ExtensionInstallForcelist` policy |

The Chrome column's last row is the big one: on Windows/macOS, `update_url` is silently ignored
unless the machine is domain-joined, Entra ID-joined, or enrolled in **Chrome Enterprise Core**
(a genuinely free Google offering, distinct from paid ChromeOS device management — you still have
to create an admin console and enroll the browser, it's a real setup step, just not a purchase).
Linux is the only platform where this works on a fully unmanaged install. If none of that applies
to you, "Load unpacked" in Developer Mode remains the practical option for Chrome — see the
project root [README.md](../README.md).

## One-time setup

1. From the **project root**: `cp .env.example .env` and fill in your real domain, Traefik
   network name, and cert resolver name. This one file is the single source of truth — the
   build (`wxt.config.ts`), `docker-compose.yml`, and both `generate-*-manifest.mjs` scripts all
   read it, so there's nothing to keep in sync by hand and no build-time placeholder to edit.
2. From the **project root**: `npm run self-host:up` (wraps `docker compose --env-file .env -f
   self-hosting/docker-compose.yml up -d` — root `.env`, not a copy inside this directory;
   there deliberately isn't one). `updates/firefox/` and `updates/chrome/` end up served at
   `https://<domain>/rosette/firefox/` and `https://<domain>/rosette/chrome/`. `self-host:down`
   and `self-host:logs` work the same way.
3. Rebuild the extension (`npm run build` / `npm run build:firefox`) so it picks up the real
   domain — it only reads `.env` at build time, so this needs to happen after step 1, and again
   any time the domain changes.

## Firefox: per-release workflow

1. Bump the version in `package.json`, then `npm run zip:firefox` from the project root —
   produces `.output/rosette-<version>-firefox.zip` and a matching `-sources.zip`.
2. Submit both on the [AMO Developer Hub](https://addons.mozilla.org/developers/) as
   **unlisted**. Wait for automated review; you get back a signed `.xpi`. Mandatory, non-optional
   — nothing here can skip it.
3. `node generate-firefox-manifest.mjs <version> <path-to-signed.xpi>` — copies the xpi into
   `updates/firefox/`, computes its sha256, updates `updates/firefox/updates.json`.
4. Nothing to restart — the container serves the updated directory immediately. Existing installs
   pick it up on their next background check (roughly daily, and on browser restart). First-time
   installs still need the signed `.xpi` downloaded and opened once — share a direct link, e.g.
   `https://<domain>/rosette/firefox/rosette-<version>.xpi`.

## Chrome: per-release workflow

1. `npm run build` from the project root (produces `.output/chrome-mv3/`, unpacked).
2. Pack it into a signed `.crx`:
   ```
   chrome.exe --pack-extension=..\.output\chrome-mv3 --pack-extension-key=.\chrome-key.pem
   ```
   **First time only:** omit `--pack-extension-key` — Chrome generates `chrome-key.pem`
   alongside the `.crx`. **Back this file up immediately and never lose or regenerate it.** The
   extension's id is derived from this key; a new key means a new id, which means every existing
   install becomes a permanently separate, unrelated extension as far as Chrome is concerned —
   there's no recovery from losing it other than everyone reinstalling fresh.
3. `node generate-chrome-manifest.mjs <version> <path-to-.crx> <path-to-chrome-key.pem>` — copies
   the crx into `updates/chrome/`, derives the extension id from the key, writes
   `updates/chrome/updates.xml`, and prints the exact policy value you need next.
4. In your Chrome Enterprise Core admin console (or Group Policy, if domain-joined instead),
   set `ExtensionInstallForcelist` to include the value the script printed:
   `<extension-id>;https://<domain>/rosette/chrome/updates.xml`. This step happens in Google's
   admin UI / your policy system, not in this repo.

Chrome checks policy-installed extensions' `update_url` every few hours; there's no separate
"first install" link to share the way Firefox has — the policy itself pushes the install.

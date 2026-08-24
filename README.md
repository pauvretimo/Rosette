# Rosette

Auto-translates Discord web app messages locally using Mozilla's Bergamot WASM engine, caches
translations on-device (encrypted), and translates nothing by default — you opt in per server,
per channel, or per message. Cross-browser: Firefox and Chromium, both Manifest V3.

## Development

**Prerequisites:** Node 18+ (tested on Node 22), npm.

```
npm install       # also runs `wxt prepare` via postinstall
npm run dev        # Chromium, auto-reload
npm run dev:firefox # Firefox, drives web-ext run, auto-reload
npm run compile     # tsc --noEmit — run before committing
```

`npm run dev`/`dev:firefox` launch a real browser profile with the extension loaded and rebuild
on save. For a one-off manual load instead:

- **Chrome/Chromium:** `npm run build` → `chrome://extensions` → enable Developer Mode → **Load
  unpacked** → select `.output/chrome-mv3/`.
- **Firefox:** `npm run build:firefox` → `about:debugging#/runtime/this-firefox` → **Load
  Temporary Add-on** → select `.output/firefox-mv3/manifest.json`. A manifest or permission
  change requires removing and re-loading (a plain reload doesn't always pick those up); a
  content-script/CSS-only change just needs a tab reload.

### Architecture

```
entrypoints/
  background.ts        MV3 background — the "vault": model cache, encrypted translation
                        cache, settings. Never runs WASM, never touches the DOM.
  discord.content.ts    Content script — owns the Bergamot Worker, the Discord DOM adapter,
                        language detection, and the actual translate calls. Scoped to one
                        tab's lifetime, so a long scroll session keeps loaded models warm.
  popup/, options/      Extension UI (vanilla TS + DOM, no framework).

src/core/               Site-agnostic: messaging protocol, IndexedDB cache + crypto, model
                        registry/cache, translation orchestration, settings, the SiteAdapter
                        interface a new site would implement.
src/adapters/discord/   The only SiteAdapter implementation — everything Discord-DOM-specific
                        lives here and nowhere else.
public/bergamot/        Vendored prebuilt Bergamot WASM engine (MPL-2.0, see NOTICE.md) +
                        rosette-worker.js, our own hand-written classic-Worker wrapper around it.
```

Background and content script talk over a typed request/response protocol
(`src/core/messaging/protocol.ts` + `rpc.ts`) — the content script never touches IndexedDB
directly (its `indexedDB` would resolve to discord.com's origin, not the extension's).

See **[MAINTENANCE.md](./MAINTENANCE.md)** for the non-obvious platform quirks this codebase
works around — worth reading before touching the worker, the Discord adapter, or the context-menu
injection, since several of them look like bugs if you don't know why they're there.

## Deployment

Bump the version in `package.json` first. Then:

**Chromium** — `npm run zip` → `.output/rosette-<version>-chrome.zip`. Either submit to the
Chrome Web Store, or for personal/unmanaged use, unzip and **Load unpacked** (see above) — Chrome
only supports true self-hosted auto-updates via Enterprise Policy on managed devices.

**Firefox** — `npm run zip:firefox` → produces the extension zip *and* a matching sources zip
(AMO requires the source when a submission bundles built/minified code, which ours does). Submit
both on the [AMO Developer Hub](https://addons.mozilla.org/developers/) as **unlisted** — this is
mandatory even for self-hosting, since stock Firefox refuses unsigned extensions. You get back a
signed `.xpi`. From there, **[self-hosting/README.md](./self-hosting/README.md)** covers hosting
it yourself (Docker + Traefik) with working auto-updates, including a script that generates the
update manifest for you.

## Maintenance

See **[MAINTENANCE.md](./MAINTENANCE.md)**.

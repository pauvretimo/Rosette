# Maintenance

## Platform quirks this codebase works around

These all look like plausible bugs if you don't know the backstory — each one cost real debugging
time to pin down, so the reasoning is captured here instead of only in code comments.

**Firefox won't `new Worker(moz-extension://...)` from a content script.**
Firefox treats a Worker spawned from a content script as same-origin with the *host page*, so a
`moz-extension://` script URL gets rejected as cross-origin — even with `web_accessible_resources`
declared (that only covers `fetch()`/`<script>`-style resource loading, not Worker construction
itself). This is a real, long-standing platform bug: [Bugzilla #1334891](https://bugzilla.mozilla.org/show_bug.cgi?id=1334891),
open since 2017. The workaround, in `src/core/translation/bergamot-worker-client.ts`: fetch the
worker script's *text* ourselves, wrap it in a `Blob`, and construct the Worker from a `blob:`
URL instead. This relies on the host page's CSP allowing `blob:` script sources — Discord's does.
If a future Discord CSP change removes `blob:` from `script-src`, this breaks and needs a
different approach (there isn't a clean one currently known).

**Firefox's `fetch()` doesn't reliably get the CORS bypass `host_permissions` is supposed to
grant privileged extension contexts** (confirmed live against `storage.googleapis.com` — a
real, reproducible CORS block from the background context despite the origin being declared in
`host_permissions`). `XMLHttpRequest` does get the bypass correctly. `src/core/net/xhr.ts` wraps
both cross-origin calls this project makes (registry JSON, model file downloads) in XHR instead of
fetch specifically because of this. Don't switch them back to `fetch()` without re-testing.

**`web_accessible_resources` is still required**, separately from the blob-URL workaround above —
it's what lets the content script `fetch()` the worker script's text, and the vendored engine
`.js`/`.wasm` files, in the first place. See `wxt.config.ts`.

**Discord's React fully controls `className` on message elements, but not `style`.** Hiding the
original message text (`discord-adapter.ts`'s `setOriginalContentVisible`) uses a direct
`element.style.display = 'none'` mutation, not a CSS class — a class added via `classList.add()`
gets silently wiped the next time React re-renders that element (e.g. a reaction count changing),
un-hiding the original text. Inline `style` isn't a prop React manages on this element, so it
survives re-renders. If original text ever starts reappearing after a reaction/edit, this is the
first place to check.

**Discord's context menu container gets reused across opens** (or is built in multiple mount
steps) rather than being freshly added to the DOM each time — a `MutationObserver` matching only
against `mutation.addedNodes` silently never finds it after the first open. The fix in
`observeManualTranslateRequests` re-checks `document.querySelector(MESSAGE_CONTEXT_MENU_SELECTOR)`
on *every* mutation instead of inspecting just what changed. Don't "optimize" this back to an
addedNodes check without re-testing across several menu opens in the same session.

**Discord's context-menu items are click-delegated, keyed by their original `id`** — which we
deliberately strip when cloning a template item (to avoid Discord's handler misinterpreting our
node as a real action). A per-item `addEventListener('click', ...)` alone never fires, because
whatever ancestor owns Discord's delegated handler swallows it first. The fix: a *capture-phase*
listener on `document` (fires before any descendant listener, registered once at content-script
load — see `onDocumentClick`). Do **not** add `stopPropagation()`/`preventDefault()` there even
though it's tempting — that also blocks Discord's own "clicking any item closes the menu"
behavior, leaving the menu stuck open and visually covering the (correctly) updated message
underneath.

**A reply message's row contains a second, hidden element matching the generic
`[id^="message-content-"]` prefix** — a `display:none` quoted-preview copy of the *original*
message being replied to, carrying that original message's id, not the row's own. Always resolve
a row's content via `messageContentSelector(exactMessageId)` (exact id match), never the prefix
selector, or you'll silently translate/hide the wrong element. `MESSAGE_CONTENT_SELECTOR` (the
prefix form) is kept only for "does this row have a message at all" checks.

## Updating the vendored Bergamot engine

`public/bergamot/bergamot-translator-worker.js` + `.wasm` are unmodified build artifacts copied
from `mozilla/firefox-translations` (MPL-2.0 — see `public/bergamot/NOTICE.md`), not built from
source here. To update:

1. Clone `mozilla/firefox-translations` and find the current
   `extension/controller/translation/bergamot-translator-worker.js` +
   `extension/model/static/translation/bergamot-translator-worker.wasm`.
2. Replace both files in `public/bergamot/`, and update the version string noted in
   `NOTICE.md` (the glue JS embeds it as `BERGAMOT_VERSION_FULL`, near the top of the file).
3. Re-test translation end-to-end — the Emscripten-bound API surface
   (`Module.BlockingService`, `Module.TranslationModel`, `Module.AlignedMemory`, ...) that
   `public/bergamot/rosette-worker.js` calls has been stable across releases so far, but hasn't
   been guaranteed stable by upstream.

## Discord changing its DOM

`src/adapters/discord/discord-selectors.ts` keys off `id`/`data-*`/`role` attributes deliberately
(never CSS module class names, which rotate every Discord deploy). If Discord ships a redesign
that changes these, the extension's own selector health check (`runHealthCheck` in
`discord-adapter.ts`, wired up in `discord.content.ts`) sets a red badge and fires one
notification per extension version — so it fails loudly rather than silently. Start debugging by
right-clicking the affected element in a live Discord session and comparing against the current
selectors; there's no way to catch this ahead of a live redesign shipping.

## Model licensing

Per-language-pair model licensing on the GCS bucket
(`storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data`) hasn't been
individually verified beyond the repo-level MPL-2.0 license — worth checking before distributing
publicly, especially for whichever pairs you actually ship (at minimum ja↔en, this project's
original target).

## Dependencies

`wxt` and `franc-min` are the only two real runtime/build dependencies. `npm outdated` to check;
re-run the full manual test checklist (README's Development section) after bumping `wxt`
specifically, since it owns the manifest generation this whole project's cross-browser behavior
depends on.

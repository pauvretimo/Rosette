import { DiscordAdapter } from '../src/adapters/discord/discord-adapter';
import { MESSAGE_ROW_SELECTOR } from '../src/adapters/discord/discord-selectors';
import { callBackground } from '../src/core/messaging/rpc';
import { LANGUAGE_OPTIONS } from '../src/core/settings/language-options';
import { SettingsCache } from '../src/core/settings/settings-store';
import { TranslationClient } from '../src/core/translation/translation-client';
import type { ExtractedMessage } from '../src/core/translation/types';

const HEALTH_CHECK_DELAY_MS = 4000;
const HEALTH_CHECK_MAX_ATTEMPTS = 4;

export default defineContentScript({
  // Discord's actual web client lives at /channels/<guildId>/<channelId> (guildId is "@me" for
  // DMs) — "/app" is a stale pattern from Discord's old hash-router era and never matches a
  // real page, which is why the content script previously never ran at all.
  matches: ['https://discord.com/channels/*'],
  runAt: 'document_idle',
  main() {
    const adapter = new DiscordAdapter();
    const translationClient = new TranslationClient();
    const settings = new SettingsCache();

    async function handleMessage(msg: ExtractedMessage, manual: boolean, forcedSourceLang?: string) {
      const scope = adapter.getScopeIds(new URL(window.location.href));
      const outcome = await translationClient.translateMessage(msg, scope, { manual, forcedSourceLang });

      if (outcome.status === 'translated') {
        adapter.injectTranslation(msg, outcome.result, settings.current.showOriginalSubtext);
      } else if (outcome.status === 'skipped' && manual) {
        // An explicit click should never resolve in total silence, even when there's no
        // translation to show.
        if (outcome.reason === 'language-not-detected') {
          adapter.injectLanguagePicker(msg, LANGUAGE_OPTIONS, (code) => {
            handleMessage(msg, true, code).catch((err) => console.error('[rosette] forced-language translate failed', err));
          });
        } else {
          adapter.injectStatus(msg, 'Already in your target language');
        }
      } else if (outcome.status === 'error') {
        // eslint-disable-next-line no-console
        console.warn('[rosette] translation failed', outcome.message);
        if (manual) adapter.injectStatus(msg, 'Translation failed — see the console for details');
      }
    }

    let sawHealthyMessage = false;

    async function onMessageMounted(msg: ExtractedMessage) {
      // A real message row successfully extracted is proof positive the page is healthy —
      // report it immediately so a stale failure badge from an earlier slow page load clears
      // as soon as we have real evidence, rather than waiting on the next timer/nav-triggered
      // check (see scheduleHealthCheck below for the "genuinely broken" fallback path).
      if (!sawHealthyMessage) {
        sawHealthyMessage = true;
        callBackground({ type: 'HEALTH_CHECK_RESULT', adapterId: adapter.id, ok: true, details: '' }).catch(() => {});
      }
      await settings.whenReady();
      await handleMessage(msg, false);
    }

    const stopObserving = adapter.observe((msg) => {
      onMessageMounted(msg).catch((err) => console.error('[rosette] message handling failed', err));
    });

    const stopObservingContextMenu = adapter.observeManualTranslateRequests((msg) => {
      handleMessage(msg, true).catch((err) => console.error('[rosette] manual translate failed', err));
    });

    window.addEventListener(
      'unload',
      () => {
        stopObserving();
        stopObservingContextMenu();
      },
      { once: true },
    );

    // A message row is only ever auto-translate-checked once, at the moment it's first scanned
    // (see the `processed` dedup in adapter.observe — needed so our own DOM injections don't
    // re-trigger the mutation observer forever). That means enabling a server/channel from the
    // popup after messages are already on screen would otherwise leave them stuck showing only
    // the manual trigger. Re-run the check directly (bypassing the dedup, which only guards the
    // mount-detection path) for every currently visible row whenever settings change.
    settings.onChange(() => {
      document.querySelectorAll(MESSAGE_ROW_SELECTOR).forEach((row) => {
        const msg = adapter.extractMessage(row);
        if (msg) handleMessage(msg, false).catch((err) => console.error('[rosette] re-check failed', err));
      });
    });

    function scheduleHealthCheck(attempt = 1) {
      setTimeout(() => {
        // Already confirmed healthy via a real message elsewhere (e.g. this check was queued by
        // a stale SPA-navigation event that fired before onMessageMounted's own report landed).
        if (sawHealthyMessage) return;

        const ok = adapter.runHealthCheck();
        if (ok) {
          callBackground({ type: 'HEALTH_CHECK_RESULT', adapterId: adapter.id, ok: true, details: '' }).catch(() => {});
          return;
        }

        // Discord can just be slow to render (cold load, slow connection) rather than actually
        // broken — retry a few times before reporting failure, so a temporary race doesn't
        // leave the badge stuck red for the rest of the session.
        if (attempt < HEALTH_CHECK_MAX_ATTEMPTS) {
          scheduleHealthCheck(attempt + 1);
          return;
        }

        callBackground({
          type: 'HEALTH_CHECK_RESULT',
          adapterId: adapter.id,
          ok: false,
          details: `no messages found at ${window.location.pathname} after ${attempt} attempts`,
        }).catch(() => {});
      }, HEALTH_CHECK_DELAY_MS);
    }

    // Discord is a SPA — channel switches don't reload this content script, so a Discord
    // redesign shipped mid-session needs its own re-check, not just one at initial load.
    // Patching history here affects the page's own navigation too, since `history` is a
    // DOM-backed object shared across the isolated content-script world and the page's world.
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method];
      history[method] = function patched(...args: Parameters<History[typeof method]>) {
        const result = original.apply(this, args);
        scheduleHealthCheck();
        return result;
      };
    }
    window.addEventListener('popstate', () => scheduleHealthCheck());

    scheduleHealthCheck();

    console.log('[rosette] discord content script loaded');
  },
});

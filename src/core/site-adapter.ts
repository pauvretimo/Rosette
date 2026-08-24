import type { LanguageOption } from './settings/language-options';
import type { ScopeIds } from './settings/scope-matcher';
import type { ExtractedMessage, TranslateResult } from './translation/types';

export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;

  /** Maps a URL to the generic group/subgroup vocabulary the settings schema uses, so core
   *  code never needs to know Discord calls them "servers" and "channels". */
  getScopeIds(url: URL): ScopeIds;

  /** Starts observing the page for new/changed messages. Returns a teardown function. */
  observe(onMessageMounted: (msg: ExtractedMessage) => void): () => void;

  extractMessage(element: Element): ExtractedMessage | null;

  injectTranslation(msg: ExtractedMessage, result: TranslateResult, showOriginalSubtext: boolean): void;
  removeTranslation(msg: ExtractedMessage): void;

  /** Shows a brief, self-dismissing note under a message — used for manual translate requests
   *  that didn't produce a translation (already in the target language, undetectable, failed),
   *  so an explicit user action never resolves in total silence. */
  injectStatus(msg: ExtractedMessage, text: string): void;

  /** Shows an inline language picker under a message — used when automatic detection couldn't
   *  identify the message's language, letting the user say what it actually is so translation
   *  can proceed with that instead. */
  injectLanguagePicker(msg: ExtractedMessage, options: LanguageOption[], onPick: (code: string) => void): void;

  /** Wires up whatever site-specific affordance lets the user ask for a single message to be
   *  translated on demand, regardless of auto-translate scope. Returns a teardown function. */
  observeManualTranslateRequests(onRequest: (msg: ExtractedMessage) => void): () => void;

  /** Confirms the adapter's selectors still match the live page. See discord-adapter.ts for
   *  why this exists — it's how a Discord redesign gets surfaced instead of failing silently. */
  runHealthCheck(): boolean;
}

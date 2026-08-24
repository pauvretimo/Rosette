import { computeCacheKey } from '../cache/cache-key';
import { callBackground } from '../messaging/rpc';
import { isLanguageEnabled, isScopeEnabled, type ScopeIds } from '../settings/scope-matcher';
import { SettingsCache } from '../settings/settings-store';
import { BergamotWorkerClient } from './bergamot-worker-client';
import { detectLanguage } from './language-detection';
import type { ExtractedMessage, TranslateResult } from './types';

export type TranslateOutcome =
  | { status: 'translated'; result: TranslateResult }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; message: string };

const PIVOT = 'en';

export class TranslationClient {
  private worker = new BergamotWorkerClient();
  private settings = new SettingsCache();

  async whenReady(): Promise<void> {
    await this.settings.whenReady();
  }

  private async ensurePairLoaded(sourceLang: string, destLang: string): Promise<void> {
    if (this.worker.isPairLoaded(sourceLang, destLang)) return;
    const response = await callBackground({ type: 'GET_MODEL', sourceLang, destLang });
    await this.worker.ensurePairLoaded(sourceLang, destLang, response.files);
  }

  private async ensureModelForTranslation(sourceLang: string, destLang: string): Promise<void> {
    try {
      await this.ensurePairLoaded(sourceLang, destLang);
      return;
    } catch (directError) {
      if (sourceLang === PIVOT || destLang === PIVOT) throw directError;
      // No direct model for this pair — fall back to pivoting through English, which is how
      // Bergamot covers e.g. ja -> fr (no direct ja-fr model, but ja-en and en-fr both exist).
      await this.ensurePairLoaded(sourceLang, PIVOT);
      await this.ensurePairLoaded(PIVOT, destLang);
    }
  }

  async translateMessage(
    msg: ExtractedMessage,
    scope: ScopeIds,
    opts: { manual: boolean; forcedSourceLang?: string },
  ): Promise<TranslateOutcome> {
    await this.whenReady();
    const settings = this.settings.current;
    const destLang = settings.destLang;

    const cacheKey = await computeCacheKey(msg.id, msg.text, destLang);
    const cached = await callBackground({ type: 'CACHE_GET', cacheKey });
    if (cached) {
      return { status: 'translated', result: { ...cached, fromCache: true } };
    }

    if (!opts.manual && !isScopeEnabled(scope, settings)) {
      return { status: 'skipped', reason: 'not-in-scope' };
    }

    // A forced source language means the user picked it themselves after automatic detection
    // failed — skip detection entirely rather than second-guessing their explicit choice.
    const detectedLang = opts.forcedSourceLang ?? detectLanguage(msg.text);
    if (!detectedLang) {
      return { status: 'skipped', reason: 'language-not-detected' };
    }
    if (detectedLang === destLang) {
      return { status: 'skipped', reason: 'already-target-language' };
    }
    if (!opts.manual && !isLanguageEnabled(detectedLang, settings)) {
      return { status: 'skipped', reason: 'language-not-enabled' };
    }

    try {
      await this.ensureModelForTranslation(detectedLang, destLang);
      const translatedText = await this.worker.translate(detectedLang, destLang, msg.text);
      await callBackground({ type: 'CACHE_PUT', cacheKey, translatedText, detectedLang });
      return { status: 'translated', result: { translatedText, detectedLang, fromCache: false } };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }
}

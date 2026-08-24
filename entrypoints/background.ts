import { clearTranslationCache, getCachedTranslation, putCachedTranslation } from '../src/core/cache/translation-cache';
import { reportAdapterHealthCheck } from '../src/core/health-check';
import { ensureModelFiles } from '../src/core/model/model-cache';
import { registerBackgroundHandlers } from '../src/core/messaging/rpc';
import { getSettings } from '../src/core/settings/settings-store';

export default defineBackground(() => {
  registerBackgroundHandlers({
    CACHE_GET: async (req) => getCachedTranslation(req.cacheKey),
    CACHE_PUT: async (req) => {
      await putCachedTranslation(req.cacheKey, req.translatedText, req.detectedLang);
    },
    CACHE_CLEAR: async () => {
      await clearTranslationCache();
    },
    GET_MODEL: async (req) => ensureModelFiles(req.sourceLang, req.destLang),
    GET_SETTINGS: async () => getSettings(),
    HEALTH_CHECK_RESULT: async (req) => {
      await reportAdapterHealthCheck(req.adapterId, req.ok, req.details);
    },
  });

  console.log('[rosette] background context started', { id: browser.runtime.id });
});

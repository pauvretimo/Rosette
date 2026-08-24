import type { CacheGetResponse } from '../messaging/protocol';
import { decryptString, encryptString, type EncryptedPayload } from './crypto';
import { idbClear, idbGet, idbPut, STORE_TRANSLATION_CACHE } from './db';

interface StoredEntry extends EncryptedPayload {
  detectedLang: string;
  createdAt: number;
}

export async function getCachedTranslation(cacheKey: string): Promise<CacheGetResponse | null> {
  const entry = await idbGet<StoredEntry>(STORE_TRANSLATION_CACHE, cacheKey);
  if (!entry) return null;

  const translatedText = await decryptString(entry);
  if (translatedText === null) return null; // corrupted entry: treat as cache miss, never throw

  return { translatedText, detectedLang: entry.detectedLang, createdAt: entry.createdAt };
}

export async function putCachedTranslation(
  cacheKey: string,
  translatedText: string,
  detectedLang: string,
): Promise<void> {
  const { iv, ciphertext } = await encryptString(translatedText);
  const entry: StoredEntry = { iv, ciphertext, detectedLang, createdAt: Date.now() };
  await idbPut(STORE_TRANSLATION_CACHE, cacheKey, entry);
}

export async function clearTranslationCache(): Promise<void> {
  await idbClear(STORE_TRANSLATION_CACHE);
}

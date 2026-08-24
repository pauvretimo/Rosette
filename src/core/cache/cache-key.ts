/**
 * Pure, side-effect-free cache key derivation — safe to call from the content script (to avoid
 * a round trip to background just to compute a key) as well as from background itself.
 * Keying on a short hash of the source text (not the message id alone) means an edited message
 * naturally gets a fresh cache entry instead of serving a stale translation.
 */
export async function computeCacheKey(messageId: string, sourceText: string, destLang: string): Promise<string> {
  const fingerprint = await sha256Hex(sourceText);
  const raw = `${messageId}:${fingerprint}:${destLang}`;
  return sha256Hex(raw);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

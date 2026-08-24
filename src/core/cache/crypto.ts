import { idbGet, idbPut, STORE_CRYPTO_KEYS } from './db';

const KEY_ID = 'primary';

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(STORE_CRYPTO_KEYS, KEY_ID);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await idbPut(STORE_CRYPTO_KEYS, KEY_ID, key);
  return key;
}

export interface EncryptedPayload {
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}

export async function encryptString(plaintext: string): Promise<EncryptedPayload> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv, ciphertext };
}

/**
 * Returns null on any decrypt failure (corrupted entry, restored profile, etc). This is a
 * cache, not a source of truth — the caller's job is to treat null exactly like a cache miss
 * and re-translate, never surface a decryption error to the user.
 */
export async function decryptString(payload: EncryptedPayload): Promise<string | null> {
  try {
    const key = await getOrCreateKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: payload.iv as BufferSource },
      key,
      payload.ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

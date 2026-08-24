import type { GetModelResponse, ModelFilesPayload } from '../messaging/protocol';
import { idbGet, idbPut, STORE_MODEL_BLOBS } from '../cache/db';
import { xhrGetArrayBuffer } from '../net/xhr';
import { getRegistry, resolveEntry, resolveFileUrl, type RegistryEntry } from './model-registry';

type Role = keyof ModelFilesPayload;

interface CachedBlob {
  bytes: ArrayBuffer;
  /** The owning registry entry's model-file hash, used as a version stamp for the whole pair
   *  bundle (model+lex+vocab are trained/released together, but only the model file itself
   *  carries a hash in the live registry). */
  versionHash: string;
  cachedAt: number;
}

function blobKey(sourceLang: string, destLang: string, role: Role): string {
  return `${sourceLang}-${destLang}:${role}`;
}

function rolesForEntry(entry: RegistryEntry): Array<{ role: Role; path: string }> {
  const roles: Array<{ role: Role; path: string }> = [
    { role: 'model', path: entry.files.model.path },
    { role: 'lex', path: entry.files.lexicalShortlist.path },
  ];
  if (entry.files.vocab) {
    roles.push({ role: 'vocab', path: entry.files.vocab.path });
  } else if (entry.files.srcVocab && entry.files.trgVocab) {
    roles.push({ role: 'srcvocab', path: entry.files.srcVocab.path });
    roles.push({ role: 'trgvocab', path: entry.files.trgVocab.path });
  } else {
    throw new Error(`Registry entry for ${entry.sourceLanguage}-${entry.targetLanguage} has no vocabulary files`);
  }
  return roles;
}

async function fetchAndDecompress(url: string): Promise<ArrayBuffer> {
  const compressed = await xhrGetArrayBuffer(url);
  // XHR gives us the whole compressed body in memory (no streaming body like fetch's), but
  // Blob.stream() turns it back into a ReadableStream synchronously, so DecompressionStream
  // still works the same way as it would on a streamed fetch response.
  const decompressed = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(decompressed).arrayBuffer();
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Ensures the model files for (sourceLang, destLang) are present in IndexedDB and returns them.
 * Hash-gated: an already-cached file whose stored versionHash matches the registry's current
 * model-file hash is returned without touching the network at all.
 */
export async function ensureModelFiles(sourceLang: string, destLang: string): Promise<GetModelResponse> {
  const registry = await getRegistry();
  const entry = resolveEntry(registry, sourceLang, destLang);
  if (!entry) {
    throw new Error(`No translation model available for ${sourceLang} -> ${destLang}`);
  }

  const versionHash = entry.files.model.uncompressedHash ?? '';
  const roles = rolesForEntry(entry);

  const files = {} as ModelFilesPayload;
  for (const { role, path } of roles) {
    const key = blobKey(sourceLang, destLang, role);
    const cached = await idbGet<CachedBlob>(STORE_MODEL_BLOBS, key);

    if (cached && cached.versionHash === versionHash) {
      files[role] = cached.bytes;
      continue;
    }

    const bytes = await fetchAndDecompress(resolveFileUrl(registry, path));

    if (role === 'model' && entry.files.model.uncompressedHash) {
      const actualHash = await sha256Hex(bytes);
      if (actualHash !== entry.files.model.uncompressedHash) {
        throw new Error(`Model file hash mismatch for ${sourceLang}-${destLang} (expected ${entry.files.model.uncompressedHash}, got ${actualHash})`);
      }
    }

    const toStore: CachedBlob = { bytes, versionHash, cachedAt: Date.now() };
    await idbPut(STORE_MODEL_BLOBS, key, toStore);
    files[role] = bytes;
  }

  return { architecture: entry.architecture, files };
}

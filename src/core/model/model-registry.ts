import { xhrGetJson } from '../net/xhr';

const REGISTRY_URL =
  'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json';
const REGISTRY_STORAGE_KEY = 'rosetteModelRegistry';
const REGISTRY_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type Architecture = 'tiny' | 'base' | 'base-memory';
const ARCHITECTURE_PREFERENCE: Architecture[] = ['tiny', 'base', 'base-memory'];

interface RegistryFileRef {
  path: string;
  uncompressedSize?: number;
  uncompressedHash?: string;
}

export interface RegistryEntry {
  architecture: Architecture;
  releaseStatus?: string;
  sourceLanguage: string;
  targetLanguage: string;
  files: {
    model: RegistryFileRef;
    lexicalShortlist: RegistryFileRef;
    vocab?: RegistryFileRef;
    srcVocab?: RegistryFileRef;
    trgVocab?: RegistryFileRef;
  };
}

interface RegistryDocument {
  generated: string;
  baseUrl: string;
  models: Record<string, RegistryEntry[]>;
}

interface StoredRegistry {
  fetchedAt: number;
  document: RegistryDocument;
}

async function fetchRegistry(): Promise<RegistryDocument> {
  return xhrGetJson<RegistryDocument>(REGISTRY_URL);
}

export async function getRegistry(): Promise<RegistryDocument> {
  const stored = await browser.storage.local.get(REGISTRY_STORAGE_KEY);
  const cached = stored[REGISTRY_STORAGE_KEY] as StoredRegistry | undefined;
  if (cached && Date.now() - cached.fetchedAt < REGISTRY_STALE_MS) {
    return cached.document;
  }

  const document = await fetchRegistry();
  const toStore: StoredRegistry = { fetchedAt: Date.now(), document };
  await browser.storage.local.set({ [REGISTRY_STORAGE_KEY]: toStore });
  return document;
}

/** Picks the best available entry for a direct (non-pivoted) language pair, tiny first. */
export function resolveEntry(document: RegistryDocument, sourceLang: string, destLang: string): RegistryEntry | null {
  const candidates = document.models[`${sourceLang}-${destLang}`];
  if (!candidates || candidates.length === 0) return null;

  const released = candidates.filter((c) => !c.releaseStatus || c.releaseStatus === 'Release');
  const pool = released.length > 0 ? released : candidates;

  for (const architecture of ARCHITECTURE_PREFERENCE) {
    const match = pool.find((c) => c.architecture === architecture);
    if (match) return match;
  }
  return pool[0] ?? null;
}

export function resolveFileUrl(document: RegistryDocument, path: string): string {
  return `${document.baseUrl}/${path}`;
}

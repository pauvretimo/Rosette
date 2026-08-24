export interface CacheGetRequest {
  type: 'CACHE_GET';
  cacheKey: string;
}

export interface CacheGetResponse {
  translatedText: string;
  detectedLang: string;
  createdAt: number;
}

export interface CachePutRequest {
  type: 'CACHE_PUT';
  cacheKey: string;
  translatedText: string;
  detectedLang: string;
}

export interface CacheClearRequest {
  type: 'CACHE_CLEAR';
}

export interface GetModelRequest {
  type: 'GET_MODEL';
  sourceLang: string;
  destLang: string;
}

/**
 * Raw (decompressed) bytes for one leg of a translation model, keyed by the role name the
 * Marian config / AlignedMemory alignment table uses (see bergamot-worker-wrapper.ts). Either
 * `vocab` (shared vocabulary, most European pairs) or both `srcvocab`+`trgvocab` (e.g. ja-en)
 * will be present, never both shapes at once.
 */
export interface ModelFilesPayload {
  model: ArrayBuffer;
  lex: ArrayBuffer;
  vocab?: ArrayBuffer;
  srcvocab?: ArrayBuffer;
  trgvocab?: ArrayBuffer;
}

export interface GetModelResponse {
  architecture: 'tiny' | 'base' | 'base-memory';
  files: ModelFilesPayload;
}

export interface GetModelProgress {
  type: 'MODEL_DOWNLOAD_PROGRESS';
  sourceLang: string;
  destLang: string;
  bytesLoaded: number;
  bytesTotal: number;
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface HealthCheckResultRequest {
  type: 'HEALTH_CHECK_RESULT';
  adapterId: string;
  ok: boolean;
  details: string;
}

export type BackgroundRequest =
  | CacheGetRequest
  | CachePutRequest
  | CacheClearRequest
  | GetModelRequest
  | GetSettingsRequest
  | HealthCheckResultRequest;

export type BackgroundRequestMap = {
  CACHE_GET: { req: CacheGetRequest; res: CacheGetResponse | null };
  CACHE_PUT: { req: CachePutRequest; res: void };
  CACHE_CLEAR: { req: CacheClearRequest; res: void };
  GET_MODEL: { req: GetModelRequest; res: GetModelResponse };
  GET_SETTINGS: { req: GetSettingsRequest; res: import('../settings/settings-schema').RosetteSettings };
  HEALTH_CHECK_RESULT: { req: HealthCheckResultRequest; res: void };
};

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

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

/** One in-flight model download, identified by language pair — there's no meaningful
 *  byte-accurate progress to report (the registry only lists uncompressed sizes, but downloads
 *  transfer compressed .gz bytes), so this only tracks which pairs are currently downloading. */
export interface DownloadStateEntry {
  sourceLang: string;
  destLang: string;
}

export interface GetDownloadStateRequest {
  type: 'GET_DOWNLOAD_STATE';
}

/** Pushed from background to any open extension page (currently just the popup) whenever the
 *  active-download set changes, so a popup left open during a download updates live instead of
 *  only reflecting whatever GET_DOWNLOAD_STATE returned at open time. */
export interface DownloadStateChangedMessage {
  type: 'MODEL_DOWNLOAD_STATE_CHANGED';
  active: DownloadStateEntry[];
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
  | HealthCheckResultRequest
  | GetDownloadStateRequest;

export type BackgroundRequestMap = {
  CACHE_GET: { req: CacheGetRequest; res: CacheGetResponse | null };
  CACHE_PUT: { req: CachePutRequest; res: void };
  CACHE_CLEAR: { req: CacheClearRequest; res: void };
  GET_MODEL: { req: GetModelRequest; res: GetModelResponse };
  GET_SETTINGS: { req: GetSettingsRequest; res: import('../settings/settings-schema').RosetteSettings };
  HEALTH_CHECK_RESULT: { req: HealthCheckResultRequest; res: void };
  GET_DOWNLOAD_STATE: { req: GetDownloadStateRequest; res: DownloadStateEntry[] };
};

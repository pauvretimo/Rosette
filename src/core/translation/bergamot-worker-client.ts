import type { ModelFilesPayload } from '../messaging/protocol';

let nextRequestId = 1;

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Content-script-side owner of the classic Worker running the vendored Bergamot WASM engine.
 * One instance per tab, kept warm for the tab's lifetime so repeated translations in the same
 * language pair don't re-instantiate the WASM module.
 */
export class BergamotWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingEntry>();
  private initPromise: Promise<void>;
  private loadedPairs = new Set<string>();

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const workerUrl = browser.runtime.getURL('/bergamot/rosette-worker.js');

    // Firefox refuses `new Worker(moz-extension://...)` directly from a content script — the
    // Worker is treated as same-origin with the host page, so a moz-extension:// script URL is
    // rejected as cross-origin even though web_accessible_resources permits fetching it
    // (Firefox bug 1334891, open since 2017). Fetching the script's text ourselves and building
    // the Worker from a blob: URL sidesteps that restriction; it relies on the host page's CSP
    // allowing blob: script sources, which Discord's does.
    const scriptText = await fetch(workerUrl).then((r) => r.text());
    const blobUrl = URL.createObjectURL(new Blob([scriptText], { type: 'text/javascript' }));

    const worker = new Worker(blobUrl);
    this.worker = worker;
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      // eslint-disable-next-line no-console
      console.error('[rosette] worker error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
    };

    await new Promise<void>((resolve, reject) => {
      this.pending.set(0, { resolve: () => resolve(), reject });
      worker.postMessage({
        cmd: 'init',
        engineScriptUrl: browser.runtime.getURL('/bergamot/bergamot-translator-worker.js'),
        engineWasmUrl: browser.runtime.getURL('/bergamot/bergamot-translator-worker.wasm'),
      });
    });
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (message.type === 'initialized') {
      this.pending.get(0)?.resolve(undefined);
      this.pending.delete(0);
      return;
    }

    const requestId = message.requestId as number | undefined;
    if (requestId === undefined) return;
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);

    if (message.type === 'error') {
      entry.reject(new Error((message.message as string) ?? 'Unknown worker error'));
    } else {
      entry.resolve(message);
    }
  }

  private async send(message: Record<string, unknown>): Promise<unknown> {
    await this.whenReady();
    const requestId = nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker!.postMessage({ ...message, requestId });
    });
  }

  async whenReady(): Promise<void> {
    return this.initPromise;
  }

  async ensurePairLoaded(sourceLang: string, destLang: string, files: ModelFilesPayload): Promise<void> {
    const key = `${sourceLang}-${destLang}`;
    if (this.loadedPairs.has(key)) return;
    await this.send({ cmd: 'loadModel', sourceLang, destLang, files });
    this.loadedPairs.add(key);
  }

  isPairLoaded(sourceLang: string, destLang: string): boolean {
    return this.loadedPairs.has(`${sourceLang}-${destLang}`);
  }

  async translate(sourceLang: string, destLang: string, text: string): Promise<string> {
    const result = (await this.send({ cmd: 'translate', sourceLang, destLang, text })) as {
      translatedText: string;
    };
    return result.translatedText;
  }
}

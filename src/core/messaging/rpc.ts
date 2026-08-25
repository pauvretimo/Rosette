import type { BackgroundRequest, BackgroundRequestMap, DownloadStateChangedMessage } from './protocol';

/**
 * Typed wrapper around browser.runtime.sendMessage for the content-script/popup -> background
 * request/response direction.
 */
export async function callBackground<T extends BackgroundRequest>(
  request: T,
): Promise<BackgroundRequestMap[T['type']]['res']> {
  return browser.runtime.sendMessage(request);
}

/**
 * Background -> any open extension page (currently just the popup, for live download-state
 * updates). Fire-and-forget: `sendMessage` rejects when nothing is listening (e.g. no popup
 * open), which is the expected common case, not an error.
 */
export function broadcastFromBackground(message: DownloadStateChangedMessage): void {
  browser.runtime.sendMessage(message).catch(() => {});
}

type Handler<K extends keyof BackgroundRequestMap> = (
  req: BackgroundRequestMap[K]['req'],
) => Promise<BackgroundRequestMap[K]['res']>;

export type Handlers = { [K in keyof BackgroundRequestMap]: Handler<K> };

function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  return typeof message === 'object' && message !== null && typeof (message as { type?: unknown }).type === 'string';
}

export function registerBackgroundHandlers(handlers: Handlers): void {
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    if (!isBackgroundRequest(message)) return undefined;
    const handler = handlers[message.type] as (req: BackgroundRequest) => Promise<unknown>;
    if (!handler) return undefined;
    return handler(message);
  });
}

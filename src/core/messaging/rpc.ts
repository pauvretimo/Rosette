import type { BackgroundRequest, BackgroundRequestMap } from './protocol';

/**
 * Typed wrapper around browser.runtime.sendMessage for the content-script -> background
 * direction. Background only ever replies to requests; it never initiates messages to the
 * content script (model-download progress is polled via GET_MODEL, not pushed), so this is
 * the only RPC helper the project needs for now.
 */
export async function callBackground<T extends BackgroundRequest>(
  request: T,
): Promise<BackgroundRequestMap[T['type']]['res']> {
  return browser.runtime.sendMessage(request);
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

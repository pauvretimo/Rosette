/**
 * Firefox's `fetch()` does not reliably get the CORS bypass that `host_permissions` grants to
 * privileged extension contexts (background) — confirmed by a real CORS block against the
 * model registry's GCS bucket, which sends no Access-Control-Allow-Origin header.
 * XMLHttpRequest does get that bypass, so it's used for both cross-origin calls this project
 * makes (registry JSON, model file downloads) instead of fetch.
 */

function xhrGet(url: string, responseType: XMLHttpRequestResponseType): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = responseType;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new Error(`GET ${url} failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`GET ${url} failed: network error`));
    xhr.send();
  });
}

export async function xhrGetJson<T>(url: string): Promise<T> {
  return (await xhrGet(url, 'json')) as T;
}

export async function xhrGetArrayBuffer(url: string): Promise<ArrayBuffer> {
  return (await xhrGet(url, 'arraybuffer')) as ArrayBuffer;
}

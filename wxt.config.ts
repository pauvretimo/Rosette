import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: ({ browser }) => ({
    name: 'Rosette',
    description: 'Auto-translate Discord messages locally with Bergamot, cached and encrypted on-device.',
    permissions: ['storage', 'unlimitedStorage', 'notifications'],
    host_permissions: [
      'https://discord.com/*',
      'https://storage.googleapis.com/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    // The content script does `new Worker(browser.runtime.getURL('/bergamot/rosette-worker.js'))`
    // from the discord.com page context — without this, Firefox blocks the page from loading
    // any moz-extension:// resource at all ("Security Error: ... cannot load data from
    // moz-extension://...").
    web_accessible_resources: [
      {
        resources: ['bergamot/*'],
        matches: ['https://discord.com/*'],
      },
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              // Permanent — do not change once real users have installed a build with this id,
              // it's how Firefox matches an install against entries in the self-hosted update
              // manifest below.
              id: '{b5751384-29c3-4f70-81b8-13d13fc36870}',
              strict_min_version: '121.0',
              // TODO: replace updates.example.com with the same ROSETTE_UPDATES_DOMAIN you set
              // in self-hosting/.env before submitting a signed build for distribution — this
              // file can't read .env itself (it's build-time, not deploy-time), so the two have
              // to be kept in sync by hand. generate-manifest.mjs warns if they drift.
              update_url: 'https://updates.example.com/rosette/updates.json',
            },
          },
        }
      : {}),
  }),
});

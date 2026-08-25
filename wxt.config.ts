import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

// Single .env at the project root — self-hosting/docker-compose.yml is invoked with
// `--env-file ../.env` (see package.json's self-host:* scripts) specifically so this stays the
// only place the domain is ever written down, instead of a second copy self-hosting/ would need.
function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const here = dirname(fileURLToPath(import.meta.url));
const env = { ...loadEnvFile(join(here, '.env')), ...process.env };
// Falls back to a clearly-fake placeholder so a fresh clone still builds without self-hosting
// set up — real distribution builds should have the root .env filled in first.
const updatesDomain = env.ROSETTE_UPDATES_DOMAIN && env.ROSETTE_UPDATES_DOMAIN !== 'updates.example.com'
  ? env.ROSETTE_UPDATES_DOMAIN
  : 'updates.example.com';

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
              // Raised from 121.0: data_collection_permissions below (mandatory since Nov 2025)
              // is only recognized by Firefox 140+ desktop / 142+ Android — an older
              // strict_min_version makes AMO warn that the key is unsupported by versions this
              // add-on claims to support. 142.0 is the higher of the two floors, covering both.
              strict_min_version: '142.0',
              update_url: `https://${updatesDomain}/rosette/firefox/updates.json`,
              // Mozilla-mandated disclosure (required for all new extensions since Nov 2025).
              // Genuinely "none": translation runs entirely locally via WASM, the cache never
              // leaves the device, and the only network calls are downloading public Bergamot
              // model files and Discord's own page you're already on — no telemetry, no
              // analytics, nothing transmitted anywhere. Once shipped, this key must keep being
              // set in every future version, even if that stays true.
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {
          // Chrome-only, top-level (not nested like Firefox's browser_specific_settings).
          // Chrome only honors this for extensions installed via ExtensionInstallForcelist
          // policy — see self-hosting/README.md for what has to be true on the client machine
          // for that policy to even apply (domain-join / Entra ID / Chrome Enterprise Core
          // enrollment; regular unmanaged Chrome on Windows/macOS ignores it).
          update_url: `https://${updatesDomain}/rosette/chrome/updates.xml`,
        }),
  }),
});

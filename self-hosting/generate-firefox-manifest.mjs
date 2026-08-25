#!/usr/bin/env node
// Adds/updates one version's entry in updates/firefox/updates.json and copies the signed .xpi
// into updates/firefox/, computing its sha256 for update_hash. Reads the permanent gecko.id
// straight out of wxt.config.ts, and the hosting domain out of the project root's .env — the
// same .env wxt.config.ts itself reads at build time, so the two can't drift apart.
//
// Usage: node generate-firefox-manifest.mjs <version> <path-to-signed.xpi> [minFirefoxVersion]
// Example: node generate-firefox-manifest.mjs 0.2.0 ~/Downloads/rosette-0.2.0-fx.xpi 121.0

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [, , version, xpiPath, minFirefoxVersion = '121.0'] = process.argv;

if (!version || !xpiPath) {
  console.error('Usage: node generate-firefox-manifest.mjs <version> <path-to-signed.xpi> [minFirefoxVersion]');
  process.exit(1);
}
if (!existsSync(xpiPath)) {
  console.error(`File not found: ${xpiPath}`);
  process.exit(1);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

// Real process env (e.g. exported in CI) takes priority over the .env file.
const env = { ...loadEnvFile(join(here, '..', '.env')), ...process.env };
const domain = env.ROSETTE_UPDATES_DOMAIN;
if (!domain || domain === 'updates.example.com') {
  console.error('ROSETTE_UPDATES_DOMAIN is not set to a real domain. Copy .env.example to .env (project root) and fill it in first.');
  process.exit(1);
}

// wxt.config.ts derives its update_url from this same root .env at build time, so there's
// nothing to cross-check here — just the permanent gecko.id, which does still live in
// wxt.config.ts's source directly (it's not env-derived; it must never change).
const wxtConfigPath = join(here, '..', 'wxt.config.ts');
const wxtConfig = readFileSync(wxtConfigPath, 'utf8');
const idMatch = wxtConfig.match(/id:\s*'([^']+)'/);
if (!idMatch) {
  console.error(`Could not find gecko.id in ${wxtConfigPath}`);
  process.exit(1);
}
const geckoId = idMatch[1];

const updatesDir = join(here, 'updates', 'firefox');
mkdirSync(updatesDir, { recursive: true });
const xpiFileName = `rosette-${version}.xpi`;
copyFileSync(xpiPath, join(updatesDir, xpiFileName));

const hash = createHash('sha256').update(readFileSync(xpiPath)).digest('hex');

const manifestPath = join(updatesDir, 'updates.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { addons: {} };
manifest.addons[geckoId] ??= { updates: [] };

const entry = {
  version,
  update_link: `https://${domain}/rosette/firefox/${xpiFileName}`,
  update_hash: `sha256:${hash}`,
  applications: { gecko: { strict_min_version: minFirefoxVersion } },
};

const updates = manifest.addons[geckoId].updates.filter((u) => u.version !== version);
updates.push(entry);
updates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
manifest.addons[geckoId].updates = updates;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Added ${version} (${xpiFileName}, sha256:${hash.slice(0, 12)}...) to updates/firefox/updates.json`);

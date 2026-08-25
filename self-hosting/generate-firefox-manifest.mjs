#!/usr/bin/env node
// Adds/updates one version's entry in updates/firefox/updates.json and copies the signed .xpi
// into updates/firefox/, computing its sha256 for update_hash. Reads the permanent gecko.id
// straight out of wxt.config.ts, and the hosting domain out of the project root's .env — the
// same .env wxt.config.ts itself reads at build time, so the two can't drift apart.
//
// <path-to-signed.xpi> accepts either a local file path or the direct AMO download URL from the
// "Your extension has been approved" page — an env var isn't a good fit here since that URL's
// file id/hash slug is different every release, so there'd be nothing durable to store.
//
// Usage: node generate-firefox-manifest.mjs <version> <path-or-url-to-signed.xpi> [minFirefoxVersion]
// Example: node generate-firefox-manifest.mjs 0.2.0 ~/Downloads/rosette-0.2.0-fx.xpi 121.0
// Example: node generate-firefox-manifest.mjs 0.2.0 https://addons.mozilla.org/firefox/downloads/file/.../x.xpi

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Default kept in sync with wxt.config.ts's gecko.strict_min_version (142.0, required for
// data_collection_permissions support) — override via the 3rd arg if a build ever ships a
// different floor.
const [, , version, xpiPath, minFirefoxVersion = '142.0'] = process.argv;

if (!version || !xpiPath) {
  console.error('Usage: node generate-firefox-manifest.mjs <version> <path-or-url-to-signed.xpi> [minFirefoxVersion]');
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(xpiPath);
if (!isUrl && !existsSync(xpiPath)) {
  console.error(`File not found: ${xpiPath}`);
  process.exit(1);
}

async function readXpiBytes() {
  if (!isUrl) return readFileSync(xpiPath);
  console.log(`Downloading ${xpiPath} ...`);
  const res = await fetch(xpiPath);
  if (!res.ok) {
    console.error(`GET ${xpiPath} failed: HTTP ${res.status}`);
    process.exit(1);
  }
  return Buffer.from(await res.arrayBuffer());
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

const xpiBytes = await readXpiBytes();

const updatesDir = join(here, 'updates', 'firefox');
mkdirSync(updatesDir, { recursive: true });
const xpiFileName = `rosette-${version}.xpi`;
writeFileSync(join(updatesDir, xpiFileName), xpiBytes);

const hash = createHash('sha256').update(xpiBytes).digest('hex');

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

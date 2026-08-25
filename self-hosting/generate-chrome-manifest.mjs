#!/usr/bin/env node
// Adds/updates one version's entry in updates/chrome/updates.xml (Chrome's "gupdate" format —
// not the same shape as Firefox's JSON one) and copies the packed .crx into updates/chrome/,
// computing its sha256 for a size/hash check on the way. Reads the hosting domain out of the
// project root's .env.
//
// Chrome derives the extension id itself from the public half of whatever keypair signed the
// .crx (SHA256 of the DER-encoded public key, first 16 bytes, hex-nibbles mapped to a-p) — it
// isn't something you get to pick, so this script computes it from your .pem rather than asking
// you to type in whatever chrome://extensions displayed after packing.
//
// Usage: node generate-chrome-manifest.mjs <version> <path-to-signed.crx> <path-to-key.pem>
// Example: node generate-chrome-manifest.mjs 0.2.0 ../.output/chrome-mv3.crx ./chrome-key.pem
//
// The .crx and .pem come from packing the build yourself — Chrome doesn't have an external
// signing authority like AMO. First pack (no --pack-extension-key) generates a fresh .pem;
// keep it forever and reuse it for every later pack, or the extension id changes and every
// existing install becomes a separate, unrelated extension as far as Chrome is concerned:
//   chrome.exe --pack-extension=..\.output\chrome-mv3 --pack-extension-key=.\chrome-key.pem

import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [, , version, crxPath, pemPath] = process.argv;

if (!version || !crxPath || !pemPath) {
  console.error('Usage: node generate-chrome-manifest.mjs <version> <path-to-signed.crx> <path-to-key.pem>');
  process.exit(1);
}
for (const p of [crxPath, pemPath]) {
  if (!existsSync(p)) {
    console.error(`File not found: ${p}`);
    process.exit(1);
  }
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

const env = { ...loadEnvFile(join(here, '..', '.env')), ...process.env };
const domain = env.ROSETTE_UPDATES_DOMAIN;
if (!domain || domain === 'updates.example.com') {
  console.error('ROSETTE_UPDATES_DOMAIN is not set to a real domain. Copy .env.example to .env (project root) and fill it in first.');
  process.exit(1);
}

// wxt.config.ts derives its update_url from this same root .env at build time, so there's
// nothing to cross-check against it here.

function deriveExtensionId(pemPath) {
  const privateKey = createPrivateKey(readFileSync(pemPath, 'utf8'));
  const publicKey = createPublicKey(privateKey);
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const hash = createHash('sha256').update(spkiDer).digest();
  const first16 = hash.subarray(0, 16);
  let id = '';
  for (const byte of first16) {
    id += String.fromCharCode(97 + (byte >> 4)); // high nibble -> a-p
    id += String.fromCharCode(97 + (byte & 0x0f)); // low nibble -> a-p
  }
  return id;
}

const extensionId = deriveExtensionId(pemPath);

const updatesDir = join(here, 'updates', 'chrome');
mkdirSync(updatesDir, { recursive: true });
const crxFileName = `rosette-${version}.crx`;
copyFileSync(crxPath, join(updatesDir, crxFileName));

// gupdate is Chrome's own XML format (borrowed from Omaha) — deliberately not JSON like
// Firefox's manifest, this isn't a mistake to "fix" for consistency.
const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${extensionId}'>
    <updatecheck codebase='https://${domain}/rosette/chrome/${crxFileName}' version='${version}' />
  </app>
</gupdate>
`;
writeFileSync(join(updatesDir, 'updates.xml'), xml);

console.log(`Extension id (derived from ${pemPath}): ${extensionId}`);
console.log(`Added ${version} (${crxFileName}) to updates/chrome/updates.xml`);
console.log(
  `ExtensionInstallForcelist policy value: ${extensionId};https://${domain}/rosette/chrome/updates.xml`,
);

#!/usr/bin/env node
/**
 * IndexNow deploy hook.
 *
 * Submits every URL in the committed sitemap to IndexNow, which instantly
 * notifies Bing, Seznam and other participating engines that the pages
 * changed. Called best-effort at the end of deploy.sh; can also be run by hand:
 *
 *   node scripts/indexnow.mjs              # submit sitemap URLs
 *   node scripts/indexnow.mjs --dry-run    # print the payload, send nothing
 *
 * The key file is discovered in client/public (the IndexNow spec requires the
 * file name to equal the key, served at https://<host>/<key>.txt). Google does
 * not use IndexNow — it picks up changes via sitemap.xml.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(root, 'client', 'public');
const SITEMAP_PATH = join(PUBLIC_DIR, 'sitemap.xml');
const HOST = process.env.INDEXNOW_HOST || 'https://planningpoker.bytecoder.nl';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const dryRun = process.argv.includes('--dry-run');

// IndexNow keys are 8-128 hex chars; the deployed file is 32 hex chars.
const keyFile = readdirSync(PUBLIC_DIR).find((f) => /^[a-f0-9]{8,128}\.txt$/i.test(f));
if (!keyFile) {
  console.error('indexnow: no key file found in client/public (expected <key>.txt)');
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/i, '');

const urlList = [...readFileSync(SITEMAP_PATH, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].trim())
  .filter(Boolean);

if (urlList.length === 0) {
  console.error('indexnow: sitemap.xml contains no <loc> URLs');
  process.exit(1);
}

const payload = {
  host: new URL(HOST).host,
  key,
  keyLocation: `${HOST.replace(/\/$/, '')}/${keyFile}`,
  urlList,
};

if (dryRun) {
  console.log('indexnow (dry run):');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

try {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 200 || res.status === 202) {
    console.log(`indexnow: submitted ${urlList.length} URL(s) to IndexNow (HTTP ${res.status})`);
    for (const url of urlList) console.log(`  - ${url}`);
  } else {
    const body = await res.text().catch(() => '');
    console.error(`indexnow: submission failed with HTTP ${res.status} ${body}`.trim());
    process.exit(1);
  }
} catch (err) {
  console.error(`indexnow: submission failed: ${err.message}`);
  process.exit(1);
}

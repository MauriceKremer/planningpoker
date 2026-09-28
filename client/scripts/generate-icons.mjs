#!/usr/bin/env node
/**
 * Generate the PWA icon set from the single source of truth: public/favicon.svg.
 *
 * There is no rasteriser (sharp/rsvg/imagemagick) in the dependency tree —
 * Playwright's chromium is already a devDependency and renders SVG perfectly,
 * so it does the rasterisation here. Run manually when the favicon changes:
 *
 *     node scripts/generate-icons.mjs
 *
 * Outputs (committed to public/icons/, consumed by manifest.webmanifest):
 *   icon-192.png        any-purpose manifest icon
 *   icon-512.png        any-purpose manifest icon (installability requires ≥192 & ≥512)
 *   maskable-512.png    maskable icon: art inside the safe zone on solid brand brown
 *   apple-touch-icon.png 180×180 with a solid background (iOS renders
 *                       transparency as black on the home screen)
 */
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf-8');

// The favicon art is full-bleed-ish within its 32×32 viewBox. For maskable
// icons the art must sit inside the circular safe zone (inner ~80%), so it
// is scaled down and centred on the solid brand brown.
const BRAND_BROWN = '#5D4037';

function page({ size, bg, scale = 1 }) {
  const inner = size * scale;
  const svgSized = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `);
  return `<!DOCTYPE html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
      ${svgSized}
    </div>
  </body></html>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, bg: 'transparent' },
  { file: 'maskable-512.png', size: 512, bg: BRAND_BROWN, scale: 0.72 },
  { file: 'apple-touch-icon.png', size: 180, bg: BRAND_BROWN, scale: 0.78 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const pg = await ctx.newPage();

for (const t of targets) {
  await pg.setViewportSize({ width: t.size, height: t.size });
  await pg.setContent(page(t));
  await pg.screenshot({ path: join(outDir, t.file), omitBackground: t.bg === 'transparent' });
  console.log(`  generated public/icons/${t.file} (${t.size}×${t.size}${t.scale !== 1 ? `, scale ${t.scale}` : ''})`);
}

await browser.close();
console.log('✓ icon set generated');
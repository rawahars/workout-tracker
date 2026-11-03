import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const svg = await readFile(path.resolve('assets', 'icon.svg'), 'utf8');
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.locator('svg').evaluate((node, size) => { node.setAttribute('width', String(size)); node.setAttribute('height', String(size)); }, size);
    await page.screenshot({ path: path.resolve('public', `icon-${size}.png`) });
  }
} finally { await browser.close(); }

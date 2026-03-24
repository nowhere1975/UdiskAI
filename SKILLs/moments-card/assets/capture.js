#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

async function main() {
  const args = process.argv.slice(2);
  const htmlPath = args[0];
  const outputPath = args[1];
  const width = parseInt(args[2]) || 1080;
  const height = parseInt(args[3]) || 1600;
  const fullpage = args[4] === 'fullpage';

  if (!htmlPath || !outputPath) {
    console.error('Usage: node capture.js <html> <png> [width] [height] [fullpage]');
    process.exit(1);
  }

  // Look for playwright in skill-local node_modules first, then global
  let chromium;
  const localPlaywright = path.join(__dirname, '..', 'node_modules', 'playwright');
  try {
    chromium = require(fs.existsSync(localPlaywright) ? localPlaywright : 'playwright').chromium;
  } catch {
    console.error('[moments-card] Playwright not found. Run in skill directory: npm install');
    process.exit(1);
  }

  // Use bundled Chromium if pre-installed (legacy portable builds)
  const localBrowsersPath = path.join(__dirname, '..', 'playwright-browsers');
  if (fs.existsSync(localBrowsersPath)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsersPath;
  }

  // Try system browsers first (zero download), fall back to playwright-managed Chromium
  let browser;
  const systemChannels = ['msedge', 'chrome'];
  for (const channel of systemChannels) {
    try {
      browser = await chromium.launch({ channel });
      break;
    } catch {
      // channel not available, try next
    }
  }
  if (!browser) {
    // Fall back to playwright-managed Chromium (requires: npx playwright install chromium)
    try {
      browser = await chromium.launch();
    } catch (e) {
      console.error('[moments-card] No browser found. Install one of: Edge, Chrome, or run:');
      console.error('  npx playwright install chromium  (in the moments-card skill directory)');
      process.exit(1);
    }
  }
  const page = await browser.newPage();
  await page.setViewportSize({ width, height: fullpage ? 800 : height });

  const fileUrl = 'file://' + path.resolve(htmlPath);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  if (fullpage) {
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width, height: bodyHeight });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.resolve(outputPath),
      type: 'png',
      clip: { x: 0, y: 0, width, height: bodyHeight }
    });
  } else {
    await page.screenshot({
      path: path.resolve(outputPath),
      type: 'png',
      clip: { x: 0, y: 0, width, height }
    });
  }

  await browser.close();
  console.log('OK: ' + path.resolve(outputPath));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

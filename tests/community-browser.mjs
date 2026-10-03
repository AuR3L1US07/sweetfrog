import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4174/');
    await page.locator('#community').waitFor();
    assert.equal(await page.locator('.rank-tab').count(), 5);
    assert.match(await page.locator('#threads-status').textContent(), /云端配置/);
    await page.locator('#frog-name').fill('呱呱玩家');
    await page.locator('#frog-name').blur();
    await page.locator('.rank-tab[data-game="aim"]').click();
    assert.equal(await page.locator('.rank-tab[data-game="aim"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto('http://127.0.0.1:4174/#tap');
    await page.locator('.game-rank').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: community empty state, game tabs, nickname and responsive layout');
} finally { await browser.close(); }

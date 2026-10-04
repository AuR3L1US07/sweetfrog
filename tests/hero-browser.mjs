import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4175/');
    const frog = page.getByRole('button', { name: '点击青蛙，抽取今日游戏' });
    await frog.focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#frog-sticker').innerText(), /1\/5/);
    for (let i = 0; i < 4; i++) await frog.click();
    const pick = page.locator('#frog-pick');
    assert.equal(await pick.isVisible(), true);
    assert.match(await pick.getAttribute('href'), /^#(tap|merge|flap|puzzle|aim)$/);
    const first = await pick.getAttribute('href');
    for (let i = 0; i < 5; i++) await frog.click();
    assert.notEqual(await pick.getAttribute('href'), first);
    await pick.click();
    assert.equal(await page.locator('#game-screen').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: mascot keyboard/touch interaction, game draw, reroll, mobile layout');
} finally {
  await browser.close();
}

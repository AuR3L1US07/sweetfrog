import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/#aim');await page.waitForFunction(()=>!document.querySelector('#start-button').disabled);
 await page.clock.install({time:new Date('2026-10-03T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'));
 await page.locator('#start-button').click();if(await page.locator('.aim-target').isVisible())throw Error('Target visible before countdown');
 await page.clock.runFor(3200);
 for(let i=0;i<3;i++){await page.clock.runFor(200);await page.locator('.aim-target').click();}
 await page.locator('.aim-field').click({position:{x:5,y:5}});
 if(await page.locator('#aim-accuracy').textContent()!=='75%')throw Error('Accuracy calculation failed');
 if(await page.locator('#aim-combo').textContent()!=='0')throw Error('Miss should break combo');
 if(await page.locator('#aim-hits').textContent()!=='3 / 4')throw Error('Shot counts failed');
 const time=await page.locator('#extra').textContent();await page.keyboard.press('Escape');await page.clock.runFor(5000);if(await page.locator('#extra').textContent()!==time)throw Error('Pause lost time');await page.locator('#start-button').click();
 await page.screenshot({path:'tests/aim-desktop.png',fullPage:true});
 await page.clock.runFor(30100);if(await page.locator('#game-overlay').isHidden())throw Error('No end summary');if(!(await page.locator('#overlay-text').textContent()).includes('命中 3 / 4'))throw Error('Summary missing stats');
 await page.locator('#aim-mode').selectOption('moving');await page.locator('#aim-difficulty').selectOption('hard');await page.locator('#aim-duration').selectOption('60');await page.locator('#start-button').click();await page.clock.runFor(3200);
 const before=await page.locator('.aim-target').boundingBox();await page.clock.runFor(500);const after=await page.locator('.aim-target').boundingBox();if(Math.hypot(after.x-before.x,after.y-before.y)<1)throw Error('Moving target static');if(after.width!==34)throw Error('Hard size incorrect');
 await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);await page.screenshot({path:'tests/aim-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 await page.locator('#back-button').click();if(await page.locator('[data-game]').count()!==5)throw Error('Fifth lobby entry missing');await page.locator('[data-game="tap"]').click();await page.locator('#start-button').click();await page.locator('.tap-row:last-child .face').click();if(await page.locator('#score').textContent()!=='1')throw Error('Existing tap game broken');
 await page.locator('#back-button').click();await page.setViewportSize({width:320,height:740});await page.screenshot({path:'tests/aim-lobby-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Narrow lobby overflow');
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: countdown, photo target hits/misses, accuracy, combo, pause, end summary, mode/difficulty/duration, moving targets, mobile layout and existing game navigation.');
}finally{await browser.close();}

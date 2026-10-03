import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/#aim');await page.waitForFunction(()=>!document.querySelector('#start-button').disabled);
 await page.clock.install({time:new Date('2026-10-03T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'));
 if(await page.locator('#aim-difficulty').inputValue()!=='random')throw Error('Random should be default');
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
 await page.locator('#start-button').click();await page.clock.runFor(3200);
 const sizes=new Set();for(let i=0;i<12;i++){sizes.add((await page.locator('.aim-target').boundingBox()).width);await page.clock.runFor(100);await page.locator('.aim-target').click();}
 if(sizes.size<2||[...sizes].some(size=>size<34||size>68))throw Error('Random sizes failed');
 const priorScore=Number(await page.locator('#score').textContent());await page.locator('.aim-decoy').first().click();
 if(Number(await page.locator('#score').textContent())!==Math.max(0,priorScore-100))throw Error('Frog penalty failed');
 if(await page.locator('#aim-frog-hits').textContent()!=='1'||await page.locator('#aim-combo').textContent()!=='0')throw Error('Frog stats or combo failed');
 if(await page.locator('#aim-hits').textContent()!=='12 / 13')throw Error('Frog counted as photo hit');
 await page.screenshot({path:'tests/aim-frogs-desktop.png',fullPage:true});
 await page.locator('#restart-button').click();await page.locator('#aim-difficulty').selectOption('easy');await page.locator('#start-button').click();await page.clock.runFor(3200);
 if((await page.locator('.aim-target').boundingBox()).width!==68)throw Error('Large fixed size broken');
 await page.locator('.aim-decoy').first().click();if(await page.locator('#score').textContent()!=='0')throw Error('Penalty below zero');
 await page.locator('#restart-button').click();await page.locator('#aim-difficulty').selectOption('normal');await page.locator('#start-button').click();await page.clock.runFor(3200);
 if((await page.locator('.aim-target').boundingBox()).width!==50)throw Error('Medium fixed size broken');
 await page.locator('#restart-button').click();
 await page.locator('#aim-mode').selectOption('moving');await page.locator('#aim-difficulty').selectOption('hard');await page.locator('#aim-duration').selectOption('60');await page.locator('#start-button').click();await page.clock.runFor(3200);
 const before=await page.locator('.aim-target').boundingBox();await page.clock.runFor(500);const after=await page.locator('.aim-target').boundingBox();if(Math.hypot(after.x-before.x,after.y-before.y)<1)throw Error('Moving target static');if(after.width!==34)throw Error('Hard size incorrect');
 await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);await page.screenshot({path:'tests/aim-mobile.png',fullPage:true}); const circles=await page.locator('.aim-target, .aim-decoy').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2}})); for(let i=1;i<circles.length;i++){if(Math.hypot(circles[0].x-circles[i].x,circles[0].y-circles[i].y)<circles[0].r+circles[i].r)throw Error('Moving frog obscures target');}if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 await page.locator('#back-button').click();if(await page.locator('.game-card[data-game]').count()!==5)throw Error('Fifth lobby entry missing');await page.locator('.game-card[data-game="tap"]').click();await page.locator('#start-button').click();await page.locator('.tap-row:last-child .face').click();if(await page.locator('#score').textContent()!=='1')throw Error('Existing tap game broken');
 await page.locator('#back-button').click();await page.setViewportSize({width:320,height:740});await page.screenshot({path:'tests/aim-lobby-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Narrow lobby overflow');
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: countdown, photo target hits/misses, accuracy, combo, pause, end summary, mode/difficulty/duration, moving targets, mobile layout and existing game navigation.');
}finally{await browser.close();}

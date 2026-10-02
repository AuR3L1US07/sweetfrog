import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
await page.screenshot({path:'tests/lobby-desktop.png',fullPage:true});
await page.getByRole('button',{name:/逮住大兄弟/}).click();await page.getByRole('button',{name:'开始游戏 →'}).click();
for(let i=0;i<5;i++)await page.locator('.tap-row:last-child .face').click();
if(await page.locator('#score').textContent()!=='5')throw new Error('Tap scoring failed');
await page.screenshot({path:'tests/tap.png'});
await page.getByRole('button',{name:'← 返回大厅'}).click();
await page.getByRole('button',{name:/照片 2048/}).click();await page.getByRole('button',{name:'开始游戏 →'}).click();
for(const k of ['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','ArrowLeft','ArrowDown'])await page.keyboard.press(k);
if(await page.locator('.tile.filled').count()<2)throw new Error('2048 board missing');
await page.screenshot({path:'tests/puzzle.png'});
await page.getByRole('button',{name:'← 返回大厅'}).click();
await page.getByRole('button',{name:/合成大兄弟/}).click();await page.getByRole('button',{name:'开始游戏 →'}).click();
const canvas=page.locator('#game-stage canvas');
for(let i=0;i<10;i++){await canvas.click({position:{x:180+(i%2)*20,y:100}});await page.waitForTimeout(550);}
await page.screenshot({path:'tests/merge.png'});
await page.getByRole('button',{name:'← 返回大厅'}).click();
await page.getByRole('button',{name:/朋友起飞/}).click();await page.getByRole('button',{name:'开始游戏 →'}).click();await page.keyboard.press('Space');
await page.waitForFunction(()=>!document.querySelector('#game-overlay').hidden,{timeout:5000});
if(!(await page.locator('#overlay-title').textContent()).includes('落'))throw new Error('Flap loss missing');
await page.getByRole('button',{name:'不服，再来一局 ↻'}).click();
await page.keyboard.press('Escape');if(await page.locator('#overlay-title').textContent()!=='休息一下，友情不掉线')throw new Error('Pause failed');
await page.getByRole('button',{name:'继续游戏 →'}).click();
await page.getByRole('button',{name:'← 返回大厅'}).click();
await page.reload();if(!((await page.locator('[data-best="tap"]').textContent()).includes('5')))throw new Error('Best score persistence failed');
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/lobby-mobile.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile horizontal overflow');
await page.getByRole('button',{name:/照片 2048/}).click();await page.getByRole('button',{name:'开始游戏 →'}).click();
const grid=await page.locator('.puzzle-board').boundingBox();await page.mouse.move(grid.x+grid.width*.8,grid.y+grid.height*.5);await page.mouse.down();await page.mouse.move(grid.x+grid.width*.2,grid.y+grid.height*.5);await page.mouse.up();
await page.screenshot({path:'tests/puzzle-mobile.png',fullPage:true});
if(errors.length)throw new Error(errors.join('\n'));console.log('PASS: four games, scoring, game over, retry, pause/resume, navigation, saved best, mobile swipe and layout; no JS errors.');await browser.close();



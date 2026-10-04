import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..');
const state = mkdtempSync(join(tmpdir(), 'sweetfrog-pk-browser-'));
const cli = join(root, 'node_modules/wrangler/bin/wrangler.js');
const port = 44000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
let server, browser;
try {
  execFileSync(process.execPath,[cli,'d1','execute','sweetfrog-db','--local','--persist-to',state,'--file','cloudflare/schema.sql'],{cwd:root,stdio:'pipe'});
  server=spawn(process.execPath,[cli,'pages','dev','dist','--port',String(port),'--persist-to',state],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/session')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert.ok(ready,logs);
  const register=async name=>{const response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,password:'password123'})});assert.equal(response.status,200);return response.json();};
  const host=await register('pkhost'+Math.floor(Math.random()*100000));
  const guest=await register('pkguest'+Math.floor(Math.random()*100000));
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const visitor=await browser.newPage({viewport:{width:390,height:850}});
  await visitor.goto(base+'/#games');
  assert.equal(await visitor.locator('.pk-lobby-banner').isVisible(),true);
  await visitor.locator('.pk-lobby-banner').click();
  await visitor.waitForURL('**/#pk');
  await visitor.getByRole('link',{name:'登录 / 注册 ↗'}).click();
  await visitor.waitForURL('**/#account');
  await visitor.getByRole('button',{name:'注册',exact:true}).click();
  await visitor.locator('[name=username]').fill('pkvisitor'+Math.floor(Math.random()*100000));
  await visitor.locator('[name=password]').fill('password123');
  await visitor.getByRole('button',{name:'创建账号 ↗'}).click();
  await visitor.waitForURL('**/#pk');
  await visitor.getByRole('button',{name:'创建房间 →'}).waitFor();
  await visitor.screenshot({path:'tests/pk-choose-mobile-preview.png',fullPage:true});
  await visitor.close();
  const hostPage=await browser.newPage({viewport:{width:1280,height:900}});
  const guestPage=await browser.newPage({viewport:{width:390,height:850}});
  const errors=[];for(const page of [hostPage,guestPage])page.on('pageerror',error=>errors.push(error.message));
  await hostPage.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),host.token);
  await guestPage.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),guest.token);
  await hostPage.goto(base+'/#pk');
  await hostPage.getByRole('button',{name:'创建房间 →'}).click();
  await hostPage.waitForURL('**/#pk/*');
  const code=(new URL(hostPage.url())).hash.slice(4);
  assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);
  await guestPage.goto(base+'/#pk/'+code);
  await guestPage.getByText(host.user.username).waitFor();
  await hostPage.getByText(guest.user.username).waitFor();
  await hostPage.getByRole('button',{name:'准备好了 →'}).click();
  await guestPage.getByRole('button',{name:'准备好了 →'}).click();
  await hostPage.locator('#pk-game').waitFor({state:'visible',timeout:10000});
  await guestPage.locator('#pk-game').waitFor({state:'visible',timeout:10000});
  assert.ok((await hostPage.locator('#pk-board').boundingBox()).height < 520);
  assert.ok((await guestPage.locator('#pk-board').boundingBox()).height < 420);
  await hostPage.screenshot({path:'tests/pk-desktop-preview.png',fullPage:true});
  await guestPage.screenshot({path:'tests/pk-mobile-preview.png',fullPage:true});
  await hostPage.locator('.pk-row:last-child .pk-cell.face').click();
  await hostPage.getByText('1',{exact:true}).first().waitFor();
  await guestPage.waitForFunction(()=>document.querySelector('.pk-player-score')?.textContent==='1');
  await guestPage.reload();
  await guestPage.getByText(host.user.username).waitFor();
  assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const [game,title] of [['merge','合成大青蛙'],['flap','青蛙起飞'],['puzzle','青蛙2048'],['aim','青蛙定位练习']]){
    await hostPage.goto(base+'/#pk');
    await hostPage.locator(`.pk-game-option input[value="${game}"]`).check();
    await hostPage.getByRole('button',{name:'创建房间 →'}).click();
    await hostPage.waitForURL('**/#pk/*');
    const selectedCode=(new URL(hostPage.url())).hash.slice(4);
    await guestPage.goto(base+'/#pk/'+selectedCode);
    await guestPage.locator('.pk-room-game').getByText(title,{exact:true}).waitFor();
    await hostPage.getByRole('button',{name:'准备好了 →'}).click();
    await guestPage.getByRole('button',{name:'准备好了 →'}).click();
    await hostPage.locator('#game-screen').waitFor({state:'visible',timeout:10000});
    await guestPage.locator('#game-screen').waitFor({state:'visible',timeout:10000});
    assert.equal(await hostPage.locator('#game-title').textContent(),title);
    if(game==='aim')await guestPage.screenshot({path:'tests/pk-aim-mobile-preview.png',fullPage:true});
    if(game==='merge')await hostPage.locator('#game-stage canvas').click();
    if(game==='flap')await hostPage.locator('#game-stage canvas').click();
    if(game==='puzzle')for(const key of ['ArrowLeft','ArrowDown','ArrowRight'])await hostPage.keyboard.press(key);
    if(game==='aim')await hostPage.locator('.aim-target').click();
    if(['puzzle','aim'].includes(game)){
      await hostPage.waitForFunction(()=>Number(document.querySelector('#score').textContent)>0);
      await guestPage.waitForFunction(()=>Number(document.querySelector('.pk-player-score').textContent)>0,{timeout:5000});
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: two browsers create/join, all five game choices, countdown, live score, refresh recovery, mobile layout');
} finally {
  await browser?.close();
  if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
  if(state.startsWith(join(tmpdir(),'sweetfrog-pk-browser-')))await rm(state,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}

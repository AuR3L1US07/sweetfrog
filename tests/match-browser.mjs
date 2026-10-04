import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=resolve(import.meta.dirname,'..'),state=mkdtempSync(join(tmpdir(),'sweetfrog-match-browser-'));
const cli=join(root,'node_modules/wrangler/bin/wrangler.js'),port=44000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
let server,browser;
try{
  execFileSync(process.execPath,[cli,'d1','execute','sweetfrog-db','--local','--persist-to',state,'--file','cloudflare/schema.sql'],{cwd:root,stdio:'pipe'});
  server=spawn(process.execPath,[cli,'pages','dev','dist','--port',String(port),'--persist-to',state],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/presence')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.ok(ready,logs);
  const register=async prefix=>{const response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:prefix+Math.floor(Math.random()*100000),password:'password123'})});assert.equal(response.status,200);return response.json();};
  const host=await register('quickhost'),guest=await register('quickguest');
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const hostPage=await browser.newPage({viewport:{width:1280,height:900}}),guestPage=await browser.newPage({viewport:{width:390,height:850}});
  const errors=[];for(const page of [hostPage,guestPage])page.on('pageerror',error=>errors.push(error.message));
  await hostPage.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),host.token);
  await guestPage.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),guest.token);
  await hostPage.goto(base+'/#games');await hostPage.locator('#online-total').waitFor();
  await hostPage.waitForFunction(()=>Number(document.querySelector('#online-total').textContent)>=1);
  assert.equal(await hostPage.locator('.brand-mark .sf-icon').count(),1);
  assert.equal(await hostPage.locator('header nav a[href="#match"]').count(),1);
  assert.equal(await hostPage.locator('.spark-one .sf-icon').count(),1);
  assert.equal(await hostPage.locator('.note-smile .sf-icon').count(),1);
  await hostPage.screenshot({path:'tests/match-home-preview.png',fullPage:true});
  await hostPage.locator('.match-lobby-banner').click();await hostPage.waitForURL('**/#match');
  await guestPage.goto(base+'/#match');
  await guestPage.locator('[data-match-game="tap"]').waitFor();
  await hostPage.locator('[data-match-game="tap"]').click();
  await hostPage.getByRole('button',{name:'匹配「逮住大青蛙」对手 →'}).click();
  await hostPage.locator('#match-searching').waitFor({state:'visible'});
  await guestPage.waitForFunction(()=>Number(document.querySelector('[data-match-game="tap"] .match-mode-waiting strong').textContent)>=1,{timeout:10000});
  await guestPage.screenshot({path:'tests/match-mobile-preview.png',fullPage:true});
  await guestPage.locator('[data-match-game="tap"]').click();
  await guestPage.getByRole('button',{name:'匹配「逮住大青蛙」对手 →'}).click();
  await guestPage.locator('#match-found').waitFor({state:'visible',timeout:10000});
  await hostPage.locator('#match-found').waitFor({state:'visible',timeout:10000});
  assert.equal(await guestPage.locator('#match-modes').isVisible(),false);
  await guestPage.waitForFunction(name=>document.querySelector('.match-duel-opponent strong')?.textContent===name,host.user.username);
  await guestPage.screenshot({path:'tests/match-found-mobile-preview.png',fullPage:true});
  await hostPage.waitForURL('**/#pk/*',{timeout:10000});await guestPage.waitForURL('**/#pk/*',{timeout:10000});
  assert.equal(new URL(hostPage.url()).hash,new URL(guestPage.url()).hash);
  await hostPage.locator('#pk-game').waitFor({state:'visible',timeout:12000});
  await guestPage.locator('#pk-game').waitFor({state:'visible',timeout:12000});
  assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: online count, unified icons, per-mode waiting count, two-browser matching animation and shared PK room');
}finally{
  await browser?.close();
  if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
  if(state.startsWith(join(tmpdir(),'sweetfrog-match-browser-')))await rm(state,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}

import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=resolve(import.meta.dirname,'..'),state=mkdtempSync(join(tmpdir(),'sweetfrog-profile-browser-'));
const cli=join(root,'node_modules/wrangler/bin/wrangler.js'),port=44000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
let server,browser;
try{
  execFileSync(process.execPath,[cli,'d1','execute','sweetfrog-db','--local','--persist-to',state,'--file','cloudflare/schema.sql'],{cwd:root,stdio:'pipe'});
  server=spawn(process.execPath,[cli,'pages','dev','dist','--port',String(port),'--persist-to',state],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/session')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.ok(ready,logs);
  const response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'profile'+Math.floor(Math.random()*1000000),password:'password123'})});
  assert.equal(response.status,200);const member=await response.json();
  const actorResponse=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'actor'+Math.floor(Math.random()*1000000),password:'password123'})});
  assert.equal(actorResponse.status,200);const actor=await actorResponse.json();
  const friendRequest=await fetch(base+'/api/friends/requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.token}`},body:JSON.stringify({userId:member.user.id})});
  assert.equal(friendRequest.status,201);
  browser=await chromium.launch({headless:true,channel:'msedge'});
  for(const viewport of [{width:1280,height:900},{width:390,height:850}]){
    const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),member.token);
    await page.goto(base+'/#profile');await page.getByRole('heading',{name:'账号与安全'}).waitFor();
    if(viewport.width===1280)await page.waitForFunction(()=>document.querySelector('a[href="#notifications"] .nav-badge')?.textContent==='1');
    await page.waitForFunction(()=>document.querySelectorAll('.profile-match-value').length===4);
    await page.getByRole('heading',{name:'最近对局'}).waitFor();
    await page.getByRole('heading',{name:'成就与称号'}).waitFor();
    await page.locator('.profile-current-title').waitFor(); assert.equal(await page.locator('.profile-current-title').textContent(),'青蛙学徒');
    assert.match(await page.locator('.profile-match-record').textContent(),/胜率/);
    await page.locator('.profile-facts dd').nth(2).waitFor();
    assert.equal(await page.locator('.profile-facts dt').allTextContents().then(values=>values.join(',')),'玩家 ID,账号身份,注册时间');
    assert.doesNotMatch(await page.locator('.profile-facts').textContent(),/北京时间/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('.profile-settings .profile-panel').first().isVisible(),true);
    assert.equal(await page.locator('.profile-settings .profile-panel').nth(1).isVisible(),false);
    assert.equal(await page.locator('.profile-settings .profile-panel').first().locator('label').evaluateAll(labels=>labels[1].getBoundingClientRect().top>labels[0].getBoundingClientRect().bottom),true);
    await page.getByRole('tab',{name:'密码'}).click();
    assert.equal(await page.locator('.profile-settings .profile-panel').nth(1).isVisible(),true);
    assert.equal(await page.locator('.profile-settings .profile-panel').nth(1).locator('label').evaluateAll(labels=>labels.every((label,index)=>index===0||label.getBoundingClientRect().top>labels[index-1].getBoundingClientRect().bottom)),true);
    await page.getByRole('tab',{name:'用户名'}).click();
    const input=page.locator('.profile-file-input');
    const dataUrl=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;const context=canvas.getContext('2d');context.fillStyle='#86cfa1';context.fillRect(0,0,20,20);return canvas.toDataURL('image/png');});
    await input.setInputFiles({name:'frog-avatar.png',mimeType:'image/png',buffer:Buffer.from(dataUrl.split(',')[1],'base64')});
    await page.getByText('frog-avatar.png').waitFor();
    assert.equal(await page.getByRole('button',{name:'保存头像'}).isEnabled(),true);
    assert.match(await page.locator('.profile-avatar').getAttribute('src'),/^blob:/);
    await page.screenshot({path:`tests/profile-${viewport.width}-preview.png`,fullPage:true});
    await page.getByRole('button',{name:'保存头像'}).click();await page.getByText('头像已更新。').waitFor();
    await page.getByRole('button',{name:'恢复默认头像'}).click();await page.getByText('已恢复默认头像。').waitFor();
    await page.goto(base+'/#notifications');await page.getByRole('heading',{name:'消息通知'}).waitFor();
    await page.getByText('申请加你为好友').waitFor();
    await page.waitForFunction(()=>document.querySelector('a[href="#notifications"] .nav-badge')?.hidden);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: profile layout, responsive tabs, themed file picker and avatar preview');
}finally{
  await browser?.close();
  if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
  if(state.startsWith(join(tmpdir(),'sweetfrog-profile-browser-')))await rm(state,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}

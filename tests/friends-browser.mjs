import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=resolve(import.meta.dirname,'..'),state=mkdtempSync(join(tmpdir(),'sweetfrog-friends-browser-'));
const cli=join(root,'node_modules/wrangler/bin/wrangler.js'),port=44000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
let server,browser;
try{
  execFileSync(process.execPath,[cli,'d1','execute','sweetfrog-db','--local','--persist-to',state,'--file','cloudflare/schema.sql'],{cwd:root,stdio:'pipe'});
  server=spawn(process.execPath,[cli,'pages','dev','dist','--port',String(port),'--persist-to',state],{cwd:root,stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/session')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.ok(ready,logs);
  const register=async prefix=>{const response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:prefix+Math.floor(Math.random()*100000),password:'password123'})});assert.equal(response.status,200);return response.json();};
  const host=await register('friendhost'),guest=await register('friendguest');
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const hostPage=await browser.newPage({viewport:{width:1280,height:900}}),guestPage=await browser.newPage({viewport:{width:390,height:850}});
  const errors=[];for(const page of [hostPage,guestPage])page.on('pageerror',error=>errors.push(error.message));
  await hostPage.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),host.token);
  await guestPage.addInitScript(value=>localStorage.setItem('sweetfrog-session',value),guest.token);
  await hostPage.goto(base+'/#friends');await guestPage.goto(base+'/#friends');
  await hostPage.waitForFunction(()=>document.querySelector('#account-chip .account-chip-name')?.textContent?.startsWith('friendhost'));
  assert.equal(await hostPage.locator('#account-chip .account-chip-title').textContent(),'青蛙学徒');
  for(const section of ['tap','suggestions','discussion','leaderboard','friends']){
    await hostPage.evaluate(section=>location.hash=section,section);
    await hostPage.waitForFunction(section=>{
      const current=document.querySelectorAll('.site-header nav a.active');
      return current.length===(section==='tap'?0:1)&&
        (section==='tap'||current[0].getAttribute('href')==='#'+section)&&
        (section==='tap'||document.querySelector('#lobby').hidden&&document.querySelector('#game-screen').hidden);
    },section);
  }
  await guestPage.locator('#friend-query').fill(host.user.username);
  await guestPage.getByRole('button',{name:'搜索玩家'}).click();
  await guestPage.getByText(host.user.username).waitFor();
  await guestPage.getByText(`ID ${host.user.publicId}`).waitFor();
  await guestPage.getByRole('button',{name:'加好友'}).click();
  await guestPage.getByText('申请已发出').waitFor();
  await hostPage.reload();await hostPage.getByRole('button',{name:'接受',exact:true}).waitFor();
  await hostPage.getByRole('button',{name:'接受',exact:true}).click();
  await hostPage.getByRole('link',{name:'发私信'}).waitFor();
  await guestPage.reload();await guestPage.getByRole('link',{name:'发私信'}).waitFor();
  await guestPage.evaluate(()=>window.__savedFriendAvatar=document.querySelector('#friends-content .friend-avatar'));
  await guestPage.getByRole('button',{name:'刷新好友与邀请'}).click();
  await guestPage.getByText('好友与邀请已更新。').waitFor();
  assert.equal(await guestPage.evaluate(()=>window.__savedFriendAvatar===document.querySelector('#friends-content .friend-avatar')),true);
  await guestPage.getByRole('link',{name:'发私信'}).click();
  assert.equal(new URL(guestPage.url()).hash,`#friends/${host.user.publicId}`);
  await guestPage.locator('#friend-message-body').fill('今晚一起玩青蛙定位练习？');
  await guestPage.locator('#friend-message-body').press('Enter');
  await guestPage.getByText('今晚一起玩青蛙定位练习？').waitFor();
  await hostPage.waitForFunction(()=>!document.querySelector('#friends-badge')?.hidden,{timeout:15000});
  await hostPage.getByRole('link',{name:'发私信'}).click();
  await hostPage.getByText('今晚一起玩青蛙定位练习？').waitFor();
  await hostPage.locator('#friend-message-body').fill('来吧！');
  await hostPage.locator('#friend-message-body').press('Shift+Enter');
  assert.ok((await hostPage.locator('#friend-message-body').inputValue()).includes('\n'));
  await hostPage.locator('#friend-message-body').fill('来吧！');
  await hostPage.locator('#friend-message-body').press('Enter');
  await guestPage.getByText('来吧！').waitFor({timeout:10000});
  await guestPage.getByRole('button',{name:'展开功能菜单'}).click();
  await guestPage.locator('.site-header.nav-open').waitFor();
  await guestPage.waitForFunction(()=>document.querySelector('#site-navigation').getBoundingClientRect().right<=innerWidth+1);
  const drawerBox=await guestPage.evaluate(()=>{const node=document.querySelector('#site-navigation'),rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width,viewport:innerWidth,transform:getComputedStyle(node).transform,visibility:getComputedStyle(node).visibility,header:document.querySelector('.site-header').getBoundingClientRect().right};});
  assert.ok(drawerBox.left>=-1&&drawerBox.right<=drawerBox.viewport+1,JSON.stringify(drawerBox));
  for(const label of ['大厅','对战','匹配','留言','社区','排行','好友'])assert.equal(await guestPage.locator('.site-header nav .nav-label').filter({hasText:label}).count(),1);
  await guestPage.screenshot({path:'tests/friends-drawer-mobile.png'});
  await guestPage.locator('.nav-drawer-head button').click();
  assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await hostPage.goto(base+'/#pk');await hostPage.locator('input[value="aim"]').check();
  await hostPage.getByRole('button',{name:'创建房间 →'}).click();
  await hostPage.waitForURL('**/#pk/*');
  const code=new URL(hostPage.url()).hash.slice(4);
  await hostPage.locator('#pk-invite-panel').waitFor({state:'visible'});
  await hostPage.locator('#pk-invite-panel').getByText(guest.user.username).waitFor();
  await hostPage.getByRole('button',{name:'邀请对战'}).click();
  await hostPage.getByText('已邀请，等待接受').waitFor();
  await guestPage.goto(base+'/#friends');await guestPage.getByRole('button',{name:'接受并进入'}).waitFor();
  await guestPage.getByRole('button',{name:'接受并进入'}).click();
  await guestPage.waitForURL('**/#pk/*');assert.equal(new URL(guestPage.url()).hash,'#pk/'+code);
  await hostPage.locator('.pk-player-name').getByText(guest.user.username).waitFor();
  await guestPage.goto(base+'/#friends');
  await guestPage.getByRole('button',{name:'删除好友'}).click();
  await guestPage.getByText('删除后将无法继续私信或邀请对战，聊天记录会保留。').waitFor();
  await guestPage.getByRole('button',{name:'取消'}).click();
  assert.equal(await guestPage.getByRole('link',{name:'发私信'}).count(),1);
  await guestPage.getByRole('button',{name:'删除好友'}).click();
  await guestPage.getByRole('button',{name:'确认删除'}).click();
  await guestPage.getByText(`已删除好友 ${host.user.username}。`).waitFor();
  assert.equal(await guestPage.getByRole('link',{name:'发私信'}).count(),0);
  await hostPage.goto(base+'/#friends');
  await hostPage.getByRole('button',{name:'刷新好友与邀请'}).click();
  assert.equal(await hostPage.getByRole('link',{name:'发私信'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: add friend, chat, invite, remove friend with confirmation, mobile drawer');
}finally{
  await browser?.close();
  if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill();await stopped;}
  if(state.startsWith(join(tmpdir(),'sweetfrog-friends-browser-')))await rm(state,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}

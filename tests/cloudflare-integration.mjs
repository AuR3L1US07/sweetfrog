import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const state=mkdtempSync(join(tmpdir(),'sweetfrog-d1-test-'));
const cli=join(root,'node_modules/wrangler/bin/wrangler.js');
const port=44000+Math.floor(Math.random()*10000), origin=`http://127.0.0.1:${port}`;
const wrangler=(args)=>execFileSync(process.execPath,[cli,...args],{cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
let child;
try {
  wrangler(['d1','execute','sweetfrog-db','--local','--persist-to',state,'--file','cloudflare/schema.sql']);
  child=spawn(process.execPath,[cli,'pages','dev','dist','--port',String(port),'--persist-to',state],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  let logs=''; child.stdout.on('data',chunk=>logs+=chunk); child.stderr.on('data',chunk=>logs+=chunk);
  let ready=false;
  for(let i=0;i<120;i++) { try { if((await fetch(origin+'/api/session')).ok){ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,250)); }
  assert.ok(ready,logs);
  const call=async(path,method='GET',data,token,headers={})=>{
    const res=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
    return [res.status,await res.json()];
  };
  assert.equal((await fetch(origin+'/admin.js')).status,200);
  assert.match(await (await fetch(origin+'/admin.js')).text(),/import/);
  assert.equal((await call('/api/session'))[1].user,null);
  for(const path of ['/api/suggestions','/api/topics','/api/topics/1/replies','/api/leaderboards/tap']) assert.equal((await call(path,'POST',{}))[0],401);
  assert.equal((await call('/api/register','POST',{username:'testfrog',password:'password123'},undefined,{Origin:'https://untrusted.example'}))[0],403);
  const [registered,player]=await call('/api/register','POST',{username:'testfrog',password:'password123'});
  assert.equal(registered,200,JSON.stringify(player));
  const token=player.token;
  const avatarUrl=`/api/avatars/${player.user.id}`;
  assert.match((await (await fetch(origin+avatarUrl)).text()),/卡通青蛙头像/);
  assert.equal((await call('/api/profile/avatar','POST',{avatarData:null}))[0],401);
  assert.equal((await call('/api/profile/avatar','POST',{avatarData:'data:image/svg+xml;base64,AAA'},token))[0],400);
  assert.equal((await call('/api/profile/avatar','POST',{avatarData:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7L8AAAAASUVORK5CYII='},token))[0],200);
  assert.match((await fetch(origin+avatarUrl)).headers.get('content-type'),/image\/png/);
  assert.equal((await call('/api/profile/avatar','POST',{avatarData:null},token))[0],200);
  assert.match((await fetch(origin+avatarUrl)).headers.get('content-type'),/image\/svg\+xml/);

  assert.equal((await call('/api/register','POST',{username:'TESTFROG',password:'password123'}))[0],409);
  assert.equal((await call('/api/login','POST',{username:'testfrog',password:'wrong-password'}))[0],401);
  assert.equal((await call('/api/login','POST',{username:'testfrog',password:'password123'}))[0],200);
  const [suggestionStatus,suggestionCreated]=await call('/api/suggestions','POST',{title:'More frogs',body:'Please add them'},token);
  assert.equal(suggestionStatus,201);
  assert.equal((await call(`/api/suggestions/${suggestionCreated.id}`))[1].item.title,'More frogs');
  assert.equal((await call('/api/suggestions/999999'))[0],404);
  assert.equal((await call('/api/suggestions/1/vote','POST',{},token))[1].added,true);
  assert.equal((await call('/api/suggestions/1/vote','POST',{},token))[1].added,false);
  assert.equal((await call('/api/suggestions'))[1].items[0].votes,1);
  assert.equal((await call('/api/suggestions'))[1].items[0].userId,player.user.id);
  const [topicStatus,topicCreated]=await call('/api/topics','POST',{title:'Tips',body:'How to play?'},token);
  assert.equal(topicStatus,201);
  assert.equal((await call(`/api/topics/${topicCreated.id}`))[1].item.title,'Tips');
  assert.equal((await call('/api/topics/999999'))[0],404);
  assert.equal((await call('/api/topics/1/replies','POST',{body:'Practice'},token))[0],201);
  assert.equal((await call('/api/topics/1/replies'))[1].items.length,1);
  for(const game of ['tap','merge','flap','puzzle','aim']) {
    assert.equal((await call(`/api/leaderboards/${game}`,'POST',{score:20},token))[1].self.rank,1);
    assert.equal((await call(`/api/leaderboards/${game}`,'POST',{score:5},token))[1].self.score,20);
    assert.equal((await call(`/api/leaderboards/${game}`))[1].entries[0].score,20);
  }
  assert.equal((await call('/api/admin/overview'))[0],401);
  assert.equal((await call('/api/admin/overview','GET',undefined,token))[0],403);
  const [,admin]=await call('/api/register','POST',{username:'testadmin',password:'adminPassword123'});
  wrangler(['d1','execute','sweetfrog-db','--local','--persist-to',state,'--command',"UPDATE users SET role='admin' WHERE username='testadmin'"]);
  assert.equal((await call('/api/admin/overview','GET',undefined,admin.token))[1].users,2);
  assert.equal((await call('/api/admin/topics/1','DELETE',undefined,admin.token))[0],200);
  assert.equal((await call('/api/topics/1/replies'))[1].items.length,0);
  assert.equal((await call('/api/admin/suggestions/1','DELETE',undefined,admin.token))[0],200);
  assert.equal((await call('/api/suggestions'))[1].items.length,0);
  assert.equal((await call(`/api/admin/leaderboards/tap/${player.user.id}`,'DELETE',undefined,admin.token))[0],200);
  assert.equal((await call('/api/leaderboards/tap'))[1].entries.length,0);
  assert.equal((await call(`/api/admin/users/${admin.user.id}/ban`,'POST',{banned:true},admin.token))[0],403);
  assert.equal((await call(`/api/admin/users/${player.user.id}/ban`,'POST',{banned:true},admin.token))[0],200);
  assert.equal((await call('/api/session','GET',undefined,token))[1].user,null);
  assert.equal((await call('/api/login','POST',{username:'testfrog',password:'password123'}))[0],403);
  await call(`/api/admin/users/${player.user.id}/ban`,'POST',{banned:false},admin.token);
  assert.equal((await call('/api/session','GET',undefined,token))[1].user,null,'ban revokes sessions permanently');
  const [,newSession]=await call('/api/login','POST',{username:'testfrog',password:'password123'});
  assert.ok(newSession.token);
  await call('/api/logout','POST',{},newSession.token);
  assert.equal((await call('/api/session','GET',undefined,newSession.token))[1].user,null);
  await call('/api/login','POST',{username:'testfrog',password:'wrong-password'});
  assert.equal((await call('/api/login','POST',{username:'testfrog',password:'wrong-password'}))[0],429);
  assert.equal((await call('/api/profile'))[0],401);
  assert.equal((await call('/api/profile','GET',undefined,admin.token))[1].profile.username,'testadmin');
  assert.equal((await call('/api/profile/username','POST',{username:'newadmin',currentPassword:'wrong'},admin.token))[0],403);
  assert.equal((await call('/api/profile/username','POST',{username:'testfrog',currentPassword:'adminPassword123'},admin.token))[0],409);
  assert.equal((await call('/api/profile/username','POST',{username:'newadmin',currentPassword:'adminPassword123'},admin.token))[1].user.username,'newadmin');
  assert.equal((await call('/api/session','GET',undefined,admin.token))[1].user.username,'newadmin');
  assert.equal((await call('/api/profile/password','POST',{currentPassword:'wrong',newPassword:'changedPassword456!'},admin.token))[0],403);
  assert.equal((await call('/api/profile/password','POST',{currentPassword:'adminPassword123',newPassword:'adminPassword123'},admin.token))[0],400);
  assert.equal((await call('/api/profile/password','POST',{currentPassword:'adminPassword123',newPassword:'changedPassword456!'},admin.token))[0],200);
  assert.equal((await call('/api/session','GET',undefined,admin.token))[1].user,null);
  console.log('Cloudflare workerd/D1 integration passed: guest, auth, unique votes, replies, five rankings, admin, bans, logout, rate limits.');
} finally {
  if(child) { const exited=new Promise(r=>child.once('exit',r)); child.kill(); await exited; }
  // Only remove the specific test directory created above inside the OS temp directory.
  if(state.startsWith(join(tmpdir(),'sweetfrog-d1-test-'))) await rm(state,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}
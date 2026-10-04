import { communityRequest } from './community-transport.js';

const games = { tap:'逮住大青蛙', merge:'合成大青蛙', flap:'青蛙起飞', puzzle:'青蛙2048', aim:'青蛙定位练习' };
const routes = new Set(['suggestions','discussion','leaderboard','account']);
const $ = selector => document.querySelector(selector);
const el = (tag,className,text) => { const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node; };
const makeButton = (label,onClick,className='') => { const node=el('button',className,label);node.type='button';node.addEventListener('click',onClick);return node; };
const page = el('main','club-page'); page.id='club-page';page.hidden=true;
page.innerHTML=`<nav class="club-breadcrumb" aria-label="当前位置"><a href="#games">← 游戏大厅</a><span id="club-location"></span></nav><div id="club-content"></div>`;
$('#game-screen').before(page);
const nav=$('.site-header nav');
for(const [route,label] of [['suggestions','意见留言'],['discussion','玩家社区'],['leaderboard','排行榜'],['account','登录 / 注册']]){const link=el('a','club-nav-link',label);link.href='#'+route;link.dataset.clubNav=route;nav.insertBefore(link,$('#sound-toggle'));}
const rankLink=el('a','game-rank-link','查看本游戏排行榜 ↗');rankLink.href='#leaderboard';$('#game-screen .play-footer').before(rankLink);
let token='';try{token=localStorage.getItem('sweetfrog-session')||'';}catch{}
let user=null,rankGame='tap',accountMode='login',returnTo='games';
const friendlyError=error=>error.message||'暂时连接不上服务器，请稍后重试。';
async function request(path,options={}){
  return communityRequest(path,options,token);
}
async function refreshSession(){if(!token){user=null;return;}try{user=(await request('/api/session')).user;if(!user)clearSession();}catch{user=null;}}
function clearSession(){token='';user=null;try{localStorage.removeItem('sweetfrog-session');}catch{}}
function syncAdminLink(){let link=$('#admin-nav-link');if(user?.role==='admin'&&!link){link=el('a','club-nav-link','管理后台');link.id='admin-nav-link';link.href='./admin.html';$('#sound-toggle').before(link);}else if(user?.role!=='admin')link?.remove();}
function saveSession(data){token=data.token;user=data.user;try{localStorage.setItem('sweetfrog-session',token);}catch{}syncAdminLink();}
function heading(eyebrow,title,description){const wrap=el('div','club-heading');wrap.innerHTML=`<span class="eyebrow"></span><h1></h1><p></p>`;wrap.querySelector('.eyebrow').textContent=eyebrow;wrap.querySelector('h1').textContent=title;wrap.querySelector('p').textContent=description;return wrap;}
function notice(message){return el('p','club-notice',message);}
function time(value){const date=new Date(value.replace(' ','T')+'Z');return Number.isNaN(date.getTime())?'刚刚':new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(date);}
function gate(message){const wrap=el('div','club-gate');wrap.append(el('p','',message));const link=el('a','club-action','登录 / 注册 ↗');link.href='#account';link.addEventListener('click',()=>{returnTo=location.hash.slice(1)||'games';});wrap.append(link);return wrap;}
function form(label,max,submit){const node=el('form','club-form');node.innerHTML=`<label>标题<input name="title" required></label><label>内容<textarea name="body" required rows="4"></textarea></label><button type="submit"></button><p class="club-form-status" role="status"></p>`;node.querySelector('[name=title]').maxLength=80;node.querySelector('[name=body]').maxLength=max;node.querySelector('button').textContent=label;node.addEventListener('submit',async event=>{event.preventDefault();const button=node.querySelector('button'),status=node.querySelector('[role=status]');button.disabled=true;status.textContent='正在发布…';try{await submit({title:node.elements.title.value.trim(),body:node.elements.body.value.trim()});node.reset();status.textContent='发布成功！';await renderCurrent();}catch(error){status.textContent=friendlyError(error);}finally{button.disabled=false;}});return node;}
function cardHead(item){const head=el('div','club-card-head');head.append(el('strong','',item.username),el('time','',time(item.createdAt)));return head;}
async function suggestions(content){
  content.append(heading('YOUR IDEAS','意见留言','留下建议，给喜欢的提议点个赞。点赞越多，排得越靠前。'));
  if(user)content.append(form('发布提议 ↗',500,data=>request('/api/suggestions',{method:'POST',body:JSON.stringify(data)})));
  else content.append(gate('游客可以浏览提议；登录后可以发布和点赞。'));
  const list=el('div','club-list');content.append(list);list.append(notice('正在读取提议…'));
  try{const {items}=await request('/api/suggestions');list.replaceChildren();if(!items.length)list.append(notice('还没有提议，来发布第一条吧。'));
    for(const item of items){const card=el('article','club-card');const vote=makeButton(`▲ ${item.votes}`,async()=>{if(!user){returnTo='suggestions';location.hash='account';return;}vote.disabled=true;try{await request(`/api/suggestions/${item.id}/vote`,{method:'POST'});await renderCurrent();}catch(error){vote.disabled=false;card.append(notice(friendlyError(error)));}},'vote-button');vote.disabled=Boolean(item.voted);vote.setAttribute('aria-label',`为“${item.title}”点赞，当前 ${item.votes} 赞`);if(item.voted)vote.title='你已经点过赞';const body=el('div','club-card-content');body.append(cardHead(item),el('h2','',item.title),el('p','',item.body));card.append(vote,body);list.append(card);}
  }catch(error){list.replaceChildren(notice(friendlyError(error)));}
}
async function discussion(content){
  content.append(heading('FRIENDS TALK','玩家社区','分享玩法、挑战记录和新点子。游客可以围观，登录后加入讨论。'));
  if(user)content.append(form('发布话题 ↗',2000,data=>request('/api/topics',{method:'POST',body:JSON.stringify(data)})));
  else content.append(gate('游客可以阅读话题与回复；登录后可以发帖和回复。'));
  const list=el('div','club-list');content.append(list);list.append(notice('正在读取话题…'));
  try{const {items}=await request('/api/topics');list.replaceChildren();if(!items.length)list.append(notice('还没有话题，来发起第一场讨论吧。'));
    for(const item of items){const card=el('article','club-card topic-card');const body=el('div','club-card-content');body.append(cardHead(item),el('h2','',item.title),el('p','',item.body));const replies=el('div','club-replies');replies.hidden=true;const toggle=makeButton(`查看回复 · ${item.replyCount}`,async()=>{if(!replies.hidden){replies.hidden=true;return;}replies.hidden=false;replies.replaceChildren(notice('正在读取回复…'));try{const data=await request(`/api/topics/${item.id}/replies`);replies.replaceChildren();if(!data.items.length)replies.append(notice('还没有回复。'));for(const reply of data.items){const row=el('div','club-reply');row.append(cardHead(reply),el('p','',reply.body));replies.append(row);}if(user){const replyForm=el('form','club-reply-form');const field=el('textarea');field.required=true;field.maxLength=1000;field.rows=2;field.placeholder='说说你的看法…';field.setAttribute('aria-label','回复内容');const send=el('button','','发送回复');send.type='submit';const response=el('p','club-form-status');replyForm.append(field,send,response);replyForm.addEventListener('submit',async event=>{event.preventDefault();send.disabled=true;try{await request(`/api/topics/${item.id}/replies`,{method:'POST',body:JSON.stringify({body:field.value.trim()})});field.value='';response.textContent='回复成功';const data=await request(`/api/topics/${item.id}/replies`);replies.replaceChildren(...data.items.map(reply=>{const row=el('div','club-reply');row.append(cardHead(reply),el('p','',reply.body));return row;}),replyForm);toggle.textContent=`查看回复 · ${data.items.length}`;}catch(error){response.textContent=friendlyError(error);}finally{send.disabled=false;}});replies.append(replyForm);}else replies.append(gate('登录后可以回复这条话题。'));}catch(error){replies.replaceChildren(notice(friendlyError(error)));}},'club-text-button');body.append(toggle,replies);card.append(body);list.append(card);}
  }catch(error){list.replaceChildren(notice(friendlyError(error)));}
}
async function leaderboard(content){
  content.append(heading('HIGH SCORE CLUB','游戏排行榜','五个游戏各有榜单。游客可以看，登录玩家完成一局后自动上榜。'));
  const tabs=el('div','club-tabs');for(const [game,label] of Object.entries(games)){const tab=makeButton(label,()=>{rankGame=game;renderCurrent();},'club-tab');tab.classList.toggle('selected',game===rankGame);tab.setAttribute('aria-pressed',String(game===rankGame));tabs.append(tab);}content.append(tabs);
  const list=el('ol','club-ranks');content.append(list);list.append(notice('正在读取成绩…'));
  try{const data=await request(`/api/leaderboards/${rankGame}`);list.replaceChildren();if(!data.entries.length)list.append(notice('还没有玩家上榜，来拿第一名吧。'));
    for(const entry of data.entries){const item=el('li','club-rank');item.append(el('span','club-rank-num',String(entry.rank).padStart(2,'0')),el('span','club-rank-name',entry.username),el('strong','club-rank-score',`${entry.score} 分`));list.append(item);}
    content.append(el('div','club-my-rank',user?(data.self?`你的排名：第 ${data.self.rank} 名 · ${data.self.score} 分`:'你还未在这款游戏上榜，完成一局后自动提交。'):'游客可以看榜；注册登录后才能上榜。'));
  }catch(error){list.replaceChildren(notice(friendlyError(error)));}
}
function account(content){
  content.append(heading('JOIN THE CLUB','玩家身份','注册后可以提议、点赞、讨论和上榜；也可以先以游客身份逛逛。'));
  if(user){const card=el('div','account-card');card.append(el('h2','',`欢迎回来，${user.username}`),el('p','','你已登录，完成游戏后会自动记录最高分。'));if(user.role==='admin'){const link=el('a','club-action','进入管理后台 ↗');link.href='./admin.html';card.append(link);}card.append(makeButton('退出登录',async()=>{try{await request('/api/logout',{method:'POST'});}catch{}clearSession();syncAdminLink();renderCurrent();},'club-action'));content.append(card);return;}
  const tabs=el('div','club-tabs');for(const [mode,label] of [['login','登录'],['register','注册']]){const tab=makeButton(label,()=>{accountMode=mode;renderCurrent();},'club-tab');tab.classList.toggle('selected',accountMode===mode);tabs.append(tab);}content.append(tabs);
  const formNode=el('form','account-card account-form');formNode.innerHTML=`<label>玩家昵称<input name="username" autocomplete="username" minlength="3" maxlength="20" required></label><label>密码<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><button type="submit"></button><p role="status"></p>`;
  formNode.querySelector('button').textContent=accountMode==='register'?'创建账号 ↗':'登录 ↗';formNode.querySelector('[name=password]').autocomplete=accountMode==='register'?'new-password':'current-password';
  formNode.addEventListener('submit',async event=>{event.preventDefault();const button=formNode.querySelector('button'),status=formNode.querySelector('[role=status]');button.disabled=true;status.textContent='正在处理…';try{const data=await request('/api/'+accountMode,{method:'POST',body:JSON.stringify({username:formNode.elements.username.value.trim(),password:formNode.elements.password.value})});saveSession(data);location.hash=returnTo;returnTo='games';}catch(error){status.textContent=friendlyError(error);}finally{button.disabled=false;}});
  content.append(formNode);const guest=el('a','guest-link','游客登录 · 先逛逛 →');guest.href='#games';content.append(guest);
}
async function renderCurrent(){const route=location.hash.slice(1),visible=routes.has(route);page.hidden=!visible;if(!visible)return;$('#lobby').hidden=true;$('#game-screen').hidden=true;const content=el('div');content.id='club-content';$('#club-content').replaceWith(content);$('#club-location').textContent={suggestions:'意见留言',discussion:'玩家社区',leaderboard:'排行榜',account:'登录 / 注册'}[route];document.querySelectorAll('[data-club-nav]').forEach(link=>link.classList.toggle('active',link.dataset.clubNav===route));if(route==='suggestions')await suggestions(content);else if(route==='discussion')await discussion(content);else if(route==='leaderboard')await leaderboard(content);else account(content);}
window.addEventListener('hashchange',renderCurrent);
window.addEventListener('sweetfrog:finished',async event=>{if(!user)return;const {game,score}=event.detail;if(!games[game])return;try{await request(`/api/leaderboards/${game}`,{method:'POST',body:JSON.stringify({score})});}catch(error){console.warn('成绩提交失败:',friendlyError(error));}});
await refreshSession();syncAdminLink();renderCurrent();

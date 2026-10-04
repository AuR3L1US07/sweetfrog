import { iconSvg } from './icons.js';

const names={tap:'逮住大青蛙',merge:'合成大青蛙',flap:'青蛙起飞',puzzle:'青蛙2048',aim:'青蛙定位练习'};
const page=document.createElement('main');page.id='match-page';page.hidden=true;
page.innerHTML='<nav class="club-breadcrumb" aria-label="当前位置"><a href="#games">← 游戏大厅</a><span>快速匹配</span></nav><div id="match-content"></div>';
document.querySelector('#game-screen').before(page);
const nav=document.createElement('a');nav.href='#match';nav.className='club-nav-link';nav.textContent='快速匹配';document.querySelector('.club-nav-link')?.after(nav);
const content=page.querySelector('#match-content');
const make=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
const token=()=>{try{return localStorage.getItem('sweetfrog-session')||'';}catch{return '';}};
let visitorId;try{visitorId=localStorage.getItem('sweetfrog-visitor-id');if(!/^[a-f0-9]{32}$/.test(visitorId||'')){visitorId=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('sweetfrog-visitor-id',visitorId);}}catch{visitorId=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
let selected='tap',user=null,queue=null,queueTimer=0,countsTimer=0,successTimer=0,routeId=0,queueVersion=0,requesting=false,latestCounts=null,shownRoom='';
async function api(path,options={}){
  const response=await fetch('/api/'+path,{method:options.method||'GET',headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'连接失败，请稍后重试');return data;
}
async function presence(){
  if(document.hidden)return;
  try{const data=await api('presence',{method:'POST',body:{visitorId,game:page.hidden?null:selected}});updateCounts(data);}catch{}
}
function updateCounts(data){
  latestCounts=data;const total=document.querySelector('#online-total');if(total)total.textContent=String(data.total);
  for(const [game] of Object.entries(names)){
    const card=content.querySelector(`[data-match-game="${game}"]`);if(!card)continue;
    card.querySelector('.match-mode-online strong').textContent=String(data.online[game]||0);
    card.querySelector('.match-mode-waiting strong').textContent=String(data.waiting[game]||0);
  }
  const pageTotal=content.querySelector('#match-total');if(pageTotal)pageTotal.textContent=String(data.total);
}
async function refreshCounts(){try{updateCounts(await api('presence'));}catch{}}
function setMessage(value){const node=content.querySelector('#match-message');if(node)node.textContent=value;}
function choose(game){
  if(queue||requesting)return;selected=game;
  for(const card of content.querySelectorAll('[data-match-game]')){const active=card.dataset.matchGame===game;card.classList.toggle('selected',active);card.setAttribute('aria-pressed',String(active));}
  const button=content.querySelector('#match-start');if(button)button.textContent=`匹配「${names[game]}」对手 →`;
  presence();
}
function showSearching(){
  const panel=content.querySelector('#match-searching');if(!panel)return;
  const wasHidden=panel.hidden;
  panel.hidden=false;content.querySelector('#match-modes').hidden=true;content.querySelector('#match-start').hidden=true;
  panel.querySelector('.match-search-title').textContent=`正在寻找「${names[queue.game]}」对手`;
  panel.querySelector('.match-search-sub').textContent='找到玩家后会自动进入同一场对局。';
  page.querySelector('#match-found').hidden=true;
  if(wasHidden)requestAnimationFrame(()=>panel.scrollIntoView({block:'center',behavior:'instant'}));
}
function showIdle(){
  content.querySelector('#match-searching').hidden=true;content.querySelector('#match-modes').hidden=false;content.querySelector('#match-start').hidden=!user;
  page.querySelector('#match-found').hidden=true;choose(selected);
}
async function handleQueue(next,id=routeId,version=queueVersion){
  if(id!==routeId||version!==queueVersion||page.hidden)return;
  if(next?.status==='matched'&&next.roomCode===shownRoom)return;
  queue=next;
  if(!next){clearInterval(queueTimer);queueTimer=0;showIdle();setMessage('匹配已结束，可以重新开始。');return;}
  if(next.status==='matched'&&next.roomCode){
    shownRoom=next.roomCode;
    clearInterval(queueTimer);queueTimer=0;
    const found=page.querySelector('#match-found');found.hidden=false;content.querySelector('#match-searching').hidden=true;content.querySelector('#match-modes').hidden=true;content.querySelector('#match-start').hidden=true;
    found.querySelector('.match-found-game').textContent=names[next.game];
    found.querySelector('.match-found-copy').textContent='对手已就位，准备进入对局…';
    const self=found.querySelector('.match-duel-self'),opponent=found.querySelector('.match-duel-opponent');
    self.querySelector('strong').textContent=user?.username||'你';self.querySelector('img').src=user?`/api/avatars/${user.id}`:'./assets/default-frog-avatar.svg';
    opponent.querySelector('strong').textContent='新对手';opponent.querySelector('img').src='./assets/default-frog-avatar.svg';
    api('pk/rooms/'+next.roomCode).then(data=>{
      if(page.hidden||queue?.roomCode!==next.roomCode)return;
      const other=data.room.host.id===user?.id?data.room.guest:data.room.host;
      if(other){opponent.querySelector('strong').textContent=other.name;opponent.querySelector('img').src=`/api/avatars/${other.id}`;}
    }).catch(()=>{});
    window.dispatchEvent(new CustomEvent('sweetfrog:match-found'));
    requestAnimationFrame(()=>found.scrollIntoView({block:'center',behavior:'instant'}));
    clearTimeout(successTimer);successTimer=setTimeout(()=>{if(location.hash==='#match')location.hash='pk/'+next.roomCode;},1900);
    return;
  }
  showSearching();
  if(!queueTimer)queueTimer=setInterval(pollQueue,1400);
}
let polling=false;
async function pollQueue(){
  if(polling||page.hidden||!queue||queue.status==='matched')return;polling=true;const id=routeId,version=queueVersion;
  try{const data=await api('match/queue');if(id!==routeId||version!==queueVersion)return;await handleQueue(data.queue,id,version);if(data.queue)setMessage('');}
  catch(error){setMessage(error.message);}
  finally{polling=false;}
}
async function start(){
  if(!user||requesting||queue)return;requesting=true;const id=routeId,version=++queueVersion;const button=content.querySelector('#match-start');button.disabled=true;setMessage('正在加入匹配…');
  try{await handleQueue((await api('match/queue',{method:'POST',body:{game:selected}})).queue,id,version);if(id===routeId&&version===queueVersion)setMessage('');}
  catch(error){setMessage(error.message);}finally{requesting=false;button.disabled=false;}
}
async function cancel(){
  if(!queue||requesting)return;requesting=true;const id=routeId,version=++queueVersion;
  try{await api('match/queue',{method:'DELETE'});if(id!==routeId||version!==queueVersion)return;clearInterval(queueTimer);queueTimer=0;queue=null;shownRoom='';showIdle();setMessage('已取消匹配。');}
  catch(error){if(id===routeId&&version===queueVersion){setMessage(error.message);try{await handleQueue((await api('match/queue')).queue,id,version);}catch{}}}
  finally{requesting=false;}
}
function render(){
  content.replaceChildren();
  const head=make('div','club-heading');head.innerHTML='<span class="eyebrow">QUICK MATCH</span><h1>快速匹配</h1><p>选一款游戏，找到同场对手。30 秒见分晓。</p>';
  const stats=make('div','match-summary');stats.innerHTML=`<span class="match-summary-icon">${iconSvg('people')}</span><span>大厅在线 <strong id="match-total">—</strong> 人</span><small>约 1 分钟内活跃</small>`;
  const modes=make('div','match-modes');modes.id='match-modes';
  for(const [game,name] of Object.entries(names)){
    const button=make('button','match-mode');button.type='button';button.dataset.matchGame=game;
    button.innerHTML=`<span class="match-mode-icon">${iconSvg(game==='aim'?'target':game==='tap'?'frog':game==='merge'?'add':game==='flap'?'stars':'match')}</span><strong>${name}</strong><span class="match-mode-online"><i></i><strong>0</strong> 人在此模式</span><span class="match-mode-waiting"><strong>0</strong> 人正在匹配</span>`;
    button.addEventListener('click',()=>choose(game));modes.append(button);
  }
  const searching=make('section','match-searching');searching.id='match-searching';searching.hidden=true;
  searching.innerHTML=`<div class="match-orbit"><span>${iconSvg('frog')}</span><i></i><i></i></div><h2 class="match-search-title"></h2><p class="match-search-sub"></p>`;
  const cancelButton=make('button','match-cancel','取消匹配');cancelButton.type='button';cancelButton.addEventListener('click',cancel);searching.append(cancelButton);
  const found=make('section','match-found');found.id='match-found';found.hidden=true;
  found.innerHTML=`<div class="match-found-rays" aria-hidden="true"></div><div class="match-found-icon">${iconSvg('match')}</div><h2>匹配成功！</h2><strong class="match-found-game"></strong><div class="match-duel"><span class="match-duel-self"><img alt="" src="./assets/default-frog-avatar.svg"><strong>你</strong></span><b>VS</b><span class="match-duel-opponent"><img alt="" src="./assets/default-frog-avatar.svg"><strong>新对手</strong></span></div><p class="match-found-copy"></p>`;
  const startButton=make('button','pk-main-button match-start');startButton.id='match-start';startButton.type='button';startButton.addEventListener('click',start);
  const message=make('p','match-message','');message.id='match-message';message.setAttribute('role','status');
  content.append(head,stats,modes,startButton,searching,found,message);
  if(!user){startButton.hidden=true;const gate=make('p','match-login','匹配对战需要玩家账号。');const link=make('a','','登录 / 注册 →');link.href='#account';link.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('sweetfrog:login-return',{detail:'match'})));gate.append(link);content.insertBefore(gate,startButton);}
  choose(selected);if(latestCounts)updateCounts(latestCounts);
}
async function route(){
  const active=location.hash==='#match',id=++routeId;++queueVersion;
  if(!active){
    clearInterval(queueTimer);clearInterval(countsTimer);clearTimeout(successTimer);queueTimer=countsTimer=0;
    if(queue&&queue.status!=='matching')api('match/queue',{method:'DELETE',body:{ack:true}}).catch(()=>{});
    queue=null;shownRoom='';page.hidden=true;nav.classList.remove('active');presence();return;
  }
  page.hidden=false;nav.classList.add('active');document.querySelector('#lobby').hidden=true;document.querySelector('#game-screen').hidden=true;document.querySelector('#club-page').hidden=true;
  content.replaceChildren(make('p','club-notice','正在打开匹配大厅…'));
  try{user=(await api('session')).user;}catch{user=null;}
  if(id!==routeId)return;
  render();await presence();
  if(user){try{const data=await api('match/queue');if(id===routeId&&data.queue)await handleQueue(data.queue);}catch(error){setMessage(error.message);}}
  countsTimer=setInterval(refreshCounts,5000);
}
window.addEventListener('hashchange',route);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){presence();if(!page.hidden)pollQueue();}});
setInterval(presence,25000);route();

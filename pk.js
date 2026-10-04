import { PK_DURATION_MS, pkRows } from './pk-core.js';

const page = document.createElement('main');
page.id = 'pk-page';
page.hidden = true;
page.innerHTML = '<nav class="club-breadcrumb" aria-label="当前位置"><a href="#games">← 游戏大厅</a><span>好友 PK</span></nav><div id="pk-content"></div>';
document.querySelector('#game-screen').before(page);
const nav = document.createElement('a');
nav.className = 'club-nav-link';
nav.href = '#pk';
nav.textContent = '好友 PK';
document.querySelector('.site-header nav a[href="#games"]').after(nav);

const content = page.querySelector('#pk-content');
const make = (tag, className, text) => { const node = document.createElement(tag);node.className = className;if(text!==undefined)node.textContent=text;return node; };
let me = null, room = null, localScore = null, pendingHits = 0, hitQueue = Promise.resolve();
let routeId = 0, pollTimer = 0, tickTimer = 0, polling = false, clockOffset = 0;
let viewCode = '', errorMessage = '';
const token = () => { try { return localStorage.getItem('sweetfrog-session') || ''; } catch { return ''; } };
const now = () => Date.now() - clockOffset;

async function api(path, options={}) {
  const response = await fetch('/api/pk/rooms' + path, {
    method:options.method || 'GET',
    headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},
    body:options.body===undefined?undefined:JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if(!response.ok) throw Error(data.error || '连接失败，请稍后重试');
  return data;
}

function stopTimers() { clearInterval(pollTimer);clearInterval(tickTimer);pollTimer=0;tickTimer=0;polling=false; }
function alertText(text) { const status=content.querySelector('#pk-error');if(status)status.textContent=text;else errorMessage=text; }
function loginGate() {
  const card=make('section','pk-intro-card');
  card.append(make('h2','','先用玩家账号加入'),make('p','','好友 PK 会显示你的昵称并保存本局成绩。登录后即可创建或加入房间。'));
  const link=make('a','pk-main-button','登录 / 注册 ↗');link.href='#account';
  link.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('sweetfrog:login-return',{detail:location.hash.slice(1)})));
  card.append(link);content.append(card);
}
function landing() {
  content.replaceChildren();
  const head=make('div','club-heading');head.innerHTML='<span class="eyebrow">FRIEND VS FRIEND</span><h1>好友 PK</h1><p>开一间房，叫上朋友，同时挑战「逮住大青蛙」。30 秒后见分晓。</p>';
  content.append(head);
  if(!me){loginGate();return;}
  const grid=make('div','pk-entry-grid');
  const create=make('section','pk-entry-card');create.append(make('span','pk-entry-icon','✳'),make('h2','','我来开房'),make('p','','生成房间码，分享给朋友。两人准备好后一起开局。'));
  const createButton=make('button','pk-main-button','创建房间 →');createButton.type='button';
  createButton.addEventListener('click',async()=>{createButton.disabled=true;alertText('正在创建房间…');try{const data=await api('',{method:'POST'});location.hash='pk/'+data.room.code;}catch(error){alertText(error.message);createButton.disabled=false;}});
  create.append(createButton);
  const join=make('section','pk-entry-card');join.append(make('span','pk-entry-icon','↗'),make('h2','','加入朋友的房间'),make('p','','输入六位房间码，和朋友进入同一场对局。'));
  const joinForm=make('form','pk-join-form');const input=make('input','');input.name='code';input.maxLength=6;input.required=true;input.autocomplete='off';input.placeholder='输入房间码';input.setAttribute('aria-label','六位房间码');
  const joinButton=make('button','pk-main-button','加入房间');joinButton.type='submit';joinForm.append(input,joinButton);
  joinForm.addEventListener('submit',async event=>{event.preventDefault();const code=input.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'');if(code.length!==6){alertText('请输入六位房间码。');return;}joinButton.disabled=true;alertText('正在加入房间…');try{await api('/'+code+'/join',{method:'POST'});location.hash='pk/'+code;}catch(error){alertText(error.message);joinButton.disabled=false;}});
  join.append(joinForm);grid.append(create,join);content.append(grid,make('p','pk-error',''));content.lastChild.id='pk-error';
  if(errorMessage){alertText(errorMessage);errorMessage='';}
}

function playerCard(label) {
  const card=make('div','pk-player');const avatar=make('img','pk-avatar');avatar.alt='玩家头像';avatar.src='./assets/default-frog-avatar.svg';
  avatar.onerror=()=>{avatar.onerror=null;avatar.src='./assets/default-frog-avatar.svg';};
  const copy=make('div','pk-player-copy');copy.append(make('span','pk-player-label',label),make('strong','pk-player-name','等待加入'));
  card.append(avatar,copy,make('strong','pk-player-score','0'));return card;
}
function mountRoom(code) {
  content.replaceChildren();viewCode=code;localScore=null;pendingHits=0;hitQueue=Promise.resolve();
  const head=make('div','club-heading');head.innerHTML='<span class="eyebrow">LIVE FRIEND MATCH</span><h1>逮住大青蛙 · PK</h1><p>双方同题，30 秒比手速。只点最底下一排的头像。</p>';
  const back=make('a','forum-back','← 返回好友 PK');back.href='#pk';
  const roomCard=make('section','pk-room-card');
  const info=make('div','pk-room-info');info.append(make('span','','房间码'),make('strong','',code));
  const share=make('button','pk-share','复制邀请链接');share.type='button';share.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);share.textContent='已复制，发给朋友吧';}catch{share.textContent='请复制浏览器地址分享';}});
  const players=make('div','pk-players');players.append(playerCard('房主'),make('span','pk-versus','VS'),playerCard('挑战者'));
  const status=make('div','pk-status','正在连接房间…');status.id='pk-status';status.setAttribute('role','status');
  const ready=make('button','pk-main-button pk-ready','准备好了 →');ready.id='pk-ready';ready.type='button';ready.hidden=true;
  ready.addEventListener('click',async()=>{ready.disabled=true;try{const data=await api('/'+code+'/ready',{method:'POST'});applyRoom(data.room);}catch(error){alertText(error.message);ready.disabled=false;}});
  roomCard.append(info,share,players,status,ready);
  const game=make('section','pk-game');game.hidden=true;game.id='pk-game';
  const top=make('div','pk-game-top');top.append(make('strong','pk-timer','30.0 秒'),make('span','','D / F / J / K 也能操作'));
  const board=make('div','pk-board');board.id='pk-board';
  board.addEventListener('pointerdown',event=>{const cell=event.target.closest('.pk-cell');if(cell){event.preventDefault();hit(Number(cell.dataset.col));}});
  game.append(top,board);content.append(head,back,roomCard,game,make('p','pk-error',''));
  content.lastChild.id='pk-error';
}

function renderBoard() {
  if(!room||localScore===null)return;
  const rows=pkRows(room.seed,localScore),board=content.querySelector('#pk-board');if(!board)return;
  board.replaceChildren();
  for(let row=0;row<5;row++){
    const line=make('div','pk-row');
    for(let col=0;col<4;col++){
      const cell=make('button','pk-cell'+(rows[row]===col?' face':''));cell.type='button';cell.dataset.col=String(col);
      cell.setAttribute('aria-label',`第${row+1}排第${col+1}列${rows[row]===col?'头像':'空格'}`);
      if(rows[row]===col){const image=make('img','');image.src=`./assets/photo-${(localScore+row)%5+1}.jpg`;image.alt='';image.draggable=false;cell.append(image);}
      line.append(cell);
    }
    board.append(line);
  }
}

function phaseFor(roomState) {
  if(!roomState.startsAt)return roomState.guest?'ready':'waiting';
  const time=now();return time<roomState.startsAt?'countdown':time<roomState.endsAt?'playing':'finished';
}
function tick() {
  if(!room||viewCode!==room.code)return;
  const phase=phaseFor(room),status=content.querySelector('#pk-status'),game=content.querySelector('#pk-game');
  const own=me?.id===room.host.id?room.host:room.guest;
  const ready=content.querySelector('#pk-ready');
  ready.hidden=phase!=='ready'||!own||own.ready;
  if(phase==='waiting')status.textContent='等待朋友加入…复制链接发给对方吧。';
  else if(phase==='ready')status.textContent=own?.ready?'已准备，等待朋友点击准备。':'朋友已加入，点“准备好了”即可开局。';
  else if(phase==='countdown')status.textContent=`准备开局 · ${Math.max(1,Math.ceil((room.startsAt-now())/1000))}`;
  else if(phase==='playing')status.textContent='PK 进行中 · 稳住，别点错！';
  else if(pendingHits)status.textContent='时间到，正在核对最后的成绩…';
  else status.textContent=room.host.score===room.guest.score?'平局！再开一房继续比吧。':room.winnerId===me?.id?'你赢了！这局手速属于你。':'这局朋友更快，下次扳回来！';
  game.hidden=phase!=='playing';
  const timer=content.querySelector('.pk-timer');if(timer)timer.textContent=`${Math.max(0,(room.endsAt-now())/1000).toFixed(1)} 秒`;
  if(phase==='playing'&&localScore===null){localScore=own?.score||0;renderBoard();}
}
function applyRoom(next) {
  if(viewCode!==next.code)return;
  if(room&&room.code===next.code&&(next.host.score<room.host.score||next.guest?.score<(room.guest?.score||0)))return;
  clockOffset=Date.now()-next.serverNow;
  room=next;
  const cards=content.querySelectorAll('.pk-player');
  for(const [index,player] of [room.host,room.guest].entries()){
    const card=cards[index];card.querySelector('.pk-player-name').textContent=player?.name||'等待加入';
    card.querySelector('.pk-player-score').textContent=String(player?.score||0);
    card.querySelector('.pk-avatar').src=player?`/api/avatars/${player.id}`:'./assets/default-frog-avatar.svg';
    card.classList.toggle('is-self',player?.id===me?.id);
    card.classList.toggle('is-ready',Boolean(player?.ready));
  }
  const own=me?.id===room.host.id?room.host:room.guest;
  if(localScore!==null&&pendingHits===0&&localScore!==own.score){localScore=own.score;renderBoard();}
  if(localScore!==null&&cards.length)cards[me?.id===room.host.id?0:1].querySelector('.pk-player-score').textContent=String(localScore);
  tick();
}
async function poll() {
  if(polling||!viewCode||page.hidden)return;polling=true;
  try{const data=await api('/'+viewCode);applyRoom(data.room);alertText('');}
  catch(error){alertText(error.message);}
  finally{polling=false;}
}
function hit(col) {
  if(!room||phaseFor(room)!=='playing'||localScore===null)return;
  const rows=pkRows(room.seed,localScore);
  if(rows[4]!==col){const board=content.querySelector('#pk-board');board.classList.remove('miss');void board.offsetWidth;board.classList.add('miss');window.dispatchEvent(new CustomEvent('sweetfrog:pk-hit',{detail:{correct:false}}));return;}
  const step=localScore++;pendingHits++;renderBoard();
  content.querySelectorAll('.pk-player')[me.id===room.host.id?0:1].querySelector('.pk-player-score').textContent=String(localScore);
  window.dispatchEvent(new CustomEvent('sweetfrog:pk-hit',{detail:{correct:true}}));
  const code=room.code;
  hitQueue=hitQueue.then(async()=>{try{const data=await api('/'+code+'/hit',{method:'POST',body:{col,step}});applyRoom(data.room);}catch(error){alertText(error.message);}finally{pendingHits--;if(pendingHits===0)await poll();}});
}
async function route() {
  const match=/^pk(?:\/([A-HJ-NP-Z2-9]{6}))?$/.exec(location.hash.slice(1).toUpperCase().replace(/^PK/,'pk'));
  const id=++routeId;stopTimers();room=null;viewCode='';page.hidden=!match;nav.classList.toggle('active',Boolean(match));
  if(!match)return;
  document.querySelector('#lobby').hidden=true;document.querySelector('#game-screen').hidden=true;
  document.querySelector('#club-page').hidden=true;
  content.replaceChildren(make('p','club-notice','正在加载好友 PK…'));
  try{const response=await fetch('/api/session',{headers:token()?{Authorization:`Bearer ${token()}`}:{}});me=(await response.json()).user;}catch{me=null;}
  if(id!==routeId)return;
  if(!match[1]){landing();return;}
  const code=match[1];
  if(!me){landing();return;}
  mountRoom(code);
  try{let data;try{data=await api('/'+code);}catch{data=await api('/'+code+'/join',{method:'POST'});}if(id!==routeId)return;applyRoom(data.room);}
  catch(error){if(id!==routeId)return;alertText(error.message);content.querySelector('#pk-status').textContent='无法进入房间';return;}
  pollTimer=setInterval(poll,800);tickTimer=setInterval(tick,100);
}
window.addEventListener('hashchange',route);
window.addEventListener('keydown',event=>{if(page.hidden||!room||event.repeat||/INPUT|TEXTAREA/.test(document.activeElement?.tagName))return;const col=['d','f','j','k'].indexOf(event.key.toLowerCase());if(col>=0){event.preventDefault();hit(col);}});
route();

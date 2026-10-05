import { PK_DURATION_MS, pkRows } from './pk-core.js';
import { launchPkGame, stopPkGame } from './app.js?v=20261005-history';
import { iconSvg } from './icons.js';

const games={tap:'逮住大青蛙',merge:'合成大青蛙',flap:'青蛙起飞',puzzle:'青蛙2048',aim:'青蛙定位练习'};

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
let me = null, room = null, localScore = null, pendingHits = 0, hitBuffer = [], hitSending = false, hitTimer = 0, finalSyncedRound = 0;
let routeId = 0, pollTimer = 0, tickTimer = 0, polling = false, clockOffset = 0;
let viewCode = '', errorMessage = '';
let pkLaunched=false,pkResultShown=false,scoreSeq=0,latestScore=null,scoreTimer=0,scoreSending=false,pendingScores=0;
let resultAnnouncedRound=0,focusedRound=0,rematchBusy=false;
let lastTapAttempt=0;const heldPkKeys=new Set();
let inviteListAt=0;
const token = () => { try { return localStorage.getItem('sweetfrog-session') || localStorage.getItem('sweetfrog-guest-session') || ''; } catch { return ''; } };
const now = () => Date.now() - clockOffset;

async function api(path, options={}) {
  const sentAt=Date.now();
  const response = await fetch('/api/pk/rooms' + path, {
    method:options.method || 'GET',
    headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},
    body:options.body===undefined?undefined:JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if(!response.ok) throw Error(data.error || '连接失败，请稍后重试');
  if(data.room?.serverNow)clockOffset=Math.round((sentAt+Date.now())/2-data.room.serverNow);
  return data;
}

function stopTimers() { clearInterval(pollTimer);clearInterval(tickTimer);clearTimeout(scoreTimer);clearTimeout(hitTimer);pollTimer=0;tickTimer=0;scoreTimer=0;hitTimer=0;polling=false; }
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
  const head=make('div','club-heading');head.innerHTML='<span class="eyebrow">FRIEND VS FRIEND</span><h1>好友 PK</h1><p>选五款游戏中的一款，开房叫上朋友。30 秒同场比拼。</p>';
  content.append(head);
  if(!me||me.role==='guest'){loginGate();return;}
  const grid=make('div','pk-entry-grid');
  const create=make('section','pk-entry-card');const createIcon=make('span','pk-entry-icon');createIcon.innerHTML=iconSvg('add');create.append(createIcon,make('h2','','我来开房'),make('p','','先选游戏，再把房间链接发给朋友。'));
  const choice=make('fieldset','pk-game-choice');choice.append(make('legend','','选择对战游戏'));
  for(const [key,label] of Object.entries(games)){const option=make('label','pk-game-option');const input=make('input','');input.type='radio';input.name='pk-game';input.value=key;input.checked=key==='tap';option.append(input,make('span','',label));choice.append(option);}
  create.append(choice);
  const createButton=make('button','pk-main-button','创建房间 →');createButton.type='button';
  createButton.addEventListener('click',async()=>{createButton.disabled=true;alertText('正在创建房间…');try{const game=choice.querySelector('input:checked').value;const data=await api('',{method:'POST',body:{game}});location.hash='pk/'+data.room.code;}catch(error){alertText(error.message);createButton.disabled=false;}});
  create.append(createButton);
  const join=make('section','pk-entry-card');const joinIcon=make('span','pk-entry-icon');joinIcon.innerHTML=iconSvg('join');join.append(joinIcon,make('h2','','加入朋友的房间'),make('p','','输入六位房间码，和朋友进入同一场对局。'));
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
  content.replaceChildren();viewCode=code;localScore=null;pendingHits=0;hitBuffer=[];hitSending=false;finalSyncedRound=0;pkLaunched=false;pkResultShown=false;scoreSeq=0;latestScore=null;scoreSending=false;pendingScores=0;resultAnnouncedRound=0;focusedRound=0;rematchBusy=false;inviteListAt=0;
  const head=make('div','club-heading');head.innerHTML='<span class="eyebrow">LIVE FRIEND MATCH</span><h1 id="pk-game-title">好友 PK</h1><p id="pk-game-description">正在读取房间选择的游戏…</p>';
  const back=make('a','forum-back','← 返回好友 PK');back.href='#pk';
  const roomCard=make('section','pk-room-card');
  const info=make('div','pk-room-info');info.append(make('span','','房间码'),make('strong','',code),make('span','pk-room-game',''));
  const share=make('button','pk-share','复制邀请链接');share.type='button';share.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);share.textContent='已复制，发给朋友吧';}catch{share.textContent='请复制浏览器地址分享';}});
  const players=make('div','pk-players');players.append(playerCard('房主'),make('span','pk-versus','VS'),playerCard('挑战者'));
  const status=make('div','pk-status','正在连接房间…');status.id='pk-status';status.setAttribute('role','status');
  const ready=make('button','pk-main-button pk-ready','准备好了 →');ready.id='pk-ready';ready.type='button';ready.hidden=true;
  ready.addEventListener('click',async()=>{ready.disabled=true;try{const data=await api('/'+code+'/ready',{method:'POST'});applyRoom(data.room);}catch(error){alertText(error.message);ready.disabled=false;}});
  roomCard.append(info,share,players,status,ready);
  const invitePanel=make('section','pk-invite-panel');invitePanel.id='pk-invite-panel';invitePanel.hidden=true;
  const inviteHeading=make('div','pk-invite-heading');inviteHeading.append(make('h2','','邀请在线好友'));
  const refreshInvite=make('button','pk-quiet-button','刷新好友');refreshInvite.type='button';refreshInvite.addEventListener('click',()=>loadInviteFriends(true));inviteHeading.append(refreshInvite);
  const inviteList=make('div','pk-invite-list');inviteList.id='pk-invite-list';invitePanel.append(inviteHeading,inviteList);
  const game=make('section','pk-game');game.hidden=true;game.id='pk-game';
  const top=make('div','pk-game-top');top.append(make('strong','pk-timer','30.0 秒'),make('span','','D / F / J / K 也能操作'));
  const board=make('div','pk-board');board.id='pk-board';
  board.addEventListener('pointerdown',event=>{const cell=event.target.closest('.pk-cell');if(cell){event.preventDefault();hit(Number(cell.dataset.col));}});
  game.append(top,board);
  const result=make('section','pk-result');result.id='pk-result';result.hidden=true;result.setAttribute('aria-live','polite');
  const burst=make('div','pk-result-burst');burst.setAttribute('aria-hidden','true');for(let i=0;i<12;i++)burst.append(make('i',''));
  const resultIcon=make('div','pk-result-icon'),resultTitle=make('h2','pk-result-title','本局结束'),resultCopy=make('p','pk-result-copy','');
  const rematchNote=make('p','pk-rematch-note','');const rematch=make('button','pk-main-button pk-rematch','不服？再来一局');rematch.type='button';rematch.addEventListener('click',()=>rematchAction('request'));
  const accept=make('button','pk-main-button pk-rematch-accept','同意，再来一局 →');accept.type='button';accept.addEventListener('click',()=>rematchAction('accept'));
  const cancel=make('button','pk-quiet-button','撤回邀约');cancel.type='button';cancel.addEventListener('click',()=>rematchAction('cancel'));
  const actions=make('div','pk-result-actions');actions.append(rematch,accept,cancel);result.append(burst,resultIcon,resultTitle,resultCopy,rematchNote,actions);
  content.append(head,back,roomCard,invitePanel,game,result,make('p','pk-error',''));
  content.lastChild.id='pk-error';
}
async function loadInviteFriends(force=false){
  if(!room||room.host.id!==me?.id||room.guest||room.startsAt)return;
  if(!force&&Date.now()-inviteListAt<20000)return;inviteListAt=Date.now();
  const code=room.code,list=content.querySelector('#pk-invite-list');if(!list)return;list.replaceChildren(make('p','pk-invite-note','正在查找在线好友…'));
  try{
    const response=await fetch('/api/friends',{headers:token()?{Authorization:`Bearer ${token()}`}:{}});
    const data=await response.json();if(!response.ok)throw Error(data.error||'无法读取好友');
    if(viewCode!==code||room?.guest||room?.startsAt)return;
    const online=data.friends.filter(friend=>friend.online);list.replaceChildren();
    if(!online.length){const note=make('p','pk-invite-note','暂无在线好友。');const link=make('a','','去添加好友 →');link.href='#friends';note.append(link);list.append(note);return;}
    for(const friend of online){
      const row=make('div','pk-invite-friend'),avatar=make('img','pk-avatar');avatar.src=`/api/avatars/${friend.id}`;avatar.alt='';avatar.onerror=()=>{avatar.onerror=null;avatar.src='./assets/default-frog-avatar.svg';};
      const button=make('button','pk-main-button','邀请对战');button.type='button';button.addEventListener('click',async()=>{
        button.disabled=true;try{const response=await fetch('/api/pk/invites',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({code,userId:friend.id})});const result=await response.json();if(!response.ok)throw Error(result.error||'邀请失败');button.textContent='已邀请，等待接受';}
        catch(error){alertText(error.message);button.disabled=false;}
      });row.append(avatar,make('strong','',friend.username),button);list.append(row);
    }
  }catch(error){if(viewCode===code)list.replaceChildren(make('p','pk-invite-note',error.message));}
}

async function rematchAction(decision){
  if(!room||rematchBusy)return;rematchBusy=true;const code=room.code;
  for(const button of content.querySelectorAll('.pk-result-actions button'))button.disabled=true;
  try{const data=await api('/'+code+'/rematch',{method:'POST',body:{decision}});applyRoom(data.room);alertText('');}
  catch(error){alertText(error.message);await poll();}
  finally{rematchBusy=false;tick();}
}

function renderResult(){
  const result=content.querySelector('#pk-result');if(!result||!room)return;
  const own=me?.id===room.host.id?room.host:room.guest,other=own===room.host?room.guest:room.host;
  const outcome=room.host.score===room.guest.score?'draw':room.winnerId===me?.id?'win':'lose';
  const resultKey=`${room.round}:${room.host.score}:${room.guest.score}`;
  if(resultAnnouncedRound!==resultKey){
    const firstResult=!resultAnnouncedRound||!String(resultAnnouncedRound).startsWith(`${room.round}:`);
    resultAnnouncedRound=resultKey;result.classList.remove('is-win','is-lose','is-draw');result.classList.add('is-'+outcome);
    result.querySelector('.pk-result-icon').innerHTML=iconSvg(outcome==='win'?'trophy':outcome==='lose'?'retry':'match');
    result.querySelector('.pk-result-title').textContent=outcome==='win'?'胜利！这局你赢了':outcome==='lose'?'惜败！下一局扳回来':'平局！再比一场';
    result.querySelector('.pk-result-copy').textContent=`第 ${room.round} 局 · 你 ${own.score} 分，对方 ${other.score} 分`;
    if(firstResult){window.dispatchEvent(new CustomEvent('sweetfrog:pk-result',{detail:{outcome}}));requestAnimationFrame(()=>result.scrollIntoView({block:'center',behavior:'instant'}));}
  }
  result.hidden=false;
  const note=result.querySelector('.pk-rematch-note'),request=result.querySelector('.pk-rematch'),accept=result.querySelector('.pk-rematch-accept'),cancel=result.querySelector('.pk-quiet-button');
  const ready=now()>=room.endsAt+1200&&!pendingHits&&!pendingScores&&!scoreTimer&&latestScore===null&&finalSyncedRound===room.round;
  request.hidden=!ready||Boolean(room.rematchBy);accept.hidden=!ready||!room.rematchBy||room.rematchBy===me?.id;cancel.hidden=!ready||room.rematchBy!==me?.id;
  note.textContent=!ready?'正在核对最后的成绩…':room.rematchBy===me?.id?'已发出邀约，等对方同意就开下一局。':room.rematchBy?'对方想再来一局，同意后将自动倒计时。':'还想比一场？发起邀约，等朋友点头。';
  for(const button of [request,accept,cancel])button.disabled=rematchBusy;
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
async function flushScore(){
  clearTimeout(scoreTimer);scoreTimer=0;
  if(!room||room.game==='tap'||latestScore===null||!viewCode||scoreSending)return;
  const code=viewCode,value=latestScore,seq=++scoreSeq,round=room.round;
  latestScore=null;scoreSending=true;pendingScores=1;
  try{const data=await api('/'+code+'/score',{method:'POST',body:{score:value,seq,round}});applyRoom(data.room);}
  catch(error){if(room?.round===round&&viewCode===code)alertText(error.message);}
  finally{
    if(room?.round!==round||viewCode!==code)return;
    scoreSending=false;pendingScores=0;
    if(latestScore!==null)flushScore();
    else if(phaseFor(room)==='finished')poll();
  }
}
function scheduleHits(){if(!hitTimer&&!hitSending&&hitBuffer.length)hitTimer=setTimeout(flushHits,65);}
async function flushHits(){
  clearTimeout(hitTimer);hitTimer=0;
  if(hitSending||!room||!hitBuffer.length)return;
  const code=room.code,round=room.round,cols=hitBuffer.splice(0,32),own=me?.id===room.host.id?room.host:room.guest,step=own.score;
  hitSending=true;
  try{
    const data=await api('/'+code+'/hit',{method:'POST',body:{cols,step,round}});
    if(!data.correct)throw Error('点击记录未通过校验，已同步服务器分数');
    if(room?.round!==round)return;
    pendingHits=Math.max(0,pendingHits-cols.length);applyRoom(data.room);alertText('');
  }catch(error){
    if(room?.round===round){
      hitBuffer=[];pendingHits=0;await poll();
      if(room?.round===round){localScore=(me?.id===room.host.id?room.host:room.guest).score;renderBoard();alertText(error.message);}
    }
  }finally{
    if(room?.round===round){hitSending=false;if(hitBuffer.length)scheduleHits();else if(!pendingHits)await poll();}
  }
}
window.addEventListener('sweetfrog:pk-score',event=>{if(!room||room.game!==event.detail.game||!pkLaunched)return;latestScore=event.detail.score;if(!scoreTimer)scoreTimer=setTimeout(flushScore,250);});
window.addEventListener('sweetfrog:pk-finished',event=>{if(!room||room.game!==event.detail.game)return;latestScore=event.detail.score;flushScore();});
function tick() {
  if(!room||viewCode!==room.code)return;
  const phase=phaseFor(room),status=content.querySelector('#pk-status'),game=content.querySelector('#pk-game');
  const own=me?.id===room.host.id?room.host:room.guest;
  const ready=content.querySelector('#pk-ready');
  ready.hidden=phase!=='ready'||!own||own.ready;
  if(phase==='waiting')status.textContent='等待朋友加入…复制链接发给对方吧。';
  else if(phase==='ready')status.textContent=own?.ready?'已准备，等待朋友点击准备。':'朋友已加入，点“准备好了”即可开局。';
  else if(phase==='countdown')status.textContent=`准备开局 · ${Math.max(1,Math.ceil((room.startsAt-now())/1000))}`;
  else if(phase==='playing')status.textContent=`${games[room.game]} PK 进行中 · 稳住节奏！`;
  else if(pendingHits||pendingScores||scoreTimer||latestScore!==null||now()<room.endsAt+1200||finalSyncedRound!==room.round)status.textContent='时间到，正在核对最后的成绩…';
  else status.textContent=room.host.score===room.guest.score?'平局！':room.winnerId===me?.id?'你赢了！':'这局朋友赢了！';
  game.hidden=phase!=='playing'||room.game!=='tap';
  const timer=content.querySelector('.pk-timer');if(timer)timer.textContent=`${Math.max(0,(room.endsAt-now())/1000).toFixed(1)} 秒`;
  if(phase==='playing'&&room.game==='tap'&&localScore===null){localScore=own?.score||0;renderBoard();}
  if(phase==='playing'&&room.game==='tap'&&focusedRound!==room.round){focusedRound=room.round;requestAnimationFrame(()=>game.scrollIntoView({block:'center',behavior:'instant'}));}
  if(phase==='finished'&&room.game==='tap'){
    if(hitBuffer.length&&!hitSending&&!hitTimer)flushHits();
    else if(!pendingHits&&now()>=room.endsAt+1200&&finalSyncedRound!==room.round&&!polling)poll();
  }
  if(phase==='playing'&&room.game!=='tap'&&!pkLaunched){
    pkLaunched=true;page.hidden=true;const round=room.round;
    launchPkGame(room.game,room.seed,room.endsAt+clockOffset).then(()=>{
      if(room?.round===round&&phaseFor(room)==='playing')requestAnimationFrame(()=>document.querySelector('#stage-wrap').scrollIntoView({block:'center',behavior:'instant'}));
    });
  }
  if(phase==='finished'&&room.game!=='tap'&&pkLaunched&&!pkResultShown){pkResultShown=true;stopPkGame();page.hidden=false;document.querySelector('#lobby').hidden=true;}
  if(phase==='finished'&&room.game!=='tap'&&latestScore!==null&&!scoreSending&&!scoreTimer)flushScore();
  if(phase==='finished'&&finalSyncedRound!==room.round&&now()>=room.endsAt+1200&&!pendingHits&&!pendingScores&&latestScore===null&&!scoreTimer&&!polling)poll();
  if(phase==='finished'&&!pendingHits&&!pendingScores&&latestScore===null&&!scoreTimer&&now()>=room.endsAt+1200&&finalSyncedRound===room.round)renderResult();
}
function applyRoom(next) {
  if(viewCode!==next.code)return;
  if(room&&room.code===next.code&&(next.round<room.round||next.revision<room.revision||next.round===room.round&&next.revision===room.revision&&(next.game==='tap'&&(next.host.score<room.host.score||next.guest?.score<(room.guest?.score||0))||next.game!=='tap'&&(next.host.seq<room.host.seq||next.guest?.seq<(room.guest?.seq||0)))))return;
  if(room&&next.round>room.round){
    stopPkGame();page.hidden=false;document.querySelector('#game-screen').hidden=true;
    content.querySelector('#pk-result').hidden=true;
    localScore=null;pendingHits=0;hitBuffer=[];hitSending=false;clearTimeout(hitTimer);hitTimer=0;finalSyncedRound=0;pkLaunched=false;pkResultShown=false;scoreSeq=0;latestScore=null;clearTimeout(scoreTimer);scoreTimer=0;scoreSending=false;pendingScores=0;focusedRound=0;resultAnnouncedRound=0;
    content.querySelector('#pk-board').replaceChildren();
    requestAnimationFrame(()=>content.querySelector('.pk-room-card').scrollIntoView({block:'center',behavior:'instant'}));
  }
  room=next;
  const invitePanel=content.querySelector('#pk-invite-panel');if(invitePanel){invitePanel.hidden=room.host.id!==me?.id||Boolean(room.guest)||Boolean(room.startsAt);if(!invitePanel.hidden)loadInviteFriends();}
  content.querySelector('#pk-game-title').textContent=games[room.game]+' · PK';
  content.querySelector('#pk-game-description').textContent=room.game==='tap'?'双方同题，30 秒比手速。只点最底下一排的头像。':'两人同时玩「'+games[room.game]+'」，30 秒内分数更高的一方获胜。';
  content.querySelector('.pk-room-game').textContent=games[room.game];
  const cards=content.querySelectorAll('.pk-player');
  for(const [index,player] of [room.host,room.guest].entries()){
    const card=cards[index];card.querySelector('.pk-player-name').textContent=player?.name||'等待加入';
    card.querySelector('.pk-player-score').textContent=String(player?.score||0);
    card.querySelector('.pk-avatar').src=player?`/api/avatars/${player.id}`:'./assets/default-frog-avatar.svg';
    card.classList.toggle('is-self',player?.id===me?.id);
    card.classList.toggle('is-ready',Boolean(player?.ready));
  }
  const own=me?.id===room.host.id?room.host:room.guest;
  scoreSeq=Math.max(scoreSeq,own?.seq||0);
  if(localScore!==null&&pendingHits===0&&localScore!==own.score){localScore=own.score;renderBoard();}
  if(localScore!==null&&cards.length)cards[me?.id===room.host.id?0:1].querySelector('.pk-player-score').textContent=String(localScore);
  if(room.game!=='tap'&&pkLaunched){const opponent=me?.id===room.host.id?room.guest:room.host;document.querySelector('#best').textContent=String(opponent?.score||0);}
  tick();
}
async function poll() {
  if(polling||!viewCode||!location.hash.toLowerCase().startsWith('#pk/'))return;polling=true;
  try{const data=await api('/'+viewCode);applyRoom(data.room);if(room&&data.room.round===room.round&&data.room.endsAt&&data.room.serverNow>=data.room.endsAt+1200&&!pendingHits&&!pendingScores&&latestScore===null){finalSyncedRound=room.round;tick();}alertText('');}
  catch(error){alertText(error.message);}
  finally{polling=false;}
}
function hit(col) {
  if(!room||phaseFor(room)!=='playing'||localScore===null||performance.now()-lastTapAttempt<85)return;
  lastTapAttempt=performance.now();
  const rows=pkRows(room.seed,localScore);
  if(rows[4]!==col){const board=content.querySelector('#pk-board');board.classList.remove('miss');void board.offsetWidth;board.classList.add('miss');window.dispatchEvent(new CustomEvent('sweetfrog:pk-hit',{detail:{correct:false}}));return;}
  localScore++;pendingHits++;hitBuffer.push(col);renderBoard();
  content.querySelectorAll('.pk-player')[me.id===room.host.id?0:1].querySelector('.pk-player-score').textContent=String(localScore);
  window.dispatchEvent(new CustomEvent('sweetfrog:pk-hit',{detail:{correct:true}}));
  if(hitBuffer.length>=24)flushHits();else scheduleHits();
}
async function route() {
  const match=/^pk(?:\/([A-HJ-NP-Z2-9]{6}))?$/.exec(location.hash.slice(1).toUpperCase().replace(/^PK/,'pk'));
  const id=++routeId;heldPkKeys.clear();lastTapAttempt=0;stopTimers();stopPkGame();room=null;viewCode='';page.hidden=!match;nav.classList.toggle('active',Boolean(match));
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
window.addEventListener('keyup',event=>heldPkKeys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>heldPkKeys.clear());
window.addEventListener('keydown',event=>{if(page.hidden||!room||event.repeat||/INPUT|TEXTAREA/.test(document.activeElement?.tagName))return;const key=event.key.toLowerCase(),col=['d','f','j','k'].indexOf(key);if(col>=0){event.preventDefault();const first=heldPkKeys.size===0;heldPkKeys.add(key);if(first)hit(col);}});
route();

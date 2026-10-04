import { iconSvg } from './icons.js';
import { beijingTime } from './beijing-time.js';

const page=document.createElement('main');page.id='friends-page';page.hidden=true;
page.innerHTML='<nav class="club-breadcrumb" aria-label="当前位置"><a href="#games">← 游戏大厅</a><span>好友私信</span></nav><div id="friends-content"></div>';
document.querySelector('#game-screen').before(page);
const content=page.querySelector('#friends-content');
const nav=document.createElement('a');nav.href='#friends';nav.className='club-nav-link';nav.id='friends-nav-link';nav.textContent='好友';
document.querySelector('#sound-toggle').before(nav);
const badge=document.createElement('span');badge.className='nav-badge';badge.id='friends-badge';badge.hidden=true;nav.append(badge);
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const token=()=>{try{return localStorage.getItem('sweetfrog-session')||'';}catch{return '';}};
let currentRoute=0,chatTimer=0,lastMessageId=0,shownMessages=new Set(),summaryTimer=0,summaryBusy=false;
async function api(path,options={}){
  const response=await fetch('/api/'+path,{method:options.method||'GET',headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'连接失败，请稍后再试');return data;
}
function avatar(id){const img=make('img','friend-avatar');img.alt='';img.src=`/api/avatars/${id}`;img.loading='lazy';img.onerror=()=>{img.onerror=null;img.src='./assets/default-frog-avatar.svg';};return img;}
function setBadge(count){badge.hidden=!count;badge.textContent=count>99?'99+':String(count);nav.setAttribute('aria-label',count?`好友，有 ${count} 条待处理消息或邀请`:'好友');}
async function refreshSummary(){
  if(summaryBusy)return;if(!token()){setBadge(0);return;}summaryBusy=true;
  try{const [friends,invites]=await Promise.all([api('friends'),api('pk/invites')]);setBadge(friends.unread+friends.incoming.length+invites.incoming.length);}
  catch{setBadge(0);}finally{summaryBusy=false;}
}
function heading(title,copy){const wrap=make('div','club-heading');wrap.innerHTML='<span class="eyebrow">FROG FRIENDS</span><h1></h1><p></p>';wrap.querySelector('h1').textContent=title;wrap.querySelector('p').textContent=copy;return wrap;}
function notice(text){return make('p','friends-notice',text);}
function action(label,fn,className='friend-action'){const button=make('button',className,label);button.type='button';button.addEventListener('click',()=>fn(button));return button;}
async function mutate(button,path,body,after){
  button.disabled=true;try{const data=await api(path,{method:'POST',body});await after?.(data);await refreshSummary();}
  catch(error){const status=content.querySelector('#friends-status');if(status)status.textContent=error.message;button.disabled=false;}
}
function renderPeople(target,people,mode){
  target.replaceChildren();
  if(!people.length){target.append(notice(mode==='friend'?'还没有好友。搜索昵称或 ID，发出第一份申请吧。':'暂时没有待处理的申请。'));return;}
  for(const person of people){
    const card=make('div','friend-row');card.append(avatar(person.id));
    const copy=make('div','friend-row-copy');copy.append(make('strong','',person.username),make('small','',`ID ${person.publicId}${mode==='friend'?(person.online?' · 在线':' · 暂未在线'):''}`));card.append(copy);
    if(mode==='friend'){const link=make('a','friend-action','发私信');link.href=`#friends/${person.publicId}`;card.append(link);if(person.unread)card.append(make('span','friend-unread',String(person.unread)));}
    else if(mode==='incoming'){card.append(action('接受',button=>mutate(button,`friends/requests/${person.id}`,{decision:'accept'},renderRoute)));card.append(action('拒绝',button=>mutate(button,`friends/requests/${person.id}`,{decision:'decline'},renderRoute),'friend-quiet'));}
    else card.append(action('撤回',button=>mutate(button,`friends/requests/${person.id}`,{decision:'cancel'},renderRoute),'friend-quiet'));
    target.append(card);
  }
}
function renderInvites(target,invites){
  target.replaceChildren();if(!invites.length){target.parentElement.hidden=true;return;}target.parentElement.hidden=false;
  for(const invite of invites){
    const card=make('div','friend-row');card.append(avatar(invite.fromUser));
    const copy=make('div','friend-row-copy');copy.append(make('strong','',invite.username),make('small','',`邀请你玩 ${({tap:'逮住大青蛙',merge:'合成大青蛙',flap:'青蛙起飞',puzzle:'青蛙2048',aim:'青蛙定位练习'})[invite.game]||'好友 PK'} · 房间 ${invite.roomCode}`));card.append(copy);
    card.append(action('接受并进入',button=>mutate(button,`pk/invites/${invite.id}`,{decision:'accept'},data=>{location.hash='pk/'+data.roomCode;})));
    card.append(action('婉拒',button=>mutate(button,`pk/invites/${invite.id}`,{decision:'decline'},renderRoute),'friend-quiet'));
    target.append(card);
  }
}
async function search(form){
  const results=content.querySelector('#friend-search-results'),status=content.querySelector('#friends-status'),q=form.elements.query.value.trim();
  if(!q){status.textContent='请输入昵称或玩家 ID。';return;}status.textContent='正在查找…';
  try{
    const data=await api('friends/search?q='+encodeURIComponent(q));results.replaceChildren();
    if(!data.players.length)results.append(notice('没有找到这个玩家，试试完整昵称或 ID。'));
    for(const person of data.players){
      const card=make('div','friend-row');card.append(avatar(person.id));
      const copy=make('div','friend-row-copy');copy.append(make('strong','',person.username),make('small','',`ID ${person.publicId}`));card.append(copy);
      if(person.status==='accepted'){const link=make('a','friend-action','发私信');link.href=`#friends/${person.publicId}`;card.append(link);}
      else if(person.status==='pending')card.append(make('span','friend-pending',person.requesterId===data.self?.id?'已发送申请':'对方已申请你'));
      else card.append(action('加好友',button=>mutate(button,'friends/requests',{userId:person.id},()=>{status.textContent='申请已发出，等待对方同意。';button.textContent='已发送';button.disabled=true;})));
      results.append(card);
    }
    status.textContent='';
  }catch(error){status.textContent=error.message;}
}
async function renderDashboard(id){
  content.replaceChildren(heading('好友与私信','搜索昵称或 ID，和朋友保持联系。'));
  content.append(action('刷新好友与邀请',()=>renderRoute(),'friend-quiet friends-refresh'));
  const searchPanel=make('section','friends-panel');searchPanel.append(make('h2','','寻找好友'));
  const form=make('form','friend-search');form.innerHTML='<label for="friend-query">玩家昵称或 ID</label><div><input id="friend-query" name="query" maxlength="20" autocomplete="off" placeholder="例如：大青蛙 或 123"><button type="submit">搜索玩家</button></div>';
  form.querySelector('input').placeholder='例如：大青蛙 或 58321';form.addEventListener('submit',event=>{event.preventDefault();search(form);});searchPanel.append(form);
  const results=make('div','friend-search-results');results.id='friend-search-results';searchPanel.append(results);content.append(searchPanel);
  const invitePanel=make('section','friends-panel');invitePanel.append(make('h2','','对战邀请'));const inviteList=make('div','friend-list');invitePanel.append(inviteList);content.append(invitePanel);
  const pendingPanel=make('section','friends-panel');pendingPanel.append(make('h2','','收到的申请'));const incoming=make('div','friend-list');pendingPanel.append(incoming);content.append(pendingPanel);
  const outgoingPanel=make('section','friends-panel');outgoingPanel.append(make('h2','','发出的申请'));const outgoing=make('div','friend-list');outgoingPanel.append(outgoing);content.append(outgoingPanel);
  const friendsPanel=make('section','friends-panel');friendsPanel.append(make('h2','','我的好友'));const friendsList=make('div','friend-list');friendsPanel.append(friendsList);content.append(friendsPanel);
  const status=make('p','friends-status','');status.id='friends-status';status.setAttribute('role','status');content.append(status);
  try{
    const [friends,invites]=await Promise.all([api('friends'),api('pk/invites')]);if(id!==currentRoute)return;
    renderInvites(inviteList,invites.incoming);renderPeople(incoming,friends.incoming,'incoming');renderPeople(outgoing,friends.outgoing,'outgoing');renderPeople(friendsList,friends.friends,'friend');
    pendingPanel.hidden=!friends.incoming.length;outgoingPanel.hidden=!friends.outgoing.length;setBadge(friends.unread+friends.incoming.length+invites.incoming.length);
  }catch(error){if(id===currentRoute)status.textContent=error.message;}
}
function messageNode(message,selfId){
  const own=message.senderId===selfId,bubble=make('div','friend-message'+(own?' is-own':''));bubble.dataset.messageId=String(message.id);
  bubble.append(make('p','',message.body),make('time','',beijingTime(message.createdAt,'clock')));return bubble;
}
function appendMessages(messages,selfId){
  const list=content.querySelector('#friend-messages');if(!list)return;const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<100;
  for(const message of messages){if(shownMessages.has(message.id))continue;shownMessages.add(message.id);lastMessageId=Math.max(lastMessageId,message.id);list.append(messageNode(message,selfId));}
  if(nearBottom||messages.length&&shownMessages.size===messages.length)list.scrollTop=list.scrollHeight;
}
async function pollChat(peerId,selfId,id){
  if(id!==currentRoute||page.hidden||!content.querySelector('#friend-messages'))return;
  try{const data=await api(`friends/${peerId}/messages?after=${lastMessageId}`);if(id!==currentRoute)return;appendMessages(data.messages,selfId);if(data.messages.length)refreshSummary();}catch{}
}
async function renderChat(peerId,id){
  content.replaceChildren(notice('正在打开对话…'));let friends;
  try{friends=await api('friends');}catch(error){if(id===currentRoute)content.replaceChildren(notice(error.message));return;}
  if(id!==currentRoute)return;
  const peer=friends.friends.find(item=>item.publicId===peerId||item.id===peerId);
  if(!peer){content.replaceChildren(notice('这位玩家还不是你的好友。'));return;}
  peerId=peer.id;
  content.replaceChildren();
  const back=make('a','forum-back','← 返回好友列表');back.href='#friends';content.append(back);
  const panel=make('section','friend-chat');const head=make('div','friend-chat-head');head.append(avatar(peer.id));
  const label=make('div','');label.append(make('h1','',peer.username),make('span','',`ID ${peer.publicId} · ${peer.online?'在线':'暂未在线'}`));head.append(label);panel.append(head);
  const messages=make('div','friend-messages');messages.id='friend-messages';messages.setAttribute('aria-label',`与${peer.username}的私信`);panel.append(messages);
  const form=make('form','friend-compose');form.innerHTML='<label for="friend-message-body">发送私信</label><div><textarea id="friend-message-body" name="body" maxlength="1000" rows="2" placeholder="写点什么…"></textarea><button type="submit">发送</button></div><p role="status"></p>';
  form.addEventListener('submit',async event=>{event.preventDefault();const body=form.elements.body.value.trim(),button=form.querySelector('button'),status=form.querySelector('[role=status]');if(!body)return;button.disabled=true;try{const data=await api(`friends/${peerId}/messages`,{method:'POST',body:{body}});appendMessages([data.message],friends.self.id);form.reset();status.textContent='';form.elements.body.focus();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
  panel.append(form);content.append(panel);shownMessages=new Set();lastMessageId=0;
  try{const data=await api(`friends/${peerId}/messages`);if(id!==currentRoute)return;appendMessages(data.messages,friends.self.id);messages.scrollTop=messages.scrollHeight;refreshSummary();}
  catch(error){if(id===currentRoute)messages.append(notice(error.message));return;}
  chatTimer=setInterval(()=>pollChat(peerId,friends.self.id,id),3000);
}
function renderRoute(){
  clearInterval(chatTimer);chatTimer=0;const route=/^friends(?:\/(\d+))?$/.exec(location.hash.slice(1)),id=++currentRoute;page.hidden=!route;nav.classList.toggle('active',Boolean(route));
  if(!route)return;
  document.querySelector('#lobby').hidden=true;document.querySelector('#game-screen').hidden=true;document.querySelector('#club-page').hidden=true;
  content.replaceChildren();
  if(!token()){content.append(heading('好友与私信','登录后可以添加好友、聊天和发送对战邀请。'));const link=make('a','friend-action','登录 / 注册 →');link.href='#account';content.append(link);setBadge(0);return;}
  if(route[1])renderChat(Number(route[1]),id);else renderDashboard(id);
  refreshSummary();
}
window.addEventListener('hashchange',renderRoute);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSummary();});
summaryTimer=setInterval(refreshSummary,8000);
renderRoute();

import { communityRequest } from './community-transport.js';
import { iconSvg } from './icons.js';
import { beijingTime } from './beijing-time.js';

const games = { tap:'逮住大青蛙', merge:'合成大青蛙', flap:'青蛙起飞', puzzle:'青蛙2048', aim:'青蛙定位练习' };
const routes = new Set(['suggestions','discussion','leaderboard','notifications','account','profile']);
const titleNames={apprentice:'青蛙学徒',first_win:'小试牛刀',three_wins:'连胜高手',sharp_eye:'百步穿杨'};
const $ = selector => document.querySelector(selector);
const el = (tag,className,text) => { const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node; };
const makeButton = (label,onClick,className='') => { const node=el('button',className,label);node.type='button';node.addEventListener('click',onClick);return node; };
const page = el('main','club-page'); page.id='club-page';page.hidden=true;
page.innerHTML=`<nav class="club-breadcrumb" aria-label="当前位置"><a href="#games">← 游戏大厅</a><span id="club-location"></span></nav><div id="club-content"></div>`;
$('#game-screen').before(page);
const nav=$('.site-header nav');
for(const [route,label] of [['suggestions','意见留言'],['discussion','玩家社区'],['leaderboard','排行榜']]){const link=el('a','club-nav-link',label);link.href='#'+route;link.dataset.clubNav=route;nav.insertBefore(link,$('#sound-toggle'));}
const notificationLink=el('a','club-nav-link','通知');notificationLink.href='#notifications';notificationLink.dataset.clubNav='notifications';const notificationBadge=el('span','nav-badge');notificationBadge.hidden=true;notificationLink.append(notificationBadge);nav.insertBefore(notificationLink,$('#sound-toggle'));
const rankLink=el('a','game-rank-link','查看本游戏排行榜 ↗');rankLink.href='#leaderboard';$('#game-screen .play-footer').before(rankLink);
let token='';try{token=localStorage.getItem('sweetfrog-session')||'';}catch{}
let user=null,rankGame='match',accountMode='login',returnTo='games',accountMessage='',avatarVersion=0;
window.addEventListener('sweetfrog:login-return',event=>{if(typeof event.detail==='string'&&/^pk(?:\/[A-HJ-NP-Z2-9]{6})?$/.test(event.detail))returnTo=event.detail;});
const friendlyError=error=>error.message||'暂时连接不上服务器，请稍后重试。';
async function request(path,options={}){
  return communityRequest(path,options,token);
}
async function refreshSession(){if(!token){user=null;return;}try{user=(await request('/api/session')).user;if(!user)clearSession();}catch{user=null;}}
function clearSession(){token='';user=null;try{localStorage.removeItem('sweetfrog-session');}catch{}}
function avatarUrl(id){return id?`/api/avatars/${id}${user?.id===id?`?v=${avatarVersion}`:''}`:'./assets/default-frog-avatar.svg';}
function memberAvatar(id,name,className='club-avatar'){const img=el('img',className);img.src=avatarUrl(id);img.alt=name?`${name}的头像`:'卡通青蛙头像';img.loading='lazy';img.onerror=()=>{img.onerror=null;img.src='./assets/default-frog-avatar.svg';};return img;}
function syncAdminLink(){let link=$('#admin-nav-link');if(user?.role==='admin'&&!link){link=el('a','club-nav-link','管理后台');link.id='admin-nav-link';link.href='./admin.html';$('#sound-toggle').before(link);}else if(user?.role!=='admin')link?.remove();const chip=$('#account-chip');chip.href=user?'#profile':'#account';if(user)chip.replaceChildren(memberAvatar(user.id,'','account-chip-avatar'),el('span','account-chip-name',user.username),el('small','account-chip-title',titleNames[user.titleKey]||titleNames.apprentice));else{const symbol=el('span','account-chip-symbol');symbol.innerHTML=iconSvg('user');chip.replaceChildren(symbol,el('span','account-chip-name','登录'));}chip.classList.toggle('signed-in',Boolean(user));chip.setAttribute('aria-label',user?`个人信息：${user.username}，称号${titleNames[user.titleKey]||titleNames.apprentice}`:'登录或注册');const popover=$('#account-popover');if(popover)popover.hidden=!user;const admin=$('.account-admin-link');if(admin)admin.hidden=user?.role!=='admin';if(!user)setNotificationBadge(0);}
function setNotificationBadge(count){notificationBadge.hidden=!count;notificationBadge.textContent=count>99?'99+':String(count);notificationLink.setAttribute('aria-label',count?`通知，${count} 条未读`:'通知');}
async function refreshNotifications(){if(!user){setNotificationBadge(0);return;}try{const data=await request('/api/notifications');setNotificationBadge(data.unread);}catch{}}
setInterval(()=>{if(!document.hidden)refreshNotifications();},15000);
async function logoutAccount(){try{await request('/api/logout',{method:'POST'});}catch{}clearSession();syncAdminLink();location.hash='account';renderCurrent();}
window.addEventListener('sweetfrog:logout',logoutAccount);
function saveSession(data){token=data.token;user=data.user;try{localStorage.setItem('sweetfrog-session',token);}catch{}syncAdminLink();refreshNotifications();}
function heading(eyebrow,title,description){const wrap=el('div','club-heading');wrap.innerHTML=`<span class="eyebrow"></span><h1></h1><p></p>`;wrap.querySelector('.eyebrow').textContent=eyebrow;wrap.querySelector('h1').textContent=title;wrap.querySelector('p').textContent=description;return wrap;}
function notice(message){return el('p','club-notice',message);}
function time(value){return beijingTime(value);}
function gate(message){const wrap=el('div','club-gate');wrap.append(el('p','',message));const link=el('a','club-action','登录 / 注册 ↗');link.href='#account';link.addEventListener('click',()=>{returnTo=location.hash.slice(1)||'games';});wrap.append(link);return wrap;}
function form(label,max,submit,after){const node=el('form','club-form');node.innerHTML=`<label>标题<input name="title" required></label><label>内容<textarea name="body" required rows="4"></textarea></label><button type="submit"></button><p class="club-form-status" role="status"></p>`;node.querySelector('[name=title]').maxLength=80;node.querySelector('[name=body]').maxLength=max;node.querySelector('button').textContent=label;node.addEventListener('submit',async event=>{event.preventDefault();const button=node.querySelector('button'),status=node.querySelector('[role=status]');button.disabled=true;status.textContent='正在发布…';try{const result=await submit({title:node.elements.title.value.trim(),body:node.elements.body.value.trim()});node.reset();status.textContent='发布成功！';if(after)after(result);else await renderCurrent();}catch(error){status.textContent=friendlyError(error);}finally{button.disabled=false;}});return node;}
function cardHead(item){const head=el('div','club-card-head');head.append(memberAvatar(item.userId,item.username),el('strong','',item.username),el('time','',time(item.createdAt)));return head;}
function postMeta(item){const meta=el('div','forum-meta');meta.append(memberAvatar(item.userId,item.username),el('strong','',item.username),el('time','',time(item.createdAt)));return meta;}
function sectionTop(content,type){
  const isIdea=type==='suggestions';
  content.append(heading(isIdea?'IDEA BOARD':'FROG FORUM',isIdea?'意见留言':'玩家社区',isIdea?'喜欢的建议，点个赞让它排到前面。':'聊游戏、晒成绩，或者发起一场新讨论。'));
}
function compose(content,type){
  const isIdea=type==='suggestions';
  const action=isIdea?'发布建议':'发布帖子';
  const back=el('a','forum-back',isIdea?'← 返回建议列表':'← 返回帖子列表');back.href='#'+type;content.append(back);
  const panel=el('section','forum-compose');
  const top=el('div','forum-compose-head');const symbol=el('div','forum-compose-symbol');symbol.innerHTML=iconSvg(isIdea?'sparkle':'topic');top.append(symbol,el('div','forum-compose-copy'));
  top.lastChild.append(el('strong','',isIdea?'写下你的建议':'发起一个话题'),el('p','',isIdea?'说说你希望怎样改进。':'分享一个想法，邀请大家一起聊。'));
  panel.append(top);
  if(user){const editor=form(action+' ↗',isIdea?500:2000,data=>request(isIdea?'/api/suggestions':'/api/topics',{method:'POST',body:JSON.stringify(data)}),result=>{location.hash=(isIdea?'suggestions/':'discussion/')+result.id;});editor.querySelector('[name=title]').placeholder=isIdea?'用一句话概括建议':'给帖子起个标题';editor.querySelector('[name=body]').placeholder=isIdea?'具体希望怎样改进？':'写下你的想法…';panel.append(editor);}
  else panel.append(gate(isIdea?'登录后可以发布建议和点赞。':'登录后可以发帖和回复。'));
  content.append(panel);
}
function composePage(content,type){
  const isIdea=type==='suggestions';
  content.append(heading(isIdea?'SHARE AN IDEA':'START A DISCUSSION',isIdea?'提出建议':'发起话题',isIdea?'让好点子被看见，也让大家一起点赞。':'想聊游戏、晒成绩，还是问问大家？'));
  compose(content,type);
}
function listAction(type){
  const isIdea=type==='suggestions';
  const action=el('a','forum-create-action',isIdea?'有好点子？写下建议 ↗':'有话想聊？发起话题 ↗');
  action.href='#'+type+'/new';
  return action;
}
function voteButton(item){
  const vote=makeButton(`▲ ${item.votes}`,async()=>{
    if(!user){returnTo=location.hash.slice(1);location.hash='account';return;}
    vote.disabled=true;
    try{const data=await request(`/api/suggestions/${item.id}/vote`,{method:'POST'});if(data.added){item.votes++;item.voted=1;vote.textContent=`▲ ${item.votes}`;vote.title='你已经点过赞';}else vote.title='你已经点过赞';}
    catch(error){vote.disabled=false;vote.title=friendlyError(error);return;}
  },'vote-button');
  vote.disabled=Boolean(item.voted);vote.setAttribute('aria-label',`为“${item.title}”点赞，当前 ${item.votes} 赞`);
  if(item.voted)vote.title='你已经点过赞';return vote;
}
async function suggestions(content){
  sectionTop(content,'suggestions');
  const bar=el('div','forum-list-bar');const label=el('div','forum-list-label');label.append(el('h2','','建议列表'),el('span','','按点赞排序'));bar.append(label,listAction('suggestions'));content.append(bar);
  const list=el('div','club-list idea-list');content.append(list);list.append(notice('正在读取建议…'));
  try{const {items}=await request('/api/suggestions');list.replaceChildren();if(!items.length)list.append(notice('还没有建议，来发布第一篇吧。'));
    for(const item of items){const card=el('article','club-card idea-card');const body=el('div','club-card-content');const link=el('a','forum-title',item.title);link.href='#suggestions/'+item.id;body.append(postMeta(item),link,el('p','forum-excerpt',item.body));const footer=el('div','forum-row-footer');footer.append(el('span','','建议 · '+time(item.createdAt)),el('a','forum-open','查看建议 →'));footer.lastChild.href=link.href;body.append(footer);card.append(voteButton(item),body);list.append(card);}
  }catch(error){list.replaceChildren(notice(friendlyError(error)));}
}
async function discussion(content){
  sectionTop(content,'discussion');
  const bar=el('div','forum-list-bar');const label=el('div','forum-list-label');label.append(el('h2','','全部帖子'),el('span','','最新发布'));bar.append(label,listAction('discussion'));content.append(bar);
  const list=el('div','club-list forum-list');content.append(list);list.append(notice('正在读取帖子…'));
  try{const {items}=await request('/api/topics');list.replaceChildren();if(!items.length)list.append(notice('还没有帖子，来发第一篇吧。'));
    for(const item of items){const card=el('article','club-card topic-card');const body=el('div','club-card-content');const link=el('a','forum-title',item.title);link.href='#discussion/'+item.id;body.append(postMeta(item),link,el('p','forum-excerpt',item.body));const footer=el('div','forum-row-footer');footer.append(el('span','forum-reply-count',`${item.replyCount} 条回复`),el('a','forum-open','进入讨论 →'));footer.lastChild.href=link.href;body.append(footer);card.append(body);list.append(card);}
  }catch(error){list.replaceChildren(notice(friendlyError(error)));}
}
async function suggestionDetail(content,id){
  sectionTop(content,'suggestions');const back=el('a','forum-back','← 返回建议列表');back.href='#suggestions';content.append(back);
  const container=el('div','forum-detail-wrap');content.append(container);container.append(notice('正在读取建议…'));
  try{const {item}=await request('/api/suggestions/'+id);container.replaceChildren();const card=el('article','club-card forum-detail');const body=el('div','club-card-content');body.append(postMeta(item),el('h2','forum-detail-title',item.title),el('p','forum-detail-body',item.body));card.append(voteButton(item),body);container.append(card);}
  catch(error){container.replaceChildren(notice(friendlyError(error)));}
}
function replyRow(reply){const row=el('article','club-reply');row.append(postMeta(reply),el('p','',reply.body));return row;}
async function topicDetail(content,id){
  sectionTop(content,'discussion');const back=el('a','forum-back','← 返回帖子列表');back.href='#discussion';content.append(back);
  const container=el('div','forum-detail-wrap');content.append(container);container.append(notice('正在读取帖子…'));
  try{const {item}=await request('/api/topics/'+id);container.replaceChildren();const card=el('article','club-card forum-detail');const body=el('div','club-card-content');body.append(postMeta(item),el('h2','forum-detail-title',item.title),el('p','forum-detail-body',item.body));card.append(body);container.append(card);
    const section=el('section','forum-replies-section');const header=el('div','forum-list-bar');const title=el('h2','',`回复 · ${item.replyCount}`);header.append(title);section.append(header);const replies=el('div','club-replies');section.append(replies);container.append(section);
    async function reloadReplies(){replies.replaceChildren(notice('正在读取回复…'));try{const data=await request(`/api/topics/${id}/replies`);replies.replaceChildren();title.textContent=`回复 · ${data.items.length}`;if(!data.items.length)replies.append(notice('还没有回复，来说第一句吧。'));for(const reply of data.items)replies.append(replyRow(reply));}catch(error){replies.replaceChildren(notice(friendlyError(error)));}}
    await reloadReplies();
    if(user){const replyForm=el('form','club-reply-form');const label=el('label','','写回复');const field=el('textarea');field.required=true;field.maxLength=1000;field.rows=3;field.placeholder='说说你的看法…';label.append(field);const send=el('button','','发送回复');send.type='submit';const status=el('p','club-form-status');status.setAttribute('role','status');replyForm.append(label,send,status);replyForm.addEventListener('submit',async event=>{event.preventDefault();send.disabled=true;status.textContent='正在发送…';try{await request(`/api/topics/${id}/replies`,{method:'POST',body:JSON.stringify({body:field.value.trim()})});field.value='';status.textContent='回复成功';await reloadReplies();}catch(error){status.textContent=friendlyError(error);}finally{send.disabled=false;}});section.append(replyForm);}else section.append(gate('登录后可以参与回复。'));
  }catch(error){container.replaceChildren(notice(friendlyError(error)));}
}
async function leaderboard(content){
  content.append(heading('HIGH SCORE CLUB','游戏排行榜','先看快速匹配胜场，再逛五款游戏的最高分。游客可以看榜，登录玩家才能留下战绩。'));
  const tabs=el('div','club-tabs');for(const [game,label] of Object.entries({match:'匹配胜场',...games})){const tab=makeButton(label,()=>{rankGame=game;renderCurrent();},'club-tab');tab.classList.toggle('selected',game===rankGame);tab.setAttribute('aria-pressed',String(game===rankGame));tabs.append(tab);}content.append(tabs);
  const list=el('ol','club-ranks');content.append(list);list.append(notice('正在读取成绩…'));
  try{const data=await request(`/api/leaderboards/${rankGame}`);list.replaceChildren();if(!data.entries.length)list.append(notice('还没有玩家上榜，来拿第一名吧。'));
    for(const entry of data.entries){const item=el('li','club-rank');item.append(el('span','club-rank-num',String(entry.rank).padStart(2,'0')),memberAvatar(entry.userId,entry.username,'club-rank-avatar'),el('span','club-rank-name',entry.username),el('strong','club-rank-score',rankGame==='match'?`${entry.score} 胜`:`${entry.score} 分`));list.append(item);}
    content.append(el('div','club-my-rank',user?(data.self?`你的排名：第 ${data.self.rank} 名 · ${data.self.score} ${rankGame==='match'?'胜':'分'}`:rankGame==='match'?'还没有匹配胜场；赢下一局后会自动上榜。':'你还未在这款游戏上榜，完成一局后自动提交。'):'游客可以看榜；注册登录后才能上榜。'));
  }catch(error){list.replaceChildren(notice(friendlyError(error)));}
}
async function prepareAvatar(file){
  if(file.size>8*1024*1024)throw Error('请选择小于 8 MB 的图片。');
  const url=URL.createObjectURL(file);
  try{
    const source=new Image();source.src=url;await source.decode();
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器无法处理图片。');
    const side=Math.min(source.naturalWidth,source.naturalHeight);
    ctx.drawImage(source,(source.naturalWidth-side)/2,(source.naturalHeight-side)/2,side,side,0,0,160,160);
    let data=canvas.toDataURL('image/webp',.8);
    if(!data.startsWith('data:image/webp'))data=canvas.toDataURL('image/jpeg',.8);
    if(data.length>70000)data=canvas.toDataURL(data.startsWith('data:image/webp')?'image/webp':'image/jpeg',.58);
    if(data.length>70000)throw Error('头像处理后仍过大，请换一张图片。');
    return data;
  }finally{URL.revokeObjectURL(url);}
}
async function notifications(content){
  content.append(heading('FROG MAIL','消息通知','帖子回复、建议点赞和好友申请都在这里。'));
  if(!user){content.append(gate('登录后可以查看消息通知。'));return;}
  const list=el('div','notification-list');content.append(list);
  try{
    const data=await request('/api/notifications');setNotificationBadge(data.unread);
    if(!data.items.length)list.append(notice('还没有新消息。去社区逛逛吧。'));
    for(const item of data.items){
      const card=el('a','notification-item'+(item.readAt?'':' is-unread'));
      const detail=item.kind==='reply'?['回复了你的帖子',`#discussion/${item.targetId}`]:item.kind==='vote'?['赞了你的建议',`#suggestions/${item.targetId}`]:['申请加你为好友','#friends'];
      card.href=detail[1];card.append(el('strong','',item.actorName+' '+detail[0]),el('time','',beijingTime(item.createdAt,'full')),el('span','','查看 →'));list.append(card);
    }
    if(data.unread){await request('/api/notifications',{method:'POST'});setNotificationBadge(0);}
  }catch(error){list.append(notice(friendlyError(error)));}
}
async function profile(content){
  content.append(heading('MY FROG ID','个人信息','查看账号资料，修改昵称或密码。'));
  if(!user){content.append(gate('请先登录后查看个人信息。'));return;}
  const overview=el('section','profile-overview account-card');
  overview.append(el('span','profile-eyebrow','PLAYER CARD'),el('h2','',user.username),el('span','profile-current-title',titleNames[user.titleKey]||titleNames.apprentice));
  const facts=el('dl','profile-facts');facts.append(el('dt','','玩家 ID'),el('dd','',String(user.publicId)),el('dt','','账号身份'),el('dd','',user.role==='admin'?'管理员':'玩家'));
  overview.append(facts);content.append(overview);
  const avatarPanel=el('section','profile-avatar-panel');
  const currentAvatar=memberAvatar(user.id,'','profile-avatar');
  const avatarControls=el('div','profile-avatar-controls');
  avatarControls.append(el('span','profile-section-kicker','头像设置'),el('h2','','换张新头像'),el('p','','支持 PNG、JPG 和 WebP；选图后先预览，再保存。'));
  const avatarForm=el('form','profile-avatar-form');
  const picker=el('div','profile-file-picker');const fileInput=el('input','profile-file-input');fileInput.type='file';fileInput.id='profile-avatar-file';fileInput.accept='image/png,image/jpeg,image/webp';
  const avatarLabel=el('label','profile-file-trigger');avatarLabel.htmlFor=fileInput.id;avatarLabel.innerHTML=iconSvg('add')+'<span>选择图片</span>';
  const fileName=el('span','profile-file-name','尚未选择图片');picker.append(fileInput,avatarLabel,fileName);
  const actions=el('div','profile-avatar-actions');
  const saveAvatar=el('button','','保存头像');saveAvatar.type='submit';saveAvatar.disabled=true;
  let previewUrl='';const clearPreview=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}};window.addEventListener('hashchange',clearPreview,{once:true});
  fileInput.addEventListener('change',()=>{clearPreview();const file=fileInput.files?.[0];fileName.textContent=file?file.name:'尚未选择图片';saveAvatar.disabled=!file;avatarStatus.textContent='';if(file&&['image/png','image/jpeg','image/webp'].includes(file.type)){previewUrl=URL.createObjectURL(file);currentAvatar.src=previewUrl;}else currentAvatar.src=avatarUrl(user.id);});
  const resetAvatar=makeButton('恢复默认头像',async()=>{resetAvatar.disabled=true;avatarStatus.textContent='正在恢复…';try{await request('/api/profile/avatar',{method:'POST',body:JSON.stringify({avatarData:null})});avatarVersion++;clearPreview();fileInput.value='';fileName.textContent='尚未选择图片';saveAvatar.disabled=true;currentAvatar.src=avatarUrl(user.id);syncAdminLink();avatarStatus.textContent='已恢复默认头像。';}catch(error){avatarStatus.textContent=friendlyError(error);}finally{resetAvatar.disabled=false;}},'profile-avatar-reset');
  const avatarStatus=el('p','profile-avatar-status');avatarStatus.setAttribute('role','status');
  actions.append(saveAvatar,resetAvatar);avatarForm.append(picker,actions,avatarStatus);
  avatarForm.addEventListener('submit',async event=>{event.preventDefault();const file=fileInput.files?.[0];if(!file){avatarStatus.textContent='请先选择一张图片。';return;}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){avatarStatus.textContent='请选择 PNG、JPG 或 WebP 图片。';return;}saveAvatar.disabled=true;avatarStatus.textContent='正在处理头像…';try{const avatarData=await prepareAvatar(file);await request('/api/profile/avatar',{method:'POST',body:JSON.stringify({avatarData})});avatarVersion++;clearPreview();currentAvatar.src=avatarUrl(user.id);syncAdminLink();fileInput.value='';fileName.textContent='尚未选择图片';avatarStatus.textContent='头像已更新。';}catch(error){avatarStatus.textContent=friendlyError(error);saveAvatar.disabled=false;}});
  avatarControls.append(avatarForm);avatarPanel.append(currentAvatar,avatarControls);content.append(avatarPanel);
  try{const {profile}=await request('/api/profile');facts.append(el('dt','','注册时间'),el('dd','',beijingTime(profile.createdAt,'full')));}
  catch(error){overview.append(notice(friendlyError(error)));}
  const matchRecord=el('div','profile-match-record');matchRecord.append(el('h3','','快速匹配战绩'));
  const recordValues=el('div','profile-match-values');matchRecord.append(recordValues);overview.append(matchRecord);
  try{const {stats}=await request('/api/match/stats');for(const [label,value] of [['胜利',stats.wins],['失败',stats.losses],['平局',stats.draws],['胜率',`${stats.winRate}%`]]){const item=el('div','profile-match-value');item.append(el('strong','',String(value)),el('span','',label));recordValues.append(item);}}
  catch(error){matchRecord.append(notice(friendlyError(error)));}
  const history=el('section','profile-panel profile-history');history.append(el('span','profile-section-kicker','MATCH HISTORY'),el('h2','','最近对局'),el('p','profile-section-copy','查看最近 20 场快速匹配的对手、游戏和分数。'));
  const historyList=el('div','profile-history-list');history.append(historyList);content.append(history);
  try{const {items}=await request('/api/match/history');if(!items.length)historyList.append(notice('还没有匹配记录，去打一场吧。'));for(const item of items){const row=el('div','profile-history-row');row.append(memberAvatar(item.opponentId,item.opponentName,'profile-history-avatar'));const detail=el('div','profile-history-detail');detail.append(el('strong','',`${games[item.game]||'未知游戏'} · ${item.opponentName}`),el('time','',beijingTime(item.finishedAt,'full')));row.append(detail,el('span','profile-history-score',`${item.ownScore??'—'} : ${item.opponentScore??'—'}`),el('b','profile-history-result '+item.result,{win:'胜利',loss:'失败',draw:'平局'}[item.result]));historyList.append(row);}}
  catch(error){historyList.append(notice(friendlyError(error)));}
  const achievements=el('section','profile-panel profile-achievements');achievements.append(el('span','profile-section-kicker','FROG TITLES'),el('h2','','成就与称号'),el('p','profile-section-copy','完成挑战后解锁称号，选中的称号会显示在头像旁。'));
  const titleList=el('div','profile-title-list');achievements.append(titleList);content.append(achievements);
  try{const data=await request('/api/profile/titles');const descriptions={apprentice:'加入青蛙游戏厅即可获得',first_win:'快速匹配赢得第一场',three_wins:'快速匹配连续赢得 3 场',sharp_eye:'青蛙定位练习至少命中 10 次，命中率达 90%'};
    for(const [key,label] of Object.entries(titleNames)){const unlocked=data.unlocked[key],card=el('div','profile-title-card'+(unlocked?'':' is-locked'));const copy=el('div','');copy.append(el('strong','',label),el('span','',descriptions[key]));const button=makeButton(key===data.selected?'佩戴中':unlocked?'佩戴称号':'未解锁',async()=>{button.disabled=true;try{const result=await request('/api/profile/titles',{method:'POST',body:JSON.stringify({key})});user.titleKey=result.titleKey;syncAdminLink();overview.querySelector('.profile-current-title').textContent=label;titleList.querySelectorAll('button').forEach(item=>{item.textContent=item.dataset.unlocked==='true'?'佩戴称号':'未解锁';item.disabled=item.dataset.unlocked!=='true';});button.textContent='佩戴中';button.disabled=true;}catch(error){achievements.append(notice(friendlyError(error)));button.disabled=false;}},'profile-title-button');button.dataset.unlocked=String(unlocked);button.disabled=!unlocked||key===data.selected;card.append(copy,button);titleList.append(card);}
  }catch(error){titleList.append(notice(friendlyError(error)));}
  const settings=el('section','profile-settings');settings.append(el('span','profile-section-kicker','账号设置'),el('h2','','账号与安全'),el('p','profile-settings-intro','选择一项修改；保存时需填写当前密码。'));
  const tabs=el('div','profile-settings-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','账号设置');
  const grid=el('div','profile-grid');settings.append(tabs,grid);content.append(settings);
  const nameForm=el('form','profile-panel');nameForm.innerHTML=`<h2>修改用户名</h2><label>新用户名<input name="username" autocomplete="username" minlength="3" maxlength="20" required></label><label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" required></label><button type="submit">保存用户名</button><p role="status"></p>`;
  nameForm.elements.username.value=user.username;
  nameForm.addEventListener('submit',async event=>{event.preventDefault();const button=nameForm.querySelector('button'),status=nameForm.querySelector('[role=status]');button.disabled=true;status.textContent='正在保存…';try{const result=await request('/api/profile/username',{method:'POST',body:JSON.stringify({username:nameForm.elements.username.value.trim(),currentPassword:nameForm.elements.currentPassword.value})});user=result.user;nameForm.elements.currentPassword.value='';overview.querySelector('h2').textContent=user.username;syncAdminLink();status.textContent='用户名已更新。';}catch(error){status.textContent=friendlyError(error);}finally{button.disabled=false;}});nameForm.id='profile-name-panel';nameForm.setAttribute('role','tabpanel');grid.append(nameForm);
  const passForm=el('form','profile-panel profile-password-panel');passForm.innerHTML=`<h2>修改密码</h2><label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>确认新密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button type="submit">更新密码</button><p role="status"></p>`;
  passForm.addEventListener('submit',async event=>{event.preventDefault();const button=passForm.querySelector('button'),status=passForm.querySelector('[role=status]');if(passForm.elements.newPassword.value!==passForm.elements.confirmPassword.value){status.textContent='两次输入的新密码不一致。';return;}button.disabled=true;status.textContent='正在更新…';try{await request('/api/profile/password',{method:'POST',body:JSON.stringify({currentPassword:passForm.elements.currentPassword.value,newPassword:passForm.elements.newPassword.value})});clearSession();syncAdminLink();accountMode='login';accountMessage='密码已更新，请用新密码重新登录。';location.hash='account';}catch(error){status.textContent=friendlyError(error);button.disabled=false;}});passForm.id='profile-password-panel';passForm.setAttribute('role','tabpanel');grid.append(passForm);
  const tabButtons=[['用户名',nameForm],['密码',passForm]].map(([label,panel],index)=>{const button=makeButton(label,()=>selectTab(index),'profile-settings-tab');button.id=`profile-settings-tab-${index}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',button.id);tabs.append(button);return button;});
  function selectTab(index){tabButtons.forEach((button,i)=>{const selected=i===index;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;[nameForm,passForm][i].hidden=!selected;});}
  tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const current=tabButtons.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?tabButtons.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabButtons.length)%tabButtons.length;selectTab(next);tabButtons[next].focus();});
  selectTab(0);
  content.append(makeButton('退出登录',async()=>{try{await request('/api/logout',{method:'POST'});}catch{}clearSession();syncAdminLink();location.hash='account';},'profile-logout'));
}
function account(content){
  content.append(heading('JOIN THE CLUB','玩家身份','注册后可以提议、点赞、讨论和上榜；也可以先以游客身份逛逛。'));
  if(user){const card=el('div','account-card');card.append(el('h2','',`欢迎回来，${user.username}`),el('p','','你已登录，完成游戏后会自动记录最高分。'));if(user.role==='admin'){const link=el('a','club-action','进入管理后台 ↗');link.href='./admin.html';card.append(link);}card.append(makeButton('退出登录',async()=>{try{await request('/api/logout',{method:'POST'});}catch{}clearSession();syncAdminLink();renderCurrent();},'club-action'));content.append(card);return;}
  if(accountMessage){content.append(el('p','club-success',accountMessage));accountMessage='';}
  const tabs=el('div','club-tabs');for(const [mode,label] of [['login','登录'],['register','注册']]){const tab=makeButton(label,()=>{accountMode=mode;renderCurrent();},'club-tab');tab.classList.toggle('selected',accountMode===mode);tabs.append(tab);}content.append(tabs);
  const formNode=el('form','account-card account-form');formNode.innerHTML=`<label>玩家昵称<input name="username" autocomplete="username" minlength="3" maxlength="20" required></label><label>密码<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><button type="submit"></button><p role="status"></p>`;
  formNode.querySelector('button').textContent=accountMode==='register'?'创建账号 ↗':'登录 ↗';formNode.querySelector('[name=password]').autocomplete=accountMode==='register'?'new-password':'current-password';
  formNode.addEventListener('submit',async event=>{event.preventDefault();const button=formNode.querySelector('button'),status=formNode.querySelector('[role=status]');button.disabled=true;status.textContent='正在处理…';try{const data=await request('/api/'+accountMode,{method:'POST',body:JSON.stringify({username:formNode.elements.username.value.trim(),password:formNode.elements.password.value})});saveSession(data);location.hash=returnTo;returnTo='games';}catch(error){status.textContent=friendlyError(error);}finally{button.disabled=false;}});
  content.append(formNode);const guest=el('a','guest-link','游客登录 · 先逛逛 →');guest.href='#games';content.append(guest);
}
async function renderCurrent(){const route=location.hash.slice(1),detail=/^(suggestions|discussion)\/(new|\d+)$/.exec(route),base=detail?.[1]||route,visible=routes.has(base);page.hidden=!visible;if(!visible)return;if(base==='account'&&user){location.hash='profile';return;}$('#lobby').hidden=true;$('#game-screen').hidden=true;const content=el('div');content.id='club-content';$('#club-content').replaceWith(content);$('#club-location').textContent={suggestions:'意见留言',discussion:'玩家社区',leaderboard:'排行榜',notifications:'消息通知',account:'登录 / 注册',profile:'个人信息'}[base];document.querySelectorAll('[data-club-nav]').forEach(link=>link.classList.toggle('active',link.dataset.clubNav===base));if(detail){if(detail[2]==='new')composePage(content,base);else if(base==='suggestions')await suggestionDetail(content,detail[2]);else await topicDetail(content,detail[2]);}else if(base==='suggestions')await suggestions(content);else if(base==='discussion')await discussion(content);else if(base==='leaderboard')await leaderboard(content);else if(base==='notifications')await notifications(content);else if(base==='profile')await profile(content);else account(content);}
window.addEventListener('hashchange',renderCurrent);
window.addEventListener('sweetfrog:finished',async event=>{if(!user)return;const {game,score,hits,shots}=event.detail;if(!games[game])return;try{await request(`/api/leaderboards/${game}`,{method:'POST',body:JSON.stringify({score,...(game==='aim'?{hits,shots}:{})})});}catch(error){console.warn('成绩提交失败:',friendlyError(error));}});
await refreshSession();syncAdminLink();refreshNotifications();renderCurrent();

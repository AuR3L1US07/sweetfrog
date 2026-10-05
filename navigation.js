import { iconSvg } from './icons.js';

const header=document.querySelector('.site-header'),nav=header.querySelector('nav'),account=document.querySelector('#account-chip');
header.append(account);nav.id='site-navigation';
const menu=document.createElement('button');menu.type='button';menu.id='nav-menu-toggle';menu.className='nav-menu-toggle';menu.setAttribute('aria-controls','site-navigation');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','展开功能菜单');header.append(menu);
function syncMenuBadge(){const source=nav.querySelector('#friends-badge'),target=menu.querySelector('.nav-menu-badge');if(!target)return;target.hidden=!source||source.hidden;target.textContent=source?.textContent||'';}
function renderMenu(open){menu.innerHTML=iconSvg(open?'close':'menu')+'<span>菜单</span><small class="nav-menu-badge" hidden></small>';syncMenuBadge();}
renderMenu(false);
const backdrop=document.createElement('button');backdrop.type='button';backdrop.id='nav-backdrop';backdrop.hidden=true;backdrop.setAttribute('aria-label','关闭功能菜单');document.body.append(backdrop);
const drawerHead=document.createElement('div');drawerHead.className='nav-drawer-head';drawerHead.innerHTML='<strong>全部功能</strong>';
const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','关闭功能菜单');close.innerHTML=iconSvg('close');drawerHead.append(close);nav.prepend(drawerHead);
const labels={
  '#games':['frog','大厅'],'#pk':['swords','对战'],'#match':['match','匹配'],
  '#suggestions':['note','留言'],'#discussion':['topic','社区'],
  '#leaderboard':['trophy','排行'],'#friends':['people','好友'],
  './admin.html':['settings','后台']
};
let syncing=false;
function sync(){
  if(syncing)return;syncing=true;
  for(const link of nav.querySelectorAll('a')){
    const config=labels[link.getAttribute('href')];if(!config)continue;
    if(link.dataset.navIcon===config[0]&&link.querySelector('.nav-label'))continue;
    const badge=link.querySelector('.nav-badge');link.innerHTML=iconSvg(config[0])+'<span class="nav-label"></span>';
    link.querySelector('.nav-label').textContent=config[1];if(badge)link.append(badge);link.dataset.navIcon=config[0];
    link.setAttribute('aria-label',config[1]);
  }
  const sound=nav.querySelector('#sound-toggle');
  if(sound&&!sound.querySelector('.nav-label'))sound.innerHTML=iconSvg('music')+'<span class="nav-label">音效</span>';
  syncMenuBadge();
  syncing=false;
}
const observer=new MutationObserver(()=>sync());observer.observe(nav,{childList:true,subtree:true});sync();
function syncActive(){
  const section=location.hash.slice(1).split('/')[0]||'games';
  for(const link of nav.querySelectorAll('a')){
    const selected=link.getAttribute('href')==='#'+section;
    link.classList.toggle('active',selected);
    if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
}
const activeObserver=new MutationObserver(syncActive);activeObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});syncActive();
function setOpen(open){const expanded=Boolean(open);header.classList.toggle('nav-open',expanded);menu.setAttribute('aria-expanded',String(expanded));menu.setAttribute('aria-label',expanded?'关闭功能菜单':'展开功能菜单');renderMenu(expanded);backdrop.hidden=!expanded;document.body.classList.toggle('nav-drawer-open',expanded);if(expanded)close.focus();}
menu.addEventListener('click',()=>setOpen(!header.classList.contains('nav-open')));
close.addEventListener('click',()=>{setOpen(false);menu.focus();});
backdrop.addEventListener('click',()=>{setOpen(false);menu.focus();});
nav.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
window.addEventListener('hashchange',()=>{setOpen(false);syncActive();});
window.addEventListener('keydown',event=>{
  if(!header.classList.contains('nav-open'))return;
  if(event.key==='Escape'){setOpen(false);menu.focus();return;}
  if(event.key!=='Tab')return;
  const focusable=[...nav.querySelectorAll('a,button')].filter(node=>!node.hidden&&node.getClientRects().length);
  if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
const media=matchMedia('(min-width:1101px)');media.addEventListener('change',()=>{if(media.matches)setOpen(false);});

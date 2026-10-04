import { createAimGame } from './aim.js?v=20261004-pk2';
import { slideBoard, canMove, RADII, physicsStep } from './core.js';
const $ = s => document.querySelector(s);
const stage = $('#game-stage'), overlay = $('#game-overlay');
const descriptions = {
 aim: {title:'青蛙定位练习',category:'SWEETFROG AIM STUDIO',intro:'稳住准星，快速定位。把准星练成肌肉记忆。',rules:'选择模式、难度和时长，倒数 3 秒后开始。\n默认随机大小，也可选择大 / 中 / 小靶。\n只打照片，不要打青蛙！误击扣 100 分并断连。',hint:'鼠标点击 / 触屏点按 · Esc 暂停 · 平均用时不包含暂停时间',extra:'剩余时间'},
 tap: {title:'逮住大青蛙',category:'FAST FINGERS CLUB',intro:'30 秒内，从最底下一排开始点头像。',rules:'只点最底下一排的头像。\n点对得 1 分，点错扣 2 秒。\n手速有多快，友情就有多深。',hint:'点击最底下一排的头像 · 键盘 D / F / J / K 对应四列',extra:'剩余时间'},
 merge: {title:'合成大青蛙',category:'BIG FRIEND ENERGY',intro:'相同头像碰撞升级，合出终极大青蛙。',rules:'左右移动选择落点，点击放下头像。\n相同等级碰到一起就会合成。\n堆过虚线太久，本局就结束啦。',hint:'移动选择落点，点击 / 松手投放 · 键盘 ← → 移动，空格投放',extra:'下一颗'},
 flap: {title:'青蛙起飞',category:'FLY, MY FRIEND',intro:'轻轻一点，让青蛙飞过每一道水管。',rules:'点击画面或按空格向上飞。\n每穿过一组水管得 1 分。\n碰到水管、天空或地面都会结束。',hint:'点击画面 / 按空格起飞 · 保持节奏，稳住别慌',extra:'状态'},
 puzzle: {title:'青蛙2048',category:'FRIENDSHIP EVOLUTION',intro:'相同数字与照片合并，向 2048 进化。',rules:'滑动或按方向键移动全部方块。\n相同数字合并，每次移动出现新方块。\n合出 2048 后还能继续挑战！',hint:'滑动屏幕 / 使用方向键 · 相同数字才能合并',extra:'最高方块'}
};
let active = null, session = null, running = false, paused = false, score = 0, raf = 0, lastTime = 0;
let pkMode = null, pkRandomState = 0;
function gameRandom(){if(!pkMode)return Math.random();pkRandomState^=pkRandomState<<13;pkRandomState^=pkRandomState>>>17;pkRandomState^=pkRandomState<<5;return (pkRandomState>>>0)/4294967296;}
let sound = true, audioCtx, toastTimer, ambientTimer, ambientStep=0;
try { sound = localStorage.getItem('sweetfrog-sound') !== 'off'; } catch {}
const records = {};
for (const key of Object.keys(descriptions)) { try { records[key] = Math.max(0, Number(localStorage.getItem('sweetfrog-best-' + key)) || 0); } catch { records[key] = 0; } }
function updateRecords() { document.querySelectorAll('[data-best]').forEach(el => { el.textContent = '最高 ' + records[el.dataset.best] + ' 分'; }); }
updateRecords();
function setScore(value) { score = value; $('#score').textContent = value; if(pkMode){if(running)window.dispatchEvent(new CustomEvent('sweetfrog:pk-score',{detail:{game:active,score:value}}));return;} if (value > records[active]) { records[active] = value; try { localStorage.setItem('sweetfrog-best-' + active, value); } catch {} } $('#best').textContent = records[active]; }
function extra(value) { $('#extra').textContent = value; }
function ensureAudio(){if(!sound)return null;try{audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();if(!ambientTimer)ambientTimer=setInterval(playAmbient,820);return audioCtx;}catch{return null;}}
function note(frequency,at,duration,volume,type='sine'){const ctx=audioCtx;if(!ctx||ctx.state!=='running')return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+.08);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain);gain.connect(ctx.destination);osc.start(at);osc.stop(at+duration+.01);}
function playAmbient(){if(!sound||document.hidden||!audioCtx||audioCtx.state!=='running')return;const melody=[261.63,329.63,392,329.63,293.66,349.23,440,349.23,261.63,329.63,392,493.88,349.23,329.63,293.66,261.63];const now=audioCtx.currentTime;note(melody[ambientStep%melody.length],now,.75,.012);if(ambientStep%4===0)note([130.81,146.83,174.61,130.81][Math.floor(ambientStep/4)%4],now,2.3,.006);ambientStep++;}
function beep(frequency=520,duration=.065){const ctx=ensureAudio();if(!ctx)return;try{const at=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=frequency>=400?'triangle':'sine';osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(Math.max(60,frequency*(frequency>=400?.68:.78)),at+duration);gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.07,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain);gain.connect(ctx.destination);osc.start(at);osc.stop(at+duration+.01);if(frequency>=400){const pop=ctx.createOscillator(),popGain=ctx.createGain();pop.type='square';pop.frequency.setValueAtTime(frequency*.55,at);pop.frequency.exponentialRampToValueAtTime(Math.max(80,frequency*.25),at+.04);popGain.gain.setValueAtTime(.015,at);popGain.gain.exponentialRampToValueAtTime(.0001,at+.045);pop.connect(popGain);popGain.connect(ctx.destination);pop.start(at);pop.stop(at+.05);}}catch{}}
window.addEventListener('sweetfrog:mascot-tap',event=>beep(event.detail.taps===5?880:480+event.detail.taps*70,.08));
window.addEventListener('sweetfrog:pk-hit',event=>beep(event.detail.correct?680:150,event.detail.correct?.06:.1));

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 1800); }
function syncSound(){const toggle=$('#sound-toggle');toggle.textContent=sound?'♫ 声音开':'♫ 声音关';toggle.setAttribute('aria-pressed',String(sound));toggle.setAttribute('aria-label',sound?'关闭音乐和音效':'开启音乐和音效');}
syncSound();
$('#sound-toggle').onclick=()=>{sound=!sound;try{localStorage.setItem('sweetfrog-sound',sound?'on':'off');}catch{}syncSound();if(sound){ensureAudio();beep(660,.08);}else audioCtx?.suspend();};
document.addEventListener('pointerdown',ensureAudio,{once:true});
document.addEventListener('keydown',ensureAudio,{once:true});

// Source rectangles are display framing only; the provided originals remain intact.
const frames = [[0,.22,.55,.42],[.04,.02,.69,.56],[.28,.14,.43,.195],[.53,.44,.44,.20],[.11,.145,.33,.148]];
const photos = Array.from({length:5}, (_,i) => { const im = new Image(); im.src = `./assets/photo-${i+1}.jpg`; return im; });

const ready = Promise.all(photos.map(im => new Promise(resolve => { im.onload = () => resolve(true); im.onerror = () => resolve(false); if (im.complete) resolve(im.naturalWidth > 0); })));
const colors = ['#d5e999','#f5d78a','#c9dbed','#e1c5e6','#f0b9a2','#a4d9bd','#edbce0','#eedb7b','#b6c8ee','#b7e692','#f6c276'];
function face(ctx, idx, x, y, size, round = true) { ctx.save(); ctx.beginPath(); if (round) ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2); else ctx.rect(x,y,size,size); ctx.clip(); const n = idx % 5, im = photos[n], crop = frames[n]; ctx.fillStyle = colors[idx % colors.length]; ctx.fillRect(x,y,size,size); if (im.complete && im.naturalWidth) { ctx.drawImage(im,crop[0]*im.naturalWidth,crop[1]*im.naturalHeight,crop[2]*im.naturalWidth,crop[3]*im.naturalHeight,x,y,size,size); } else { ctx.fillStyle='#345735';ctx.font=`${size*.5}px sans-serif`;ctx.fillText('☺',x+size*.22,y+size*.68); } ctx.restore(); }
function tileCanvas(index) { const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 180; face(canvas.getContext('2d'),index,0,0,180,false); return canvas; }
function makeCanvas() { const canvas = document.createElement('canvas'); canvas.width=840; canvas.height=1020; canvas.setAttribute('aria-label',descriptions[active].title+'游戏画面'); stage.replaceChildren(canvas); const ctx=canvas.getContext('2d'); ctx.scale(2,2); return {canvas,ctx}; }
function drawFace(ctx, level, x, y, r) { ctx.fillStyle=colors[level%colors.length];ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();face(ctx,level,x-r+3,y-r+3,(r-3)*2);ctx.strokeStyle=colors[level%colors.length];ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r-1,0,Math.PI*2);ctx.stroke(); }
function showOverlay(title,text,label,callback) { $('#overlay-title').textContent=title;$('#overlay-text').textContent=text;$('#start-button').textContent=label;$('#start-button').onclick=callback;overlay.hidden=false; }
function finish(title, text) { if (!running) return;running=false;cancelAnimationFrame(raf);beep(180,.2);extra(active==='tap'||active==='aim'?'0 秒':'结束');if(pkMode){window.dispatchEvent(new CustomEvent('sweetfrog:pk-finished',{detail:{game:active,score}}));showOverlay(title,text+`\n本局 ${score} 分，等待对手成绩…`,'等待对战结果',null);$('#start-button').disabled=true;return;}updateRecords();window.dispatchEvent(new CustomEvent('sweetfrog:finished',{detail:{game:active,score}}));showOverlay(title,text+`\n本局 ${score} 分 · 最佳 ${records[active]} 分`,'不服，再来一局 ↻',start); }
function cleanup() { running=false;paused=false;cancelAnimationFrame(raf);session?.destroy?.();session=null;stage.replaceChildren(); }
async function openGame(key) {
 if (!descriptions[key]) return;
 cleanup(); active=key;
 $('#game-screen').classList.toggle('aim-screen',key==='aim');
 $('#game-screen').classList.toggle('pk-mode',Boolean(pkMode));
 $('#aim-options').hidden=key!=='aim'||Boolean(pkMode); $('#aim-stats').hidden=key!=='aim'; $('#aim-legend').hidden=key!=='aim'; $('#aim-frog-hits').textContent='0';
 $('.scoreboard > div:nth-child(2) > span').textContent=pkMode?'对手得分':key==='aim'?'综合最佳':'历史最佳';
 $('#lobby').hidden=true; $('#game-screen').hidden=false;
 const d=descriptions[key]; $('#game-title').textContent=d.title; $('#game-description').textContent=d.intro; $('#game-category').textContent=d.category; $('#game-hint').textContent=pkMode?(key==='aim'?'点击照片圆靶，避开青蛙炸弹 · 本场 30 秒':d.hint.replace(/ · Esc 暂停/g,'')+' · 本场 30 秒'):d.hint; $('#extra-label').textContent=d.extra; $('#direction-pad').hidden=key!=='puzzle';
 stage.style.aspectRatio=key==='aim'?'':key==='puzzle'?'1':'420/510';
 if(key==='aim')for(const id of ['#aim-accuracy','#aim-reaction','#aim-combo','#aim-hits'])$(id).textContent='—';
 setScore(0);if(pkMode)$('#best').textContent='0';extra('准备');showOverlay('准备好了吗？',d.rules,'素材加载中…',null);$('#start-button').disabled=true;$('#back-button').hidden=Boolean(pkMode);$('#restart-button').hidden=Boolean(pkMode);window.scrollTo(0,0);
 await ready;if(active!==key)return;$('#start-button').disabled=false;showOverlay('准备好了吗？',d.rules,'开始游戏 →',start);
}
function lobby() { cleanup();pkMode=null;active=null;$('#lobby').hidden=false;$('#game-screen').classList.remove('pk-mode');$('#game-screen').hidden=true;$('#back-button').hidden=false;$('#restart-button').hidden=false;updateRecords(); }
function route() {const key=location.hash.slice(1);if(descriptions[key])openGame(key);else lobby();}
window.addEventListener('hashchange',route);document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.game;});$('#back-button').onclick=()=>{location.hash='games';};$('#restart-button').onclick=()=>{if(active)openGame(active);};
function start() { cleanup();pkRandomState=pkMode?(pkMode.seed||1):0;setScore(0);overlay.hidden=true;running=true;paused=false;session=({tap:createTap,merge:createMerge,flap:createFlap,puzzle:createPuzzle,aim:()=>createAimGame({stage,tileCanvas,canPlay:()=>running&&!paused,setScore,extra,beep,finish,random:gameRandom,skipCountdown:Boolean(pkMode)})})[active]();lastTime=performance.now();raf=requestAnimationFrame(tick);beep(); }
function tick(now) {if(!running||paused)return;if(pkMode&&Date.now()>=pkMode.localEndsAt){finish('时间到！','30 秒 PK 已结束。');return;}const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;session?.update?.(dt);session?.draw?.();if(running&&!paused)raf=requestAnimationFrame(tick);}
function pause() { if(pkMode||!running||paused)return;paused=true;cancelAnimationFrame(raf);showOverlay('休息一下，友情不掉线', '游戏已暂停，回来后继续。','继续游戏 →',()=>{paused=false;overlay.hidden=true;lastTime=performance.now();raf=requestAnimationFrame(tick);}); }
export async function launchPkGame(game,seed,localEndsAt){if(!descriptions[game])return;pkMode={game,seed,localEndsAt};if(game==='aim'){$('#aim-duration').value='30';$('#aim-mode').value='flick';$('#aim-difficulty').value='random';}await openGame(game);if(!pkMode||pkMode.game!==game||Date.now()>=localEndsAt)return;start();}
export function stopPkGame(){if(!pkMode)return;cleanup();pkMode=null;$('#game-screen').classList.remove('pk-mode');$('#game-screen').hidden=true;$('#back-button').hidden=false;$('#restart-button').hidden=false;}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);
window.addEventListener('keydown',e=>{if(!active)return;if(e.key==='Escape'){pause();return;}if(e.code==='Space'||e.key.startsWith('Arrow'))e.preventDefault();if(running&&!paused)session?.key?.(e);});
for(const b of document.querySelectorAll('[data-dir]'))b.onclick=()=>{if(running&&!paused)session?.move?.(b.dataset.dir);};
function createTap() {
 let time=30, rows=Array.from({length:5},()=>Math.floor(gameRandom()*4));const board=document.createElement('div');board.className='tap-board';stage.append(board);
 function render(){board.replaceChildren();rows.forEach((col,row)=>{const line=document.createElement('div');line.className='tap-row';for(let c=0;c<4;c++){const b=document.createElement('button');b.className='tap-cell'+(c===col?' face':'');b.dataset.row=row;b.dataset.col=c;b.setAttribute('aria-label',`第${row+1}排第${c+1}列${c===col?'头像':'空格'}`);if(c===col)b.append(tileCanvas((score+row)%5));line.append(b);}board.append(line);});}
 function hit(row,col){if(!running||paused)return;if(row===4&&col===rows[4]){setScore(score+1);rows.pop();rows.unshift(Math.floor(gameRandom()*4));beep(400+(score%8)*65);render();}else{time=Math.max(0,time-2);beep(140,.12);board.classList.remove('miss');void board.offsetWidth;board.classList.add('miss');toast('点错啦！扣 2 秒');}}
 board.addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(b){e.preventDefault();hit(Number(b.dataset.row),Number(b.dataset.col));}});render();extra('30 秒');return {update(dt){time-=dt;extra(Math.max(0,Math.ceil(time))+' 秒');if(time<=0)finish(score>=60?'手速快到失去朋友！':score>=30?'熟练捕蛙人':'这操作，大兄弟认可了',score>=30?'友情经得住你的手速。':'刚才一定是在让着他，对吧？');},key(e){const c=['d','f','j','k'].indexOf(e.key.toLowerCase());if(c>=0&&!e.repeat)hit(4,c);}};
}
function createPuzzle() {
 let board=Array(16).fill(0),won=false;const grid=document.createElement('div');grid.className='puzzle-board';stage.append(grid);let touch=null;
 function spawn(){const free=board.map((v,i)=>v?null:i).filter(v=>v!==null);if(free.length)board[free[Math.floor(gameRandom()*free.length)]]=gameRandom()<.9?2:4;}
 function render(){grid.replaceChildren();for(const value of board){const cell=document.createElement('div');cell.className='tile'+(value?' filled':'');if(value){const level=Math.log2(value)-1;cell.style.setProperty('--tile-color',colors[level%colors.length]);cell.append(tileCanvas(level));const n=document.createElement('span');n.className='tile-number';n.textContent=value;cell.append(n);const badge=document.createElement('small');badge.textContent='Lv.'+(level+1);cell.append(badge);cell.setAttribute('aria-label',String(value));}grid.append(cell);}extra(Math.max(...board));}
 function move(dir){if(!running||paused)return;const result=slideBoard(board,dir);if(!result.changed)return;board=result.board;setScore(score+result.gained);spawn();render();beep(result.gained?660:320);if(!won&&Math.max(...board)>=2048){won=true;toast('2048 达成！终极大兄弟解锁，继续挑战！');}if(!canMove(board))finish('友情满格，棋盘也满了', '大兄弟说：下一局肯定能行。');}
 grid.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY};grid.setPointerCapture(e.pointerId);});grid.addEventListener('pointerup',e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;move(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});grid.addEventListener('pointercancel',()=>touch=null);
 spawn();spawn();render();return {move,key(e){const dir={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(dir)move(dir);}};
}
function createFlap() {
 const {canvas,ctx}=makeCanvas();let y=230,vy=0,elapsed=0,spawnAt=.65,pipes=[],started=false,travel=0;const x=108,r=21,gap=157;
 function flap(){if(!running||paused)return;started=true;vy=-305;beep(620,.04);extra('飞行中');}
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();flap();});extra('点我起飞');
 function draw(){ctx.fillStyle='#deedf0';ctx.fillRect(0,0,420,510);ctx.fillStyle='#ffffff9e';for(let i=0;i<4;i++){const cx=((i*140+90-travel*.18)%560+560)%560-60;ctx.beginPath();ctx.ellipse(cx,90+(i%2)*93,39,13,0,0,7);ctx.fill();ctx.beginPath();ctx.arc(cx,80+(i%2)*93,16,0,7);ctx.fill();}
 for(const p of pipes){ctx.fillStyle='#97b781';ctx.strokeStyle='#678e5c';ctx.lineWidth=3;ctx.fillRect(p.x,0,58,p.top);ctx.strokeRect(p.x,-3,58,p.top+3);ctx.fillRect(p.x,p.top+gap,58,510-p.top-gap);ctx.strokeRect(p.x,p.top+gap,58,510-p.top-gap);ctx.fillStyle='#b4ce95';ctx.fillRect(p.x-5,p.top-20,68,20);ctx.strokeRect(p.x-5,p.top-20,68,20);ctx.fillRect(p.x-5,p.top+gap,68,20);ctx.strokeRect(p.x-5,p.top+gap,68,20);}
 ctx.fillStyle='#d8e3b6';ctx.fillRect(0,479,420,31);ctx.fillStyle='#8aa467';ctx.fillRect(0,478,420,5);ctx.save();ctx.translate(x,y);ctx.rotate(Math.max(-.45,Math.min(1,vy/550)));ctx.fillStyle='#fbf6da';ctx.beginPath();ctx.ellipse(-21,8,15,8,-.3,0,7);ctx.fill();drawFace(ctx,0,0,0,r);ctx.restore();if(!started){ctx.fillStyle='#446444';ctx.font='bold 16px Sweet Round, sans-serif';ctx.textAlign='center';ctx.fillText('点击画面，让青蛙起飞 ↑',210,370);}}
 return {draw,key(e){if(e.code==='Space'||e.key==='ArrowUp'){if(!e.repeat)flap();}},update(dt){if(!started)return;elapsed+=dt;travel+=137*dt;vy+=850*dt;y+=vy*dt;if(elapsed>=spawnAt){pipes.push({x:440,top:65+gameRandom()*210,scored:false});spawnAt=elapsed+1.72;}for(const p of pipes){p.x-=137*dt;if(!p.scored&&p.x+63<x-r){p.scored=true;setScore(score+1);beep(880);}if(x+r>p.x-5&&x-r<p.x+63&&(y-r<p.top||y+r>p.top+gap)){finish('朋友已成功降落……在水管上','别慌，大兄弟也没飞明白。');return;}}pipes=pipes.filter(p=>p.x>-80);if(y-r<0||y+r>478)finish('起飞很帅，落地有点快','再来一次，这回一定能飞远。');}};
}
function createMerge() {
 const {canvas,ctx}=makeCanvas();let balls=[],aim=210,next=Math.floor(gameRandom()*3),cooldown=0,acc=0,danger=0,maxLevel=0;extra('Lv.'+(next+1));
 function setAim(e){const rect=canvas.getBoundingClientRect();aim=Math.max(RADII[next]+8,Math.min(412-RADII[next],(e.clientX-rect.left)/rect.width*420));}
 function drop(){if(!running||paused||cooldown>0)return;const r=RADII[next];balls.push({x:Math.max(r+8,Math.min(412-r,aim)),y:42,vx:0,vy:0,level:next,r,age:0});next=Math.floor(gameRandom()*3);cooldown=.48;extra('Lv.'+(next+1));beep(400,.05);}
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();setAim(e);canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',setAim);canvas.addEventListener('pointerup',e=>{setAim(e);drop();});
 function draw(){ctx.fillStyle='#fbf0de';ctx.fillRect(0,0,420,510);ctx.strokeStyle=danger>.3?'#cc7656':'#d6b98c';ctx.lineWidth=1.5;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(10,96);ctx.lineTo(410,96);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b9956b';ctx.font='11px Sweet Round, sans-serif';ctx.textAlign='left';ctx.fillText(danger>.3?'快满啦！赶紧合成':'别让青蛙堆过这条线',13,88);if(cooldown<=0){ctx.globalAlpha=.65;drawFace(ctx,next,aim,38,RADII[next]);ctx.globalAlpha=1;ctx.strokeStyle='#d9c5a4';ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(aim,38+RADII[next]);ctx.lineTo(aim,477);ctx.stroke();ctx.setLineDash([]);}for(const b of balls){drawFace(ctx,b.level,b.x,b.y,b.r);ctx.fillStyle='#fff8e9';ctx.beginPath();ctx.arc(b.x,b.y+b.r-8,9,0,7);ctx.fill();ctx.fillStyle='#5c653c';ctx.font='bold 10px Sweet Round, sans-serif';ctx.textAlign='center';ctx.fillText(String(b.level+1),b.x,b.y+b.r-4);}ctx.fillStyle='#cbbc99';ctx.fillRect(0,493,420,17);if(danger>.3){ctx.fillStyle='#ca7758';ctx.fillRect(0,0,420*Math.min(1,danger/2),4);}}
 return {draw,key(e){if(e.key==='ArrowLeft')aim=Math.max(RADII[next]+8,aim-18);if(e.key==='ArrowRight')aim=Math.min(412-RADII[next],aim+18);if(e.code==='Space'&&!e.repeat)drop();},update(dt){cooldown=Math.max(0,cooldown-dt);acc+=dt;while(acc>=1/120){const r=physicsStep(balls,1/120);acc-=1/120;if(r.gained){setScore(score+r.gained);beep(500+r.largest*75,.08);if(r.largest>maxLevel){maxLevel=r.largest;if(maxLevel===7)toast('终极大兄弟合成成功！');}}}const overflowing=balls.some(b=>b.age>1.8&&b.y-b.r<96&&Math.abs(b.vy)<45);danger=overflowing?danger+dt:Math.max(0,danger-dt*2);if(danger>=2)finish('大兄弟太多，装不下啦','合成到第 '+(maxLevel+1)+' 级！这份友情有点沉。');}};
}
route();

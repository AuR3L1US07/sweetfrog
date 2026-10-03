import { firebaseConfig } from './firebase-config.js';

const games = { tap: '逮住大青蛙', merge: '合成大青蛙', flap: '青蛙起飞', puzzle: '青蛙2048', aim: '青蛙定位练习' };
const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const $ = selector => document.querySelector(selector);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
let db, auth, firestore, currentGame = 'tap', playerName = '', threadsCursor = null, loadingThreads = false;

const section = el('section', 'community-section');
section.id = 'community';
section.innerHTML = `<div class="community-heading"><span class="eyebrow">THE FROG CLUB</span><h2>青蛙俱乐部</h2><p>聊聊玩法，也看看谁是今天的榜一。</p></div><div class="community-identity"><label for="frog-name">你的昵称</label><input id="frog-name" maxlength="20" autocomplete="nickname" placeholder="取个好记的名字"><span id="frog-connection" role="status"></span></div><div class="community-columns"><section class="community-panel" aria-labelledby="board-title"><div class="community-panel-head"><div><span class="eyebrow">SAY HELLO</span><h3 id="board-title">意见留言</h3></div><button class="community-refresh" id="threads-refresh" type="button">刷新</button></div><form id="thread-form"><label for="thread-body">你的想法</label><textarea id="thread-body" rows="3" maxlength="500" placeholder="想说点什么？玩法建议、吐槽都欢迎。" required></textarea><div class="community-form-foot"><span>最多 500 字，公开可见</span><button type="submit">发布留言 ↗</button></div></form><p class="community-status" id="threads-status" role="status"></p><div id="thread-list" class="thread-list"></div><button id="threads-more" class="community-more" type="button" hidden>加载更多留言</button></section><section class="community-panel" aria-labelledby="rank-title"><div class="community-panel-head"><div><span class="eyebrow">HIGH SCORE CLUB</span><h3 id="rank-title">游戏排行榜</h3></div><button class="community-refresh" id="rank-refresh" type="button">刷新</button></div><div id="rank-tabs" class="rank-tabs" role="group" aria-label="选择游戏"></div><p class="community-status" id="rank-status" role="status"></p><ol id="rank-list" class="rank-list"></ol><div id="my-rank" class="my-rank">玩完一局，就能看到自己的排名。</div><p class="rank-note">每位玩家每款游戏只记录最高分；并列分数同名次。</p></section></div>`;
$('#lobby .bottom-note').before(section);
const gameRank = el('section', 'game-rank');
gameRank.innerHTML = `<div><span class="eyebrow">YOUR PLACE</span><strong>本游戏排行榜</strong><p id="game-rank-summary">玩完一局，来看看自己的位置。</p></div><a href="#community">查看完整排行榜 ↗</a>`;
$('#game-screen .play-footer').before(gameRank);
const navLink = el('a', '', '留言板'); navLink.href = '#community'; $('#sound-toggle').before(navLink);
const nameInput = $('#frog-name');
try { nameInput.value = localStorage.getItem('sweetfrog-player-name') || ''; } catch {}
nameInput.addEventListener('change', async () => {
  playerName = nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 20); nameInput.value = playerName;
  try { localStorage.setItem('sweetfrog-player-name', playerName); } catch {}
  if (!db || !auth?.currentUser || !playerName) return;
  try {
    await Promise.all(Object.keys(games).map(async game => {
      const ref = firestore.doc(db, 'leaderboards', game, 'players', auth.currentUser.uid);
      if ((await firestore.getDoc(ref)).exists()) await firestore.updateDoc(ref, { name: playerName, updatedAt: firestore.serverTimestamp() });
    }));
    await loadRank();
  } catch (error) { status('#rank-status', errorMessage(error)); }
});
function name() { return nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 20); }
function status(selector, message) { $(selector).textContent = message; }
function errorMessage(error) { console.warn('Sweetfrog community:', error); return '暂时连接不上，请稍后重试。'; }
function timeLabel(timestamp) { const date = timestamp?.toDate?.(); return date ? new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(date) : '刚刚'; }
function button(text, onClick, className = '') { const control = el('button', className, text); control.type = 'button'; control.addEventListener('click', onClick); return control; }
function setReady(enabled) { for (const selector of ['#thread-form button', '#threads-refresh', '#rank-refresh']) $(selector).disabled = !enabled; }
setReady(false);

for (const [key, label] of Object.entries(games)) {
  const tab = button(label, () => { currentGame = key; updateTabs(); loadRank(); }, 'rank-tab');
  tab.dataset.game = key; $('#rank-tabs').append(tab);
}
function updateTabs() { document.querySelectorAll('.rank-tab').forEach(tab => { const selected = tab.dataset.game === currentGame; tab.classList.toggle('selected', selected); tab.setAttribute('aria-pressed', String(selected)); }); }
updateTabs();

async function loadRank() {
  if (!db) return;
  const selectedGame = currentGame;
  status('#rank-status', '正在读取排行榜…'); $('#rank-list').replaceChildren();
  try {
    const collection = firestore.collection(db, 'leaderboards', selectedGame, 'players');
    const [top, mine] = await Promise.all([
      firestore.getDocs(firestore.query(collection, firestore.orderBy('score', 'desc'), firestore.limit(20))),
      firestore.getDoc(firestore.doc(collection, auth.currentUser.uid))
    ]);
    if (selectedGame !== currentGame) return;
    let lastScore = null, place = 0, index = 0;
    for (const row of top.docs) {
      index++; const data = row.data(); if (data.score !== lastScore) place = index; lastScore = data.score;
      const item = el('li', row.id === auth.currentUser.uid ? 'is-me' : '');
      item.append(el('span', 'rank-place', String(place).padStart(2, '0')), el('span', 'rank-name', data.name || '青蛙玩家'), el('strong', 'rank-score', `${data.score} 分`));
      $('#rank-list').append(item);
    }
    status('#rank-status', top.empty ? '还没有成绩，来当第一个上榜的玩家！' : '');
    if (!mine.exists()) { $('#my-rank').textContent = '你还没有上榜，完成一局后自动记录成绩。'; return; }
    const own = mine.data();
    const ahead = await firestore.getCountFromServer(firestore.query(collection, firestore.where('score', '>', own.score)));
    if (selectedGame !== currentGame) return;
    const rankText = `你的排名：第 ${ahead.data().count + 1} 名 · ${own.score} 分`;
    $('#my-rank').textContent = rankText; $('#game-rank-summary').textContent = rankText;
  } catch (error) { status('#rank-status', errorMessage(error)); }
}
$('#rank-refresh').addEventListener('click', loadRank);

async function sendScore({ game, score }) {
  if (!db || !games[game] || !Number.isSafeInteger(score) || score < 0 || score > 10000000) return;
  try {
    const ref = firestore.doc(db, 'leaderboards', game, 'players', auth.currentUser.uid);
    await firestore.runTransaction(db, async tx => {
      const old = await tx.get(ref);
      if (!old.exists() || score > old.data().score) tx.set(ref, { name: name() || `青蛙玩家${auth.currentUser.uid.slice(0, 4)}`, score, updatedAt: firestore.serverTimestamp() });
    });
    if (currentGame === game) await loadRank();
  } catch (error) { status('#rank-status', errorMessage(error)); }
}
window.addEventListener('sweetfrog:finished', event => sendScore(event.detail));
window.addEventListener('hashchange', () => { const game = location.hash.slice(1); if (games[game]) { currentGame = game; updateTabs(); if (db) loadRank(); } });

function renderReply(data) {
  const item = el('div', 'reply-item'); const head = el('div', 'thread-meta');
  head.append(el('strong', '', data.name || '青蛙玩家'), el('time', '', timeLabel(data.createdAt)));
  item.append(head, el('p', '', data.body || '')); return item;
}
async function showReplies(threadId, area, trigger) {
  trigger.disabled = true; area.textContent = '正在加载回复…';
  try {
    const rows = await firestore.getDocs(firestore.query(firestore.collection(db, 'threads', threadId, 'replies'), firestore.orderBy('createdAt'), firestore.limit(50)));
    area.replaceChildren();
    if (rows.empty) area.append(el('p', 'community-status', '还没有回复，来聊第一句吧。'));
    for (const row of rows.docs) area.append(renderReply(row.data()));
    const form = el('form', 'reply-form'); const input = el('textarea');
    input.rows = 2; input.maxLength = 500; input.required = true; input.placeholder = '回复这条留言…'; input.setAttribute('aria-label', '回复内容');
    const send = el('button', '', '发送回复'); send.type = 'submit'; form.append(input, send);
    form.addEventListener('submit', async event => {
      event.preventDefault(); const body = input.value.trim(); if (!body || !db) return;
      send.disabled = true;
      try { await firestore.addDoc(firestore.collection(db, 'threads', threadId, 'replies'), { uid: auth.currentUser.uid, name: name() || `青蛙玩家${auth.currentUser.uid.slice(0, 4)}`, body, createdAt: firestore.serverTimestamp() }); input.value = ''; await showReplies(threadId, area, trigger); }
      catch (error) { area.prepend(el('p', 'community-status', errorMessage(error))); }
      finally { send.disabled = false; }
    });
    area.append(form); trigger.textContent = '收起回复'; trigger.disabled = false;
  } catch (error) { area.textContent = errorMessage(error); trigger.disabled = false; }
}
function renderThread(row) {
  const data = row.data(); const item = el('article', 'thread-item');
  const head = el('div', 'thread-meta'); head.append(el('strong', '', data.name || '青蛙玩家'), el('time', '', timeLabel(data.createdAt)));
  const area = el('div', 'reply-area'); area.hidden = true;
  const replyButton = button('查看 / 回复', () => { if (area.hidden) { area.hidden = false; showReplies(row.id, area, replyButton); } else { area.hidden = true; replyButton.textContent = '查看 / 回复'; } }, 'reply-toggle');
  item.append(head, el('p', '', data.body || ''), replyButton, area); return item;
}
async function loadThreads(reset = false) {
  if (!db || loadingThreads) return;
  loadingThreads = true; $('#threads-more').disabled = true;
  if (reset) { threadsCursor = null; $('#thread-list').replaceChildren(); }
  status('#threads-status', '正在读取留言…');
  try {
    const parts = [firestore.orderBy('createdAt', 'desc'), firestore.limit(15)];
    if (threadsCursor) parts.splice(1, 0, firestore.startAfter(threadsCursor));
    const rows = await firestore.getDocs(firestore.query(firestore.collection(db, 'threads'), ...parts));
    rows.docs.forEach(row => $('#thread-list').append(renderThread(row)));
    threadsCursor = rows.docs.at(-1) || null;
    $('#threads-more').hidden = rows.size < 15;
    status('#threads-status', $('#thread-list').children.length ? '' : '还没有留言，来留下第一句吧。');
  } catch (error) { status('#threads-status', errorMessage(error)); }
  finally { loadingThreads = false; $('#threads-more').disabled = false; }
}
$('#threads-refresh').addEventListener('click', () => loadThreads(true));
$('#threads-more').addEventListener('click', () => loadThreads(false));
$('#thread-form').addEventListener('submit', async event => {
  event.preventDefault(); const body = $('#thread-body').value.trim(); if (!body || !db) return;
  const submit = $('#thread-form button'); submit.disabled = true;
  try { await firestore.addDoc(firestore.collection(db, 'threads'), { uid: auth.currentUser.uid, name: name() || `青蛙玩家${auth.currentUser.uid.slice(0, 4)}`, body, createdAt: firestore.serverTimestamp() }); $('#thread-body').value = ''; await loadThreads(true); }
  catch (error) { status('#threads-status', errorMessage(error)); }
  finally { submit.disabled = false; }
});

if (!configured) {
  status('#frog-connection', '社区尚未连接云端，游戏仍可正常玩。');
  status('#threads-status', '留言功能等待站点管理员完成云端配置。');
  status('#rank-status', '排行榜等待站点管理员完成云端配置。');
} else {
  try {
    const [appModule, authModule, dbModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js')
    ]);
    firestore = dbModule;
    const app = appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app); db = dbModule.getFirestore(app);
    if (!auth.currentUser) await authModule.signInAnonymously(auth);
    setReady(true); status('#frog-connection', '游客身份已连接。昵称只用于展示，换设备会重新生成身份。');
    await Promise.all([loadThreads(true), loadRank()]);
  } catch (error) {
    db = null; status('#frog-connection', errorMessage(error));
    status('#threads-status', '留言暂时不可用。'); status('#rank-status', '排行榜暂时不可用。');
  }
}

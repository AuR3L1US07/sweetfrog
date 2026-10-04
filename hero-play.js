import { iconSvg } from './icons.js';
const frog = document.querySelector('#frog-tap');
const note = document.querySelector('#frog-note');
const sticker = document.querySelector('#frog-sticker');
const caption = document.querySelector('#frog-caption');
const pick = document.querySelector('#frog-pick');
const live = document.querySelector('#frog-live');
const burst = document.querySelector('#frog-burst');
const gamePicks = [
  ['tap', '逮住大青蛙'],
  ['merge', '合成大青蛙'],
  ['flap', '青蛙起飞'],
  ['puzzle', '青蛙2048'],
  ['aim', '青蛙定位练习']
];
const reactions = ['再点一下！', '有点手感了', '青蛙快招了', '最后一下！'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let taps = 0;
let lastPick = -1;
let animationTimer;

function showBurst() {
  if (reduceMotion.matches) return;
  burst.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const spark = document.createElement('span');
    spark.innerHTML = iconSvg(i % 2 ? 'stars' : 'sparkle');
    spark.style.setProperty('--angle', `${i * (360 / 7)}deg`);
    spark.style.setProperty('--distance', `${76 + (i % 3) * 21}px`);
    burst.append(spark);
  }
  burst.classList.remove('active');
  void burst.offsetWidth;
  burst.classList.add('active');
}

frog?.addEventListener('click', () => {
  if (taps === 5) {
    taps = 0;
    pick.hidden = true;
  }
  taps++;
  frog.classList.remove('hopping');
  void frog.offsetWidth;
  if (!reduceMotion.matches) frog.classList.add('hopping');
  clearTimeout(animationTimer);
  animationTimer = setTimeout(() => frog.classList.remove('hopping'), 500);
  showBurst();
  window.dispatchEvent(new CustomEvent('sweetfrog:mascot-tap', { detail: { taps } }));

  if (taps < 5) {
    note.textContent = reactions[taps - 1];
    sticker.replaceChildren(document.createTextNode(`${taps}/5`));
    const small = document.createElement('small');
    small.textContent = '抽游戏中';
    sticker.append(small);
    caption.textContent = '再点青蛙，看看今天玩什么';
    live.textContent = `已点青蛙 ${taps} 次，还差 ${5 - taps} 次抽出游戏`;
    return;
  }

  let index = Math.floor(Math.random() * gamePicks.length);
  if (index === lastPick) index = (index + 1) % gamePicks.length;
  lastPick = index;
  const [game, title] = gamePicks[index];
  note.textContent = '今日幸运游戏';
  sticker.replaceChildren(document.createTextNode('5/5'));
  const small = document.createElement('small');
  small.textContent = '已解锁';
  sticker.append(small);
  caption.textContent = '再点青蛙，可以重新抽一款';
  pick.href = `#${game}`;
  pick.textContent = `玩「${title}」 ↗`;
  pick.hidden = false;
  live.textContent = `抽中了${title}。点击玩游戏，或再点青蛙重新抽取。`;
});

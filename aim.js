import { insideTarget, hitPoints, summarizeAim, nextPosition } from './aim-core.js';

export function createAimGame({ stage, tileCanvas, canPlay, setScore, extra, beep, finish }) {
  const mode = document.querySelector('#aim-mode').value;
  const difficulty = document.querySelector('#aim-difficulty').value;
  const duration = Number(document.querySelector('#aim-duration').value);
  const settings = { easy: { r: 34, speed: 85 }, normal: { r: 25, speed: 125 }, hard: { r: 17, speed: 175 } }[difficulty];
  let remaining = duration, countdown = 3, elapsed = 0, hits = 0, shots = 0;
  let points = 0, combo = 0, bestCombo = 0, totalReaction = 0, spawned = 0, target = null, photo = 0, effects = [];
  const field = document.createElement('div'); field.className = 'aim-field';
  const targetButton = document.createElement('button'); targetButton.type = 'button'; targetButton.className = 'aim-target'; targetButton.tabIndex = -1; targetButton.setAttribute('aria-label', '照片圆靶'); targetButton.hidden = true;
  const marker = document.createElement('span'); marker.className = 'aim-countdown'; marker.textContent = '3';
  const watermark = document.createElement('span'); watermark.className = 'aim-watermark'; watermark.textContent = 'SWEETFROG / AIM STUDIO';
  field.append(watermark, targetButton, marker); stage.replaceChildren(field);
  const controls = document.querySelectorAll('#aim-options select'); controls.forEach(e => e.disabled = true);
  const stat = (id, value) => { document.querySelector(id).textContent = value; };
  function metrics() { const m = summarizeAim(hits, shots, totalReaction, bestCombo); stat('#aim-accuracy', m.accuracy + '%'); stat('#aim-reaction', m.reaction === null ? '—' : m.reaction + ' ms'); stat('#aim-combo', combo); stat('#aim-hits', hits + ' / ' + shots); }
  function position() { if (!target) return; targetButton.style.transform = `translate(${target.x - target.r}px, ${target.y - target.r}px)`; }
  function spawn() {
    const { width, height } = field.getBoundingClientRect();
    const next = nextPosition(width, height, settings.r, target);
    const angle = Math.random() * Math.PI * 2;
    target = { ...next, r: settings.r, vx: Math.cos(angle) * settings.speed, vy: Math.sin(angle) * settings.speed };
    spawned = elapsed;
    targetButton.style.width = targetButton.style.height = target.r * 2 + 'px';
    targetButton.replaceChildren(tileCanvas(photo++ % 5)); targetButton.hidden = false; position();
  }
  function effect(x, y, success, label) {
    const element = document.createElement('span'); element.className = 'aim-feedback ' + (success ? 'hit' : 'miss'); element.style.left = x + 'px'; element.style.top = y + 'px'; element.textContent = label; field.append(element); effects.push({ element, life: .48 });
  }
  field.addEventListener('pointerdown', event => {
    if (!canPlay() || countdown > 0 || !target || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); const rect = field.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top;
    shots++;
    if (insideTarget(x, y, target)) {
      const reaction = elapsed - spawned; hits++; combo++; bestCombo = Math.max(bestCombo, combo); totalReaction += reaction;
      const earned = hitPoints(reaction); points += earned; setScore(points); effect(target.x, target.y, true, '+' + earned); beep(640 + Math.min(combo, 10) * 25, .04); spawn();
    } else { combo = 0; effect(x, y, false, '×'); beep(170, .05); }
    metrics();
  });
  const resize = new ResizeObserver(() => {
    if (!target) return; const pad = target.r + 16;
    target.x = Math.max(pad, Math.min(field.clientWidth - pad, target.x)); target.y = Math.max(pad, Math.min(field.clientHeight - pad, target.y)); position();
  }); resize.observe(field);
  metrics(); extra(duration + ' 秒');
  return {
    update(dt) {
      for (const item of effects) { item.life -= dt; if (item.life <= 0) item.element.remove(); }
      effects = effects.filter(item => item.life > 0);
      if (countdown > 0) { countdown -= dt; marker.textContent = Math.max(1, Math.ceil(countdown)); if (countdown <= 0) { marker.hidden = true; spawn(); beep(880, .1); } return; }
      const step = Math.min(dt, remaining); elapsed += step; remaining = Math.max(0, remaining - step); extra(Math.ceil(remaining) + ' 秒');
      if (mode === 'moving' && target) {
        const pad = target.r + 16; target.x += target.vx * step; target.y += target.vy * step;
        if (target.x < pad || target.x > field.clientWidth - pad) { target.vx *= -1; target.x = Math.max(pad, Math.min(field.clientWidth - pad, target.x)); }
        if (target.y < pad || target.y > field.clientHeight - pad) { target.vy *= -1; target.y = Math.max(pad, Math.min(field.clientHeight - pad, target.y)); }
        position();
      }
      if (remaining <= 0) {
        const summary = summarizeAim(hits, shots, totalReaction, bestCombo);
        targetButton.hidden = true; controls.forEach(e => e.disabled = false);
        const label = mode === 'moving' ? '移动追点' : '静态定位';
        const reaction = summary.reaction === null ? '—' : summary.reaction + ' ms';
        finish('训练完成，手感上线', `${label} · ${duration} 秒\n命中 ${hits} / ${shots} · 命中率 ${summary.accuracy}%\n平均用时 ${reaction} · 最佳连中 ${bestCombo}`);
      }
    },
    destroy() { resize.disconnect(); controls.forEach(e => e.disabled = false); effects.forEach(item => item.element.remove()); }
  };
}

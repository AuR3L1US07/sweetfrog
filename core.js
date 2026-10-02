// Original game logic for Sweetfrog. No third-party game code or artwork bundled.
export function slideBoard(board, direction) {
  const result = board.slice(); let gained = 0;
  for (let line = 0; line < 4; line++) {
    const ids = Array.from({ length: 4 }, (_, p) => direction === 'left' ? line * 4 + p : direction === 'right' ? line * 4 + 3 - p : direction === 'up' ? p * 4 + line : (3 - p) * 4 + line);
    const values = ids.map(i => board[i]).filter(Boolean), merged = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) { const v = values[i] * 2; merged.push(v); gained += v; i++; }
      else merged.push(values[i]);
    }
    ids.forEach((id, i) => { result[id] = merged[i] || 0; });
  }
  return { board: result, gained, changed: result.some((v, i) => v !== board[i]) };
}
export function canMove(board) { return ['left', 'right', 'up', 'down'].some(dir => slideBoard(board, dir).changed); }
export const RADII = [17, 23, 30, 39, 50, 62, 76, 92];
export function physicsStep(balls, dt, width = 420, floor = 492) {
  let gained = 0, largest = -1;
  for (const b of balls) {
    b.age += dt; b.vy += 760 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= .993;
  }
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]; let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy), total = a.r + b.r;
        if (d >= total) continue;
        if (a.level === b.level && a.level < RADII.length - 1) {
          const level = a.level + 1;
          const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: (a.vx + b.vx) / 2, vy: Math.min(0, (a.vy + b.vy) / 2), r: RADII[level], level, age: 0 };
          balls.splice(j, 1); balls.splice(i, 1, c); gained += 2 ** (level + 1); largest = Math.max(largest, level);
          // Restart collision passes on the next step after changing identity.
          return { gained, largest };
        }
        if (d < .001) { dx = .01; dy = -.01; d = Math.hypot(dx, dy); }
        const nx = dx / d, ny = dy / d, overlap = total - d;
        const ma = a.r * a.r, mb = b.r * b.r, weightA = mb / (ma + mb), weightB = ma / (ma + mb);
        a.x -= nx * overlap * weightA; a.y -= ny * overlap * weightA;
        b.x += nx * overlap * weightB; b.y += ny * overlap * weightB;
        const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relative < 0) {
          const impulse = -1.12 * relative;
          a.vx -= impulse * nx * weightA; a.vy -= impulse * ny * weightA;
          b.vx += impulse * nx * weightB; b.vy += impulse * ny * weightB;
        }
      }
    }
    for (const b of balls) {
      if (b.x < b.r + 7) { b.x = b.r + 7; b.vx = Math.abs(b.vx) * .2; }
      if (b.x > width - b.r - 7) { b.x = width - b.r - 7; b.vx = -Math.abs(b.vx) * .2; }
      if (b.y > floor - b.r) { b.y = floor - b.r; b.vy = Math.abs(b.vy) < 30 ? 0 : -Math.abs(b.vy) * .15; b.vx *= .92; }
    }
  }
  return { gained, largest };
}

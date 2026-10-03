export function insideTarget(x, y, target) {
  return Math.hypot(x - target.x, y - target.y) <= target.r;
}
export function hitPoints(seconds) {
  return 100 + Math.round(Math.max(0, 1 - seconds / 1.5) * 100);
}
export function summarizeAim(hits, shots, totalReaction, bestCombo) {
  return { accuracy: shots ? Math.round(hits / shots * 100) : 0, reaction: hits ? Math.round(totalReaction / hits * 1000) : null, hits, shots, bestCombo };
}
export function nextPosition(width, height, radius, previous, random = Math.random) {
  const pad = radius + 16;
  const usableX = Math.max(0, width - pad * 2), usableY = Math.max(0, height - pad * 2);
  let result;
  for (let i = 0; i < 30; i++) {
    result = { x: pad + random() * usableX, y: pad + random() * usableY };
    if (!previous || Math.hypot(result.x - previous.x, result.y - previous.y) > Math.min(width, height) * .3) break;
  }
  return result;
}

export const PK_DURATION_MS = 30000;

export function pkColumn(seed, index) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b9)) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) % 4;
}

export function pkRows(seed, score) {
  const rows = Array.from({ length: 5 }, (_, index) => pkColumn(seed, index));
  for (let index = 0; index < score; index++) {
    rows.pop();
    rows.unshift(pkColumn(seed, index + 5));
  }
  return rows;
}

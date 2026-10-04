import test from 'node:test';
import assert from 'node:assert/strict';
import { pkColumn, pkRows, pkValidBatch } from '../pk-core.js';

test('both players receive the same deterministic board at each score', () => {
  const seed = 123456789;
  const initial = pkRows(seed, 0);
  assert.equal(initial.length, 5);
  for (let score = 1; score <= 25; score++) {
    const previous = pkRows(seed, score - 1);
    const current = pkRows(seed, score);
    assert.deepEqual(current.slice(1), previous.slice(0, 4));
    assert.equal(current[0], pkColumn(seed, score + 4));
    assert.deepEqual(pkRows(seed, score), current);
  }
});

test('a rapid batch verifies each consecutive target and rejects an incorrect middle hit', () => {
  const seed = 123456789;
  const columns = Array.from({ length: 24 }, (_, index) => pkRows(seed, index)[4]);
  assert.equal(pkValidBatch(seed, 0, columns), true);
  columns[12] = (columns[12] + 1) % 4;
  assert.equal(pkValidBatch(seed, 0, columns), false);
});

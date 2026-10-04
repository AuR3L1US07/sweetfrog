import test from 'node:test';
import assert from 'node:assert/strict';
import { beijingTime } from '../beijing-time.js';

test('database UTC timestamps display in Beijing time across midnight',()=>{
  assert.match(beijingTime('2026-10-03 16:30:00','full'),/2026.10.04.*00:30/);
  assert.match(beijingTime(1791066600000,'clock'),/^\d{2}:\d{2}$/);
});

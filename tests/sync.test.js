import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSync } from '../assets/js/syncLogic.js';

test('no cloud copy -> push', () => {
  assert.equal(decideSync(100, undefined, 0), 'push');
  assert.equal(decideSync(100, null, 50), 'push');
});

test('identical timestamps -> nothing to do', () => {
  assert.equal(decideSync(100, 100, 100), 'none');
});

test('first sync with different data on both sides -> conflict', () => {
  assert.equal(decideSync(100, 200, 0), 'conflict');
  assert.equal(decideSync(300, 200, 0), 'conflict');
});

test('only local changed since last sync -> push', () => {
  assert.equal(decideSync(300, 200, 200), 'push');
});

test('only cloud changed since last sync -> pull', () => {
  assert.equal(decideSync(200, 300, 200), 'pull');
});

test('both changed since last sync -> conflict', () => {
  assert.equal(decideSync(250, 300, 200), 'conflict');
});

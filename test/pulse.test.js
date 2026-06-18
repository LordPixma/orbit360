import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePulse, pearson, findDivergences } from '../src/pulse.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('pearson: returns null with fewer than 5 paired points', () => {
  assert.equal(pearson([1, 2, 3, 4], [1, 2, 3, 4]), null);
});

test('pearson: +1 for identical series, -1 for mirrored series', () => {
  close(pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]), 1);
  close(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
});

test('pearson: +1 for a positive linear relationship', () => {
  close(pearson([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12]), 1);
});

test('pearson: null when a series is constant (zero variance)', () => {
  assert.equal(pearson([1, 1, 1, 1, 1], [1, 2, 3, 4, 5]), null);
});

test('computePulse: no inputs -> null score, unknown status', () => {
  const p = computePulse({});
  assert.equal(p.score, null);
  assert.equal(p.status, 'unknown');
  assert.deepEqual(p.components, {});
});

test('computePulse: single signal maps straight through to 0..100', () => {
  assert.equal(computePulse({ breadth: 1 }).score, 100);
  assert.equal(computePulse({ breadth: 0 }).score, 0);
  assert.equal(computePulse({ breadth: 0.5 }).score, 50);
});

test('computePulse: status bands (>=70 nominal, 40-69 caution, <40 critical)', () => {
  assert.equal(computePulse({ breadth: 1 }).status, 'nominal');
  assert.equal(computePulse({ breadth: 0.5 }).status, 'caution');
  assert.equal(computePulse({ breadth: 0 }).status, 'critical');
});

test('computePulse: regulatory neutral (0.5) when nothing is moving', () => {
  assert.equal(computePulse({ regulatory: { pos: 0, neg: 0 } }).score, 50);
  assert.equal(computePulse({ regulatory: { pos: 2, neg: 0 } }).score, 100);
  assert.equal(computePulse({ regulatory: { pos: 0, neg: 2 } }).score, 0);
});

test('computePulse: constellation delta normalises around a launch of birds', () => {
  assert.equal(computePulse({ constellation: { delta: 50 } }).score, 100);
  assert.equal(computePulse({ constellation: { delta: -10 } }).score, 0);
  assert.equal(computePulse({ constellation: { delta: 20 } }).score, 50);
});

test('computePulse: weights renormalise over the signals actually present', () => {
  // ecosystem(value 1, w .20) + contracts(value 0, w .15) -> .20 / .35 = 57
  const p = computePulse({ breadth: 1, contracts: { last30: 0 } });
  assert.equal(p.score, 57);
  assert.equal(p.status, 'caution');
  assert.deepEqual(Object.keys(p.components).sort(), ['contracts', 'ecosystem']);
});

test('findDivergences: empty when SPCX move is unknown', () => {
  assert.deepEqual(findDivergences(null, { A: 5 }, { A: 0.9 }), []);
});

test('findDivergences: flags correlated names that broke ranks today', () => {
  const out = findDivergences(
    2, // SPCX up
    { A: -3, B: 1, C: -3, D: 2, E: 1, F: 5 },
    { A: 0.6, B: 0.6, C: -0.6, D: -0.6, E: 0.3, F: null }
  );
  // A: +corr but moved down -> diverge. D: -corr but moved up -> diverge.
  // B tracks, C tracks (inverse), E below |0.5| threshold, F has no correlation.
  assert.deepEqual(out.map(o => o.symbol).sort(), ['A', 'D']);
  const a = out.find(o => o.symbol === 'A');
  assert.deepEqual(a, { symbol: 'A', corr: 0.6, move: -3, expected: 1 });
});

test('findDivergences: a flat move (0%) is never a divergence', () => {
  assert.deepEqual(findDivergences(2, { A: 0 }, { A: 0.9 }), []);
});

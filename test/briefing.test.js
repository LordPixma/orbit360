import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestOf, diffDigests } from '../src/briefing.js';

const SNAP = {
  day: '2026-06-18',
  quotes: { SPCX: { price: 172.4, changePct: 27.7, marketCap: 2030000 } },
  pulse: { score: 76, status: 'nominal' },
  launchOps: {
    ytd: 91,
    daysSinceLast: 2,
    lastLaunch: { net: '2026-06-16T00:00:00Z', name: 'Starlink Group 12-5' },
    nextLaunch: { name: 'Starlink Group 11-7' },
  },
  constellation: { count: 8912 },
  contracts: { last30: 2, awards: [{ id: 's1', amount: 733000000 }] },
  regulatory: { counts: { pos: 3, neg: 1 } },
  breadth: 0.69,
  supplyChain: { counts: { shift: 4, risk: 1 } },
};

test('digestOf: flattens a snapshot into the metrics the briefing diffs', () => {
  const d = digestOf(SNAP);
  assert.equal(d.date, '2026-06-18');
  assert.equal(d.spcx, 172.4);
  assert.equal(d.pulse, 76);
  assert.equal(d.pulseStatus, 'nominal');
  assert.equal(d.ytd, 91);
  assert.equal(d.sats, 8912);
  assert.equal(d.contracts30, 2);
  assert.equal(d.topAwardId, 's1');
  assert.equal(d.topAwardAmount, 733000000);
  assert.equal(d.regPos, 3);
  assert.equal(d.regNeg, 1);
  assert.equal(d.scShift, 4);
  assert.equal(d.scRisk, 1);
});

test('digestOf: missing sections degrade to null rather than throwing', () => {
  const d = digestOf({ day: '2026-01-01' });
  assert.equal(d.date, '2026-01-01');
  assert.equal(d.spcx, null);
  assert.equal(d.sats, null);
  assert.equal(d.topAwardId, null);
});

const base = {
  date: '2026-06-15', spcx: 100, spcxPct: 0, cap: 1,
  pulse: 50, pulseStatus: 'caution',
  ytd: 50, daysSinceLast: 1, lastLaunchNet: 'x', lastLaunchName: 'L', nextLaunchName: 'N',
  sats: 8000, contracts30: 1, topAwardId: 'a', topAwardAmount: 1,
  regPos: 1, regNeg: 0, breadth: 0.5, scShift: 0, scRisk: 0,
};

test('diffDigests: first day with no prior digest emits a baseline note', () => {
  const items = diffDigests(digestOf(SNAP), null);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Baseline');
  assert.equal(items[0].tone, 'info');
});

test('diffDigests: a quiet day reports no material change', () => {
  const items = diffDigests({ ...base, date: '2026-06-18' }, base);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Quiet');
  assert.equal(items[0].tone, 'flat');
});

test('diffDigests: an SPCX move is surfaced with the right tone', () => {
  const items = diffDigests({ ...base, date: '2026-06-18', spcx: 110 }, base);
  const spcx = items.find(i => i.label === 'SPCX');
  assert.ok(spcx);
  assert.equal(spcx.tone, 'up');
});

test('diffDigests: overnight satellite growth is reported', () => {
  const items = diffDigests({ ...base, date: '2026-06-18', sats: 8050 }, base);
  const c = items.find(i => i.label === 'Constellation');
  assert.ok(c);
  assert.equal(c.tone, 'up');
  assert.match(c.text, /\+50/);
});

test('diffDigests: a Pulse band change is called out', () => {
  const items = diffDigests(
    { ...base, date: '2026-06-18', pulse: 38, pulseStatus: 'critical' },
    base
  );
  const pulse = items.find(i => i.label === 'Pulse');
  assert.ok(pulse);
  assert.equal(pulse.tone, 'down');
  assert.match(pulse.text, /CRITICAL/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/finnhub.js';

test('classify: tags a headline by the driver that dominates price', () => {
  assert.equal(classify('Falcon 9 lofts 23 Starlink satellites'), 'launch');
  assert.equal(classify('Space Force awards SpaceX NSSL task order'), 'contract');
  assert.equal(classify('Starlink direct-to-cell crosses 5M devices'), 'starlink');
  assert.equal(classify('xAI expands Memphis compute cluster with GPUs'), 'ai');
  assert.equal(classify('FCC opens a new rulemaking docket'), 'regulatory');
  assert.equal(classify('SpaceX secondary prices shares, lifting valuation'), 'market');
});

test('classify: precedence is fixed-order, first match wins', () => {
  // "falcon" (launch) is checked before "starlink"
  assert.equal(classify('Falcon 9 carries a Starlink batch'), 'launch');
  // "starlink" is checked before "regulatory", so an FCC+Starlink headline
  // tags as starlink — a known, intentional consequence of the ordering
  assert.equal(classify('FCC clears next-gen Starlink orbital shell'), 'starlink');
});

test('classify: unrecognised text falls back to general', () => {
  assert.equal(classify('Company announces new office opening'), 'general');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapQuote } from '../src/twelvedata.js';

test('mapQuote: maps a healthy Twelve Data quote into the internal shape', () => {
  const q = mapQuote(
    {
      close: '10.50', change: '0.50', percent_change: '5.00',
      high: '11', low: '9', open: '10', previous_close: '10', currency: 'GBP',
    },
    { approxCapUSD: 650 }
  );
  assert.deepEqual(q, {
    ok: true,
    price: 10.5,
    change: 0.5,
    changePct: 5,
    high: 11,
    low: 9,
    open: 10,
    prevClose: 10,
    marketCap: 650, // from the ticker config, since /quote carries no cap
    currency: 'GBP',
  });
});

test('mapQuote: null / error / coded responses degrade to a pending placeholder', () => {
  assert.deepEqual(mapQuote(null, {}), {
    ok: false, pending: 'global-feed', error: 'no data returned',
  });
  assert.deepEqual(mapQuote({ status: 'error', message: 'symbol not found' }, {}), {
    ok: false, pending: 'global-feed', error: 'symbol not found',
  });
  assert.equal(mapQuote({ code: 404, message: 'nope' }, {}).ok, false);
});

test('mapQuote: blank numeric fields become null, not NaN', () => {
  const q = mapQuote({ close: '', change: '0.1', percent_change: '' }, {});
  assert.equal(q.price, null);
  assert.equal(q.changePct, null);
  assert.equal(q.change, 0.1);
  assert.equal(q.marketCap, null); // no approxCapUSD on the ticker
});

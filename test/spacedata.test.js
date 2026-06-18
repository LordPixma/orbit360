import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortProvider } from '../src/spacedata.js';

test('shortProvider: maps known full legal names to readable acronyms', () => {
  assert.equal(shortProvider('United Launch Alliance'), 'ULA');
  assert.equal(
    shortProvider('China Aerospace Science and Technology Corporation'),
    'CASC'
  );
  assert.equal(shortProvider('Indian Space Research Organisation'), 'ISRO');
});

test('shortProvider: falls back to a trailing parenthesised acronym', () => {
  assert.equal(shortProvider('Some New Agency (SNA)'), 'SNA');
});

test('shortProvider: leaves already-short or unknown names untouched', () => {
  assert.equal(shortProvider('SpaceX'), 'SpaceX');
  assert.equal(shortProvider(null), null);
});

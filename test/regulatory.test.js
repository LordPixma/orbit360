import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDirection, detectCountry } from '../src/regulatory.js';

test('detectDirection: approval-side language reads positive', () => {
  assert.equal(detectDirection('FCC approves Starlink modification'), 'positive');
  assert.equal(detectDirection('Regulator grants Starlink a licence'), 'positive');
  assert.equal(detectDirection('Starlink wins spectrum auction'), 'positive');
});

test('detectDirection: restriction-side language reads negative', () => {
  assert.equal(detectDirection('Country bans Starlink terminals'), 'negative');
  assert.equal(detectDirection('Regulator suspends service and seizes kit'), 'negative');
});

test('detectDirection: a lifted ban flips back to positive', () => {
  // the ban/suspension word must precede the reversal verb (checked before the
  // negative pass), so these read positive
  assert.equal(detectDirection('Court lifts ban on Starlink'), 'positive');
  assert.equal(detectDirection('Suspension lifted, Starlink service resumes'), 'positive');
});

test('detectDirection: procedural news stays neutral', () => {
  assert.equal(detectDirection('EU member states debate spectrum coordination'), 'neutral');
});

test('detectCountry: recognises regulators before bare country names', () => {
  assert.equal(detectCountry('FCC opens a new docket'), 'United States');
  assert.equal(detectCountry('Ofcom updates its licence terms'), 'United Kingdom');
  assert.equal(detectCountry('ICASA opens a consultation'), 'South Africa');
  assert.equal(detectCountry('Anatel clears the service'), 'Brazil');
});

test('detectCountry: null when no geography is present', () => {
  assert.equal(detectCountry('A generic headline with no place'), null);
});

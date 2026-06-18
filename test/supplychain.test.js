import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind, detectPlaces } from '../src/supplychain.js';

test('detectKind: relocation / new-capacity language is a shift', () => {
  assert.equal(detectKind('Wistron expands its Vietnam plant capacity'), 'shift');
  assert.equal(detectKind('SpaceX asks suppliers to add capacity outside Taiwan'), 'shift');
});

test('detectKind: disruption / concentration language is a risk', () => {
  assert.equal(detectKind('Taiwan Strait tension raises concentration risk'), 'risk');
  assert.equal(detectKind('Earthquake disrupts component shortage fears'), 'risk');
});

test('detectKind: anything else is a procedural note', () => {
  assert.equal(detectKind('Supplier confirms an unrelated procedural filing'), 'note');
});

test('detectPlaces: Taiwan is always treated as the origin when present', () => {
  assert.deepEqual(
    detectPlaces('Wistron moves terminal output from Taiwan to Vietnam'),
    { from: 'Taiwan', to: 'Vietnam' }
  );
});

test('detectPlaces: a single destination resolves with a null origin', () => {
  assert.deepEqual(detectPlaces('Thailand courts space-hardware factories'), {
    from: null,
    to: 'Thailand',
  });
});

test('detectPlaces: no recognised geography -> both null', () => {
  assert.deepEqual(detectPlaces('A supplier update with no place named'), {
    from: null,
    to: null,
  });
});

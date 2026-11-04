const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../firestore.indexes.json'), 'utf8'));
const field = manifest.fieldOverrides.find(item => item.collectionGroup === 'attendees' && item.fieldPath === 'memberId');
test('session-scoped member lookups used by unregister and QR duplicate detection remain indexed', () => {
  assert.ok(field, 'attendees.memberId override is required for historical attendance');
  assert.ok(field.indexes.some(index => index.queryScope === 'COLLECTION' && index.order === 'ASCENDING'),
    'A COLLECTION_GROUP override alone disables the COLLECTION_ASC index required by session attendee queries');
});
test('cross-session attendance history keeps its existing collection-group index', () => {
  assert.ok(field.indexes.some(index => index.queryScope === 'COLLECTION_GROUP' && index.order === 'ASCENDING'));
});

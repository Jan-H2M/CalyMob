'use strict';
const { buildEventSettingsHistory } = require('./eventSettingsHistory');
const ctx = { eventId: 'delivery-1', eventTime: '2026-11-07T12:00:00Z', authType: 'user', authId: 'member-id' };

test('records actual old and new payment and tariff values with actor context', () => {
  const before = { type: 'evenement', payment_required: false, event_tariffs: [{ id: 'member', price: 15 }] };
  const after = { ...before, payment_required: true, event_tariffs: [{ id: 'member', price: 18 }] };
  const entry = buildEventSettingsHistory(before, after, ctx);
  expect(entry.actor_id).toBe('member-id');
  expect(entry.changes).toEqual(expect.arrayContaining([
    { field: 'payment_required', old_present: true, new_present: true, old_value: false, new_value: true },
    { field: 'event_tariffs', old_present: true, new_present: true, old_value: before.event_tariffs, new_value: after.event_tariffs },
  ]));
});

test('distinguishes a removed field from an explicit null', () => {
  const entry = buildEventSettingsHistory({ type: 'evenement', date_fin: null }, { type: 'evenement' }, ctx);
  expect(entry.changes).toEqual([{ field: 'date_fin', old_present: true, new_present: false, old_value: null, new_value: null }]);
});

test('ignores non-settings changes and non-events', () => {
  expect(buildEventSettingsHistory({ type: 'evenement', updated_at: 1 }, { type: 'evenement', updated_at: 2 }, ctx)).toBeNull();
  expect(buildEventSettingsHistory({ type: 'vente', titre: 'A' }, { type: 'vente', titre: 'B' }, ctx)).toBeNull();
});

test('marks oversized values explicitly instead of exceeding the audit document limit', () => {
  const entry = buildEventSettingsHistory({ type: 'evenement', description: 'x'.repeat(9000) }, { type: 'evenement', description: 'new' }, ctx);
  expect(entry.changes[0].old_value).toBeNull();
  expect(entry.changes[0].old_truncated_sha256).toMatch(/^[a-f0-9]{64}$/);
});

test('document history excludes access URLs and tokens', () => {
  const entry = buildEventSettingsHistory(
    { type: 'evenement', info_document: { name: 'old.pdf', url: 'https://example.invalid/?token=secret' } },
    { type: 'evenement', info_document: { name: 'new.pdf', url: 'https://example.invalid/?token=secret2' } }, ctx);
  expect(entry.changes[0].old_value).toEqual({ name: 'old.pdf' });
  expect(JSON.stringify(entry)).not.toContain('token=');
});

test('legacy document URLs stored directly as strings are not recorded', () => {
  const entry = buildEventSettingsHistory(
    { type: 'evenement', info_document: 'https://example.invalid/?token=secret' },
    { type: 'evenement', info_document: 'https://example.invalid/?token=new' }, ctx);
  expect(entry.changes[0].old_value).toEqual('[document]');
  expect(JSON.stringify(entry)).not.toContain('token=');
});

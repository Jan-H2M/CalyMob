const fs = require('fs');
const path = require('path');
const { getCanonicalUnreadBreakdown, isUnreadEligibleEvent, isCountableRegistration, readStateSessionScopeId } = require('./canonicalUnreadBadge');
const { fromFixture, MemoryTimestamp, MemoryFirestore } = require('../../test-utils/memoryFirestore');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../test/fixtures/unread_contract_v1.json')));
const ts = (iso) => new MemoryTimestamp(iso);
const cursor = ts('2026-03-01T00:00:00Z');
const now = new Date('2026-04-05T10:00:00Z');
function dbWith(extra = {}, { roles = [], announcementCursor = true } = {}) {
  const docs = {
    'clubs/c/members/m': { clubStatuten: roles },
    'clubs/c/members/m/read_state/events': { global_last_seen_at: cursor },
    'clubs/c/members/m/read_state/teams': { global_last_seen_at: cursor },
    'clubs/c/members/m/read_state/sessions': { global_last_seen_at: cursor },
    ...extra,
  };
  if (announcementCursor) docs['clubs/c/members/m/read_state/announcements'] = { last_seen_at: cursor };
  return new MemoryFirestore(docs);
}
async function count(extra, options) { return getCanonicalUnreadBreakdown({ db: dbWith(extra, options), clubId: 'c', memberId: 'm', now }); }

describe('canonical unread contract v1', () => {
  test('computes every shared Dart fixture case from actual seeded documents', async () => {
    for (const item of fixture.cases) {
      const db = fromFixture(fixture.documents);
      const actual = await getCanonicalUnreadBreakdown({ db, clubId: fixture.clubId, memberId: item.memberId, now: new Date(fixture.now) });
      expect(actual).toEqual(item.expected);
    }
  });

  test('uses seven Brussels calendar days across the DST boundary', () => {
    expect(isUnreadEligibleEvent({ date_fin: new MemoryTimestamp('2026-03-29T10:00:00Z') }, new Date('2026-04-05T10:00:00Z'))).toBe(true);
    expect(isUnreadEligibleEvent({ date_fin: new MemoryTimestamp('2026-03-29T10:00:00Z') }, new Date('2026-04-05T10:00:01Z'))).toBe(false);
  });

  test('has identical registration and deterministic session-scope predicates', () => {
    expect(isCountableRegistration({ registration_status: 'confirmed' })).toBe(true);
    ['canceled', 'waitlisted', 'withdrawn'].forEach((status) => expect(isCountableRegistration({ registration_status: status })).toBe(false));
    expect(readStateSessionScopeId('s', 'niveau', 'P2')).toBe('s__niveau__P2');
  });
});

describe('document-level canonical unread matrix', () => {
  test('published announcement after cursor counts once', async () => expect((await count({ 'clubs/c/announcements/a': { visibility: 'published', last_activity_at: ts('2026-03-02T00:00:00Z') } })).announcements).toBe(1));
  test('announcement before cursor does not count', async () => expect((await count({ 'clubs/c/announcements/a': { visibility: 'published', last_activity_at: ts('2026-02-28T00:00:00Z') } })).announcements).toBe(0));
  test('soft-deleted announcement does not count', async () => expect((await count({ 'clubs/c/announcements/a': { visibility: 'deleted', deleted_at: ts('2026-03-02T00:00:00Z'), last_activity_at: ts('2026-03-02T00:00:00Z') } })).announcements).toBe(0));
  test('legacy visible counts while legacy deleted does not', async () => expect((await count({ 'clubs/c/announcements/a': { created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/announcements/b': { created_at: ts('2026-03-02T00:00:00Z'), deleted_at: ts('2026-03-03T00:00:00Z') } })).announcements).toBe(1));
  test('missing announcement cursor has no epoch flood', async () => expect((await count({ 'clubs/c/announcements/a': { visibility: 'published', last_activity_at: ts('2026-03-02T00:00:00Z') } }, { announcementCursor: false })).announcements).toBe(0));
  test('eligible event within seven Brussels days counts messages', async () => expect((await count({ 'clubs/c/operations/o': { date_fin: ts('2026-03-29T10:00:00Z') }, 'clubs/c/operations/o/inscriptions/i': { membre_id: 'm', registration_status: 'confirmed' }, 'clubs/c/operations/o/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } })).events).toBe(1));
  test('expired, canceled, and waitlisted event registrations do not count', async () => expect((await count({ 'clubs/c/operations/old': { date_fin: ts('2026-03-28T10:00:00Z') }, 'clubs/c/operations/old/inscriptions/a': { membre_id: 'm', registration_status: 'confirmed' }, 'clubs/c/operations/cancel': { date_fin: ts('2026-04-05T10:00:00Z') }, 'clubs/c/operations/cancel/inscriptions/a': { membre_id: 'm', registration_status: 'canceled' }, 'clubs/c/operations/wait': { date_fin: ts('2026-04-05T10:00:00Z') }, 'clubs/c/operations/wait/inscriptions/a': { membre_id: 'm', registration_status: 'waitlisted' }, 'clubs/c/operations/old/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } })).events).toBe(0));
  test('newer scope cursor wins, and newer global cursor wins', async () => {
    const base = { 'clubs/c/operations/o': { date_fin: ts('2026-04-05T10:00:00Z') }, 'clubs/c/operations/o/inscriptions/i': { membre_id: 'm', registration_status: 'confirmed' }, 'clubs/c/operations/o/messages/a': { created_at: ts('2026-03-03T00:00:00Z') }, 'clubs/c/operations/o/messages/b': { created_at: ts('2026-03-05T00:00:00Z') }, 'clubs/c/members/m/read_state/events/conversations/o': { last_seen_at: ts('2026-03-04T00:00:00Z') } };
    expect((await count(base)).events).toBe(1);
    base['clubs/c/members/m/read_state/events'] = { global_last_seen_at: ts('2026-03-06T00:00:00Z') };
    expect((await count(base)).events).toBe(0);
  });
  test('team counts visible general channel but not hidden CA channel', async () => expect((await count({ 'clubs/c/team_channels/general': { type: 'general' }, 'clubs/c/team_channels/general/messages/a': { created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/team_channels/ca': { type: 'ca' }, 'clubs/c/team_channels/ca/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } })).teams).toBe(1));
  test('published accueil session counts while non-published does not', async () => expect((await count({ 'clubs/c/piscine_sessions/p': { statut: 'publie' }, 'clubs/c/piscine_sessions/p/messages/a': { group_type: 'accueil', created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/piscine_sessions/d': { statut: 'brouillon' }, 'clubs/c/piscine_sessions/d/messages/a': { group_type: 'accueil', created_at: ts('2026-03-02T00:00:00Z') } }, { roles: ['Accueil'] })).sessions).toBe(1));
  test('niveau scope cursor excludes messages before its cursor', async () => expect((await count({ 'clubs/c/piscine_sessions/p': { statut: 'publie', niveaux: { P2: true } }, 'clubs/c/piscine_sessions/p/messages/a': { group_type: 'niveau', group_level: 'P2', created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/piscine_sessions/p/messages/b': { group_type: 'niveau', group_level: 'P2', created_at: ts('2026-03-05T00:00:00Z') }, 'clubs/c/members/m/read_state/sessions/chats/p__niveau__P2': { last_seen_at: ts('2026-03-04T00:00:00Z') } }, { roles: ['Encadrant'] })).sessions).toBe(1));
});

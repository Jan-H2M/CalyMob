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
    const operation = {
      type: 'evenement',
      statut: 'ouvert',
      date_fin: new MemoryTimestamp('2026-03-28T22:00:00Z'),
    };
    expect(isUnreadEligibleEvent(operation, new Date('2026-04-03T21:00:00Z'))).toBe(true);
    expect(isUnreadEligibleEvent(operation, new Date('2026-04-04T21:00:00Z'))).toBe(true);
    expect(isUnreadEligibleEvent(operation, new Date('2026-04-04T21:00:01Z'))).toBe(false);
    expect(isUnreadEligibleEvent({ ...operation, statut: 'supprimé' }, now)).toBe(false);
    expect(isUnreadEligibleEvent({ ...operation, deleted_at: ts('2026-03-30T00:00:00Z') }, now)).toBe(false);
    expect(isUnreadEligibleEvent({ ...operation, categorie: ' PiScInE ' }, now)).toBe(false);
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
  test('announcement activity one nanosecond later in the same millisecond counts', async () => {
    const seen = new MemoryTimestamp(10, 123_000_100);
    const activity = new MemoryTimestamp(10, 123_000_900);
    const db = dbWith({
      'clubs/c/announcements/a': {
        visibility: 'published',
        last_activity_at: activity,
      },
    });
    await db.doc('clubs/c/members/m/read_state/announcements')
      .set({ last_seen_at: seen });
    const result = await getCanonicalUnreadBreakdown({
      db,
      clubId: 'c',
      memberId: 'm',
      now,
    });
    expect(result.announcements).toBe(1);
  });
  test('soft-deleted announcement does not count', async () => expect((await count({ 'clubs/c/announcements/a': { visibility: 'deleted', deleted_at: ts('2026-03-02T00:00:00Z'), last_activity_at: ts('2026-03-02T00:00:00Z') } })).announcements).toBe(0));
  test('legacy visible counts while legacy deleted does not', async () => expect((await count({ 'clubs/c/announcements/a': { created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/announcements/b': { created_at: ts('2026-03-02T00:00:00Z'), deleted_at: ts('2026-03-03T00:00:00Z') } })).announcements).toBe(1));
  test('missing announcement cursor fails closed instead of publishing zero', async () => expect(count({ 'clubs/c/announcements/a': { visibility: 'published', last_activity_at: ts('2026-03-02T00:00:00Z') } }, { announcementCursor: false })).rejects.toThrow('roots are incomplete'));
  test('eligible event within seven Brussels days counts messages', async () => expect((await count({ 'clubs/c/operations/o': { type: 'evenement', statut: 'ouvert', date_fin: ts('2026-03-29T10:00:00Z') }, 'clubs/c/operations/o/inscriptions/i': { membre_id: 'm', registration_status: 'confirmed' }, 'clubs/c/operations/o/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } })).events).toBe(1));
  test('expired, canceled, and waitlisted event registrations do not count', async () => expect((await count({ 'clubs/c/operations/old': { type: 'evenement', statut: 'ferme', date_fin: ts('2026-03-28T10:00:00Z') }, 'clubs/c/operations/old/inscriptions/a': { membre_id: 'm', registration_status: 'confirmed' }, 'clubs/c/operations/cancel': { type: 'evenement', statut: 'annule', date_fin: ts('2026-04-05T10:00:00Z') }, 'clubs/c/operations/cancel/inscriptions/a': { membre_id: 'm', registration_status: 'canceled' }, 'clubs/c/operations/wait': { type: 'evenement', statut: 'ouvert', date_fin: ts('2026-04-05T10:00:00Z') }, 'clubs/c/operations/wait/inscriptions/a': { membre_id: 'm', registration_status: 'waitlisted' }, 'clubs/c/operations/old/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } })).events).toBe(0));
  test('newer scope cursor wins, and newer global cursor wins', async () => {
    const base = { 'clubs/c/operations/o': { type: 'evenement', statut: 'ferme', date_fin: ts('2026-04-05T10:00:00Z') }, 'clubs/c/operations/o/inscriptions/i': { membre_id: 'm', registration_status: 'confirmed' }, 'clubs/c/operations/o/messages/a': { created_at: ts('2026-03-03T00:00:00Z') }, 'clubs/c/operations/o/messages/b': { created_at: ts('2026-03-05T00:00:00Z') }, 'clubs/c/members/m/read_state/events/conversations/o': { last_seen_at: ts('2026-03-04T00:00:00Z') } };
    expect((await count(base)).events).toBe(1);
    base['clubs/c/members/m/read_state/events'] = { global_last_seen_at: ts('2026-03-06T00:00:00Z') };
    expect((await count(base)).events).toBe(0);
  });
  test('team counts visible general channel but not hidden CA channel', async () => expect((await count({ 'clubs/c/team_channels/general': { type: 'general' }, 'clubs/c/team_channels/general/messages/a': { created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/team_channels/ca': { type: 'ca' }, 'clubs/c/team_channels/ca/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } })).teams).toBe(1));
  test('team counts a visible fallback channel whose parent document is absent', async () => {
    const result = await count({ 'clubs/c/team_channels/general/messages/a': { created_at: ts('2026-03-02T00:00:00Z') } });
    expect(result.teams).toBe(1);
  });
  test('formation targets require formation_active exactly like Flutter', async () => {
    const explicit = await count({
      'clubs/c/members/m': { target_formation_level: '2*', formation_active: false },
      'clubs/c/team_channels/formation_2_etoiles/messages/a': { created_at: ts('2026-03-02T00:00:00Z') },
    });
    const derived = await count({
      'clubs/c/members/m': { plongeur_code: 'P1', formation_active: false },
      'clubs/c/team_channels/formation_2_etoiles/messages/a': { created_at: ts('2026-03-02T00:00:00Z') },
    });
    expect(explicit.teams).toBe(0);
    expect(derived.teams).toBe(0);
    const active = await count({
      'clubs/c/members/m': { target_formation_level: '2*', formation_active: true },
      'clubs/c/team_channels/formation_2_etoiles/messages/a': { created_at: ts('2026-03-02T00:00:00Z') },
    });
    expect(active.teams).toBe(1);
  });
  test('published assigned accueil session counts while non-published does not', async () => expect((await count({ 'clubs/c/piscine_sessions/p': { statut: 'publie', accueil: [{ membre_id: 'm' }] }, 'clubs/c/piscine_sessions/p/messages/a': { group_type: 'accueil', created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/piscine_sessions/d': { statut: 'brouillon', accueil: [{ membre_id: 'm' }] }, 'clubs/c/piscine_sessions/d/messages/a': { group_type: 'accueil', created_at: ts('2026-03-02T00:00:00Z') } })).sessions).toBe(1));
  test('niveau scope cursor excludes messages before its cursor', async () => expect((await count({ 'clubs/c/piscine_sessions/p': { statut: 'publie', niveaux: { P2: { encadrants: [{ membre_id: 'm' }] } } }, 'clubs/c/piscine_sessions/p/messages/a': { group_type: 'niveau', group_level: 'P2', created_at: ts('2026-03-02T00:00:00Z') }, 'clubs/c/piscine_sessions/p/messages/b': { group_type: 'niveau', group_level: 'P2', created_at: ts('2026-03-05T00:00:00Z') }, 'clubs/c/members/m/read_state/sessions/chats/p__niveau__P2': { last_seen_at: ts('2026-03-04T00:00:00Z') } })).sessions).toBe(1));
  test('course-only encadrant assignment grants the niveau and encadrants scopes', async () => {
    const result = await count({
      'clubs/c/piscine_sessions/p': { statut: 'publie', niveaux: { P2: { courses_by_hour: { h20: [{ encadrants: [{ membre_id: 'm' }] }] } } } },
      'clubs/c/piscine_sessions/p/messages/a': { group_type: 'niveau', group_level: 'P2', created_at: ts('2026-03-02T00:00:00Z') },
      'clubs/c/piscine_sessions/p/messages/b': { group_type: 'encadrants', created_at: ts('2026-03-02T00:00:00Z') },
    });
    expect(result.sessions).toBe(2);
  });
  test('legacy camelCase course-only assignment has identical session scopes', async () => {
    const result = await count({
      'clubs/c/piscine_sessions/p': { statut: 'publie', niveaux: { P2: { coursesByHour: { h20: [{ encadrants: [{ membre_id: 'm' }] }] } } } },
      'clubs/c/piscine_sessions/p/messages/a': { group_type: 'niveau', group_level: 'P2', created_at: ts('2026-03-02T00:00:00Z') },
      'clubs/c/piscine_sessions/p/messages/b': { group_type: 'encadrants', created_at: ts('2026-03-02T00:00:00Z') },
    });
    expect(result.sessions).toBe(2);
  });
  test('duplicate active inscriptions do not double-count an event conversation', async () => {
    const result = await count({
      'clubs/c/operations/o': { type: 'evenement', statut: 'ouvert', date_fin: ts('2026-04-05T10:00:00Z') },
      'clubs/c/operations/o/inscriptions/a': { membre_id: 'm', registration_status: 'confirmed' },
      'clubs/c/operations/o/inscriptions/b': { membre_id: 'm', registration_status: 'confirmed' },
      'clubs/c/operations/o/messages/a': { created_at: ts('2026-03-02T00:00:00Z') },
    });
    expect(result.events).toBe(1);
  });
});

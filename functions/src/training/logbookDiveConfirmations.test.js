/**
 * WP-28 — unit tests for the buddy-share personalisation logic:
 * per-recipient binôme remap, shared-fields whitelist, replace merge,
 * re-ask comparison and old-snapshot sanitisation.
 */

jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  Timestamp: {
    fromDate: (date) => date.toISOString(),
    now: () => '__now__',
  },
}));
jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: jest.fn(),
  filterByPreference: jest.fn(),
  sendNotificationsWithBadge: jest.fn(),
}));

const {
  buildDiveSnapshot,
  sharedCounters,
  personalCounters,
  binomesForTarget,
  legacyBuddiesFromBinomes,
  snapshotForTarget,
  snapshotDiffers,
  sanitizeSnapshotForTarget,
  buildCopyPayload,
  buildReplaceUpdate,
} = require('./logbookDiveConfirmations');

const JAN = { id: 'jan-id', name: 'Jan Andriessens' };
const POL = { id: 'pol-id', name: 'Pol Dupont' };
const BERT = { id: 'bert-id', name: 'Bert Peeters' };

const memberBinome = (m) => ({
  type: 'member',
  member_id: m.id,
  memberId: m.id,
  display_name: m.name,
  displayName: m.name,
});

const janEntry = () => ({
  member_id: JAN.id,
  member_name: JAN.name,
  source: 'manual',
  date: new Date('2026-07-26T09:00:00Z'),
  location_name: 'Vodelée',
  country: 'BE',
  depth_max_meters: 21,
  duration_minutes: 42,
  counters: { mer: false, nuit: true, deco: true, dp: true, sf: true, exo: true, nitrox: true, surveillance: true, maree: true },
  combi: { type: 'etanche', label: 'Ma combi' },
  combi_type: 'etanche',
  tank: { volume_l: 12 },
  lestage_kg: 6,
  o2_pct: 32,
  zone: 'zelande',
  water_temp_c: 12,
  notes: 'Belle plongée, hippocampe !',
  binomes: [memberBinome(POL), memberBinome(BERT)],
});

describe('WP-28 binôme remap per recipient', () => {
  test('Pol receives [Jan, Bert] — never himself, always the author', () => {
    const result = binomesForTarget(
      janEntry(), { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    const ids = result.map((b) => b.member_id);
    expect(ids).toEqual([JAN.id, BERT.id]);
    expect(result[0].display_name).toBe(JAN.name);
  });

  test('Bert receives [Jan, Pol]', () => {
    const result = binomesForTarget(
      janEntry(), { memberId: BERT.id, displayName: BERT.name }, JAN.id, JAN.name
    );
    expect(result.map((b) => b.member_id)).toEqual([JAN.id, POL.id]);
  });

  test('author accidentally in their own list is deduplicated', () => {
    const entry = janEntry();
    entry.binomes.push(memberBinome(JAN));
    const result = binomesForTarget(
      entry, { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    expect(result.filter((b) => b.member_id === JAN.id)).toHaveLength(1);
    expect(result.map((b) => b.member_id)).toEqual([JAN.id, BERT.id]);
  });

  test('external and text binômes are preserved', () => {
    const entry = janEntry();
    entry.binomes.push({ type: 'external', display_name: 'Marc (LFN)', club: 'LFN' });
    const result = binomesForTarget(
      entry, { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    expect(result.map((b) => b.display_name)).toEqual([JAN.name, BERT.name, 'Marc (LFN)']);
  });

  test('a text binôme that IS the recipient is removed by name', () => {
    const entry = janEntry();
    entry.binomes = [{ type: 'external', display_name: 'Pol  DUPONT' }, memberBinome(BERT)];
    const result = binomesForTarget(
      entry, { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    expect(result.map((b) => b.display_name)).toEqual([JAN.name, BERT.name]);
  });

  test('legacy buddies-only entries still remap', () => {
    const entry = janEntry();
    entry.binomes = [];
    entry.buddies = [
      { member_id: POL.id, name: POL.name },
      { name: 'Karel (extern)', external_organization: 'NELOS' },
    ];
    const result = binomesForTarget(
      entry, { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    expect(result.map((b) => b.display_name)).toEqual([JAN.name, 'Karel (extern)']);
  });

  test('legacy buddies[] derives from the remapped binômes', () => {
    const buddies = legacyBuddiesFromBinomes([
      memberBinome(JAN),
      { type: 'external', display_name: 'Marc', club: 'LFN' },
    ]);
    expect(buddies).toEqual([
      { member_id: JAN.id, name: JAN.name },
      { name: 'Marc', external_organization: 'LFN' },
    ]);
  });
});

describe('WP-28 shared-fields whitelist', () => {
  test('snapshot strips equipment, O₂ and personal counters', () => {
    const snapshot = buildDiveSnapshot(janEntry());
    expect(snapshot.combi).toBeUndefined();
    expect(snapshot.combi_type).toBeUndefined();
    expect(snapshot.tank).toBeUndefined();
    expect(snapshot.lestage_kg).toBeUndefined();
    expect(snapshot.o2_pct).toBeUndefined();
    expect(snapshot.counters).toEqual({ nuit: true, deco: true, maree: true });
  });

  test('snapshot keeps shared context: zone, température, notes, lieu', () => {
    const snapshot = buildDiveSnapshot(janEntry());
    expect(snapshot.zone).toBe('zelande');
    expect(snapshot.water_temp_c).toBe(12);
    expect(snapshot.notes).toBe('Belle plongée, hippocampe !');
    expect(snapshot.location_name).toBe('Vodelée');
    expect(snapshot.country).toBe('BE');
    expect(snapshot.depth_max_meters).toBe(21);
    expect(snapshot.duration_minutes).toBe(42);
  });

  test('counter helpers split shared vs personal keys', () => {
    const counters = { nuit: true, deco: true, dp: true, sf: true, exo: true };
    expect(sharedCounters(counters)).toEqual({ nuit: true, deco: true });
    expect(personalCounters(counters)).toEqual({ dp: true, sf: true, exo: true });
  });

  test('copy payload contains no personal fields and remapped buddies', () => {
    const entry = janEntry();
    const snapshot = snapshotForTarget(
      buildDiveSnapshot(entry), entry,
      { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    const payload = buildCopyPayload(snapshot, POL.id, POL.name, 'conf-1', JAN.id, 'entry-1');
    expect(payload.member_id).toBe(POL.id);
    expect(payload.source).toBe('shared_logbook');
    expect(payload.combi).toBeUndefined();
    expect(payload.tank).toBeUndefined();
    expect(payload.lestage_kg).toBeUndefined();
    expect(payload.counters).toEqual({ nuit: true, deco: true, maree: true });
    expect(payload.binomes.map((b) => b.member_id)).toEqual([JAN.id, BERT.id]);
    expect(payload.buddies.map((b) => b.name)).toEqual([JAN.name, BERT.name]);
    expect(payload.zone).toBe('zelande');
    expect(payload.country).toBe('BE');
    expect(payload.water_temp_c).toBe(12);
    expect(payload.validation_status).toBe('buddy_confirmed');
    expect(payload.dive_number).toBeUndefined();
  });
});

describe('WP-28 replace keeps the recipient\'s personal data', () => {
  test('personal counters of the existing entry survive, shared follow the snapshot', () => {
    const entry = janEntry();
    const snapshot = snapshotForTarget(
      buildDiveSnapshot(entry), entry,
      { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    const polExisting = {
      member_id: POL.id,
      counters: { sf: true, nitrox: true, mer: true, nuit: false },
      combi: { type: 'humide' },
      lestage_kg: 4,
    };
    const update = buildReplaceUpdate(snapshot, polExisting, 'conf-1', JAN.id, 'entry-1');
    // sf/nitrox = Pol's own roles → preserved; mer disappears (shared truth
    // of the shared version); nuit/deco/maree follow Jan's version.
    expect(update.counters).toEqual({ sf: true, nitrox: true, nuit: true, deco: true, maree: true });
    expect(update.combi).toBeUndefined();
    expect(update.lestage_kg).toBeUndefined();
    expect(update.member_name).toBeUndefined();
    expect(update.member_id).toBeUndefined();
    expect(update.source).toBeUndefined();
    expect(update.binomes).toBeUndefined();
    expect(update.validation_status).toBe('buddy_confirmed');
    expect(update.created_at).toBeUndefined();
  });
});

describe('WP-28 snapshot comparison (refresh / re-ask)', () => {
  const base = () => {
    const entry = janEntry();
    return snapshotForTarget(
      buildDiveSnapshot(entry), entry,
      { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
  };

  test('identical snapshots do not differ', () => {
    expect(snapshotDiffers(base(), base())).toBe(false);
    expect(snapshotDiffers(base(), base(), { includeNotes: false })).toBe(false);
  });

  test('depth change is substantive (refresh AND re-ask)', () => {
    const b = { ...base(), depth_max_meters: 28 };
    expect(snapshotDiffers(base(), b)).toBe(true);
    expect(snapshotDiffers(base(), b, { includeNotes: false })).toBe(true);
  });

  test('notes-only change refreshes but never re-asks', () => {
    const b = { ...base(), notes: 'Typo corrigé' };
    expect(snapshotDiffers(base(), b)).toBe(true);
    expect(snapshotDiffers(base(), b, { includeNotes: false })).toBe(false);
  });

  test('shared counter change (déco) is substantive', () => {
    const a = base();
    const b = { ...base(), counters: { nuit: true, maree: true } };
    expect(snapshotDiffers(a, b, { includeNotes: false })).toBe(true);
  });

  test('température change is substantive', () => {
    const b = { ...base(), water_temp_c: 8 };
    expect(snapshotDiffers(base(), b, { includeNotes: false })).toBe(true);
  });

  test('country change is substantive', () => {
    const b = { ...base(), country: 'NL' };
    expect(snapshotDiffers(base(), b, { includeNotes: false })).toBe(true);
  });

  test('personal counters never influence the comparison', () => {
    const a = { ...base(), counters: { ...base().counters, dp: true } };
    expect(snapshotDiffers(a, base())).toBe(false);
  });
});

describe('WP-28 sanitisation of pre-WP-28 snapshots at answer time', () => {
  test('old-style snapshot (recipient listed, personal fields present) is cleaned', () => {
    const oldSnapshot = {
      ...janEntry(),
      binomes: [memberBinome(POL), memberBinome(BERT)],
      buddies: [{ member_id: POL.id, name: POL.name }, { member_id: BERT.id, name: BERT.name }],
    };
    const cleaned = sanitizeSnapshotForTarget(oldSnapshot, POL.id, POL.name, JAN.id, JAN.name);
    expect(cleaned.binomes.map((b) => b.member_id)).toEqual([JAN.id, BERT.id]);
    expect(cleaned.buddies.map((b) => b.name)).toEqual([JAN.name, BERT.name]);
    expect(cleaned.combi).toBeUndefined();
    expect(cleaned.tank).toBeUndefined();
    expect(cleaned.lestage_kg).toBeUndefined();
    expect(cleaned.counters).toEqual({ nuit: true, deco: true, maree: true });
  });

  test('new-style snapshot passes through unchanged (idempotent)', () => {
    const entry = janEntry();
    const fresh = snapshotForTarget(
      buildDiveSnapshot(entry), entry,
      { memberId: POL.id, displayName: POL.name }, JAN.id, JAN.name
    );
    const cleaned = sanitizeSnapshotForTarget(fresh, POL.id, POL.name, JAN.id, JAN.name);
    expect(cleaned.binomes.map((b) => b.member_id)).toEqual([JAN.id, BERT.id]);
    expect(cleaned.counters).toEqual(fresh.counters);
    expect(cleaned.notes).toBe(fresh.notes);
  });
});

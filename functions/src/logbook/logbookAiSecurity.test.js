jest.mock('firebase-admin', () => ({
  firestore: jest.fn(),
  storage: jest.fn(),
}));

const admin = require('firebase-admin');
const { authorizeLogbookAi } = require('./authorizeLogbookAi');
const { analyzeLogbookDictation, loadContext, sanitizeResult } = require('../logbookDictation/analyzeLogbookDictation');
const { analyzeLogbookPage } = require('../logbookOcr/analyzeLogbookPage');

const clubId = 'test-club';
const uid = 'fictional-member';
const memberPath = `clubs/${clubId}/members/${uid}`;
const auth = { uid, token: { clubId, app_role: 'admin' } };
const dictation = { clubId, defaultYear: 2026, text: 'Sortie à la Gombe.' };
const ocr = { clubId, defaultYear: 2026, storagePath: `clubs/${clubId}/ocr_imports/${uid}/job/page.jpg` };
const today = new Date('2026-11-24T23:59:59Z');

function testDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  const pathRef = (path = '') => ({
    path,
    collection: (id) => pathRef(path ? `${path}/${id}` : id),
    doc: (id) => pathRef(`${path}/${id}`),
  });
  const tx = {
    get: jest.fn(async (ref) => ({
      exists: records.has(ref.path),
      data: () => records.get(ref.path),
      get: (name) => records.get(ref.path)?.[name],
    })),
    set: jest.fn((ref, data) => records.set(ref.path, data)),
  };
  return { ...pathRef(), runTransaction: jest.fn((fn) => fn(tx)), records, tx };
}

let provider;
beforeEach(() => {
  jest.clearAllMocks();
  provider = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected provider call'));
  admin.storage.mockReturnValue({
    bucket: () => ({ file: () => ({ exists: async () => [false] }) }),
  });
});

afterEach(() => {
  expect(provider).not.toHaveBeenCalled();
  provider.mockRestore();
});

describe.each([
  ['dictation', analyzeLogbookDictation, dictation],
  ['OCR', analyzeLogbookPage, ocr],
])('%s callable', (_label, callable, data) => {
  test('rejects unauthenticated requests before Firestore or Storage', async () => {
    await expect(callable.run({ data })).rejects.toHaveProperty('code', 'unauthenticated');
    expect(admin.firestore).not.toHaveBeenCalled();
    expect(admin.storage).not.toHaveBeenCalled();
  });

  test.each(['/other', 'two clubs', 'a'.repeat(65), '__reserved__'])(
    'rejects malformed club IDs before Firestore', async (invalidClub) => {
      await expect(callable.run({ auth, data: { ...data, clubId: invalidClub } }))
        .rejects.toHaveProperty('code', 'invalid-argument');
      expect(admin.firestore).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, { member_status: 'inactive', app_status: 'active' },
    { member_status: 'archived' }])('rejects non-active membership %o', async (member) => {
    const db = testDb(member ? { [memberPath]: member } : {});
    admin.firestore.mockReturnValue(db);
    await expect(callable.run({ auth, data })).rejects.toHaveProperty('code', 'permission-denied');
    expect(db.tx.get.mock.calls.map(([ref]) => ref.path)).toEqual([memberPath]);
    expect(db.tx.set).not.toHaveBeenCalled();
    expect(admin.storage).not.toHaveBeenCalled();
  });
});

test('the 30th request is allowed and the 31st is rejected until UTC midnight', async () => {
  const usagePath = `clubs/${clubId}/ai_usage/2026-11-24_${uid}`;
  const db = testDb({ [memberPath]: { member_status: 'active' }, [usagePath]: { count: 29 } });
  await authorizeLogbookAi(db, clubId, uid, today);
  expect(db.records.get(usagePath)).toEqual({ count: 30 });
  await expect(authorizeLogbookAi(db, clubId, uid, today))
    .rejects.toHaveProperty('code', 'resource-exhausted');
  await authorizeLogbookAi(db, clubId, uid, new Date('2026-11-25T00:00:00Z'));
  expect(db.records.get(`clubs/${clubId}/ai_usage/2026-11-25_${uid}`)).toEqual({ count: 1 });
  expect(db.tx.set).toHaveBeenCalledTimes(2);
});

test('OCR and dictation share the same allowance without charging another member', async () => {
  jest.useFakeTimers({ now: today });
  try {
    const other = 'other-member';
    const usagePath = `clubs/${clubId}/ai_usage/2026-11-24_${uid}`;
    const db = testDb({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/members/${other}`]: { status: 'active' },
      [usagePath]: { count: 29 },
    });
    admin.firestore.mockReturnValue(db);

    await expect(analyzeLogbookPage.run({ auth, data: ocr })).rejects.toHaveProperty('code', 'not-found');
    await expect(analyzeLogbookDictation.run({ auth, data: dictation }))
      .rejects.toHaveProperty('code', 'resource-exhausted');
    await authorizeLogbookAi(db, clubId, other, today);
    expect(db.records.get(usagePath)).toEqual({ count: 30 });
    expect(db.records.get(`clubs/${clubId}/ai_usage/2026-11-24_${other}`)).toEqual({ count: 1 });
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  { text: ' '.repeat(2000) + 'a' },
  { lockedFields: Array(41).fill('location') },
  { lockedFields: ['a'.repeat(33)] },
  { lockedFields: ['location\nnotes'] },
])('dictation rejects unbounded input before accessing Firestore', async (overrides) => {
  await expect(analyzeLogbookDictation.run({ auth, data: { ...dictation, ...overrides } }))
    .rejects.toHaveProperty('code', 'invalid-argument');
  expect(admin.firestore).not.toHaveBeenCalled();
});

test.each([
  [{ localeHints: ['a'.repeat(33)] }, 'invalid-argument'],
  [{ localeHints: Array(5).fill('fr') }, 'invalid-argument'],
  [{ storagePath: ocr.storagePath + 'a'.repeat(1024) }, 'invalid-argument'],
  [{ storagePath: ocr.storagePath.replace(uid, 'different-member') }, 'permission-denied'],
])('OCR rejects invalid options or cross-member paths before Firestore', async (overrides, code) => {
  await expect(analyzeLogbookPage.run({ auth, data: { ...ocr, ...overrides } }))
    .rejects.toHaveProperty('code', code);
  expect(admin.firestore).not.toHaveBeenCalled();
});

test('dictation builds its buddy context from the member directory only', async () => {
  const docs = [
    { id: uid, data: () => ({ first_name: 'Self' }) },
    { id: 'visible', data: () => ({ first_name: 'Club', last_name: 'Member' }) },
    { id: 'qa', data: () => ({ first_name: 'Test', is_test_account: true }) },
  ];
  const read = jest.fn(async (collection) => {
    if (collection === 'member_directory') return docs;
    if (['dive_locations', 'student_logbook_entries'].includes(collection)) return [];
    throw new Error('Unexpected collection read');
  });
  const collection = (name) => ({
    limit: () => ({ get: () => read(name) }),
    where: () => ({ limit: () => ({ get: () => read(name) }) }),
    get: () => read(name),
  });
  admin.firestore.mockReturnValue({
    collection: () => ({ doc: () => ({ collection }) }),
  });
  const context = await loadContext(clubId, uid);
  expect(context.members).toEqual([
    { id: 'visible', displayName: 'Club Member', aliases: ['Club Member', 'Member Club'] },
  ]);
  expect(read).not.toHaveBeenCalledWith('members');
});

test('dictation only returns buddy IDs from the server-supplied context', () => {
  const result = {
    fields: {
      buddies: [
        { memberId: 'real-id', displayName: 'Wrong name', matchedExisting: false },
        { memberId: 'invented-id', displayName: 'Guest', matchedExisting: true },
        { memberId: null, displayName: 'Another guest', matchedExisting: false },
      ],
    },
  };
  const members = [{ id: 'real-id', displayName: 'Club Member' }];
  expect(sanitizeResult(result, { lockedFields: [] }, [], members).fields.buddies)
    .toEqual([
      { memberId: 'real-id', displayName: 'Club Member', matchedExisting: true },
      { memberId: null, displayName: 'Guest', matchedExisting: false },
      { memberId: null, displayName: 'Another guest', matchedExisting: false },
    ]);
  expect(sanitizeResult(result, { lockedFields: ['buddy'] }, [], members).fields.buddies)
    .toEqual([]);
});

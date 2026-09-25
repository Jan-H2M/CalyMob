const { normalizeMode, effectiveUnreadCursorV1Mode, getUnreadCursorV1Mode, getUnreadCursorV1ModeForMember, clearUnreadCursorV1FlagCache, CACHE_TTL_MS } = require('./unreadCursorFeatureFlag');
const { MemoryFirestore } = require('../../test-utils/memoryFirestore');

describe('unread cursor v1 flag policy', () => {
  beforeEach(() => clearUnreadCursorV1FlagCache());
  test('defaults malformed/missing values to off', () => {
    expect(normalizeMode()).toBe('off');
    expect(normalizeMode({ unreadCursorV1Enabled: true, unreadCursorV1Mode: 'bad' })).toBe('off');
  });

  test('promotes only listed pilots while shadow remains legacy for others', () => {
    const flag = { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'shadow', unreadCursorV1PilotMemberIds: ['pilot'] };
    expect(effectiveUnreadCursorV1Mode(flag, 'pilot')).toBe('on');
    expect(effectiveUnreadCursorV1Mode(flag, 'other')).toBe('shadow');
    expect(effectiveUnreadCursorV1Mode({ ...flag, unreadCursorV1Mode: 'on' }, 'other')).toBe('on');
  });

  test('missing or failing flag reads default safely to off', async () => {
    expect(await getUnreadCursorV1Mode(new MemoryFirestore(), 'c', 1)).toBe('off');
    const db = { collection: () => { throw new Error('read failed'); } };
    expect(await getUnreadCursorV1Mode(db, 'failed', 1)).toBe('off');
  });

  test('caches within TTL and rereads after TTL, including pilot effective mode', async () => {
    let reads = 0;
    const data = { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'shadow', unreadCursorV1PilotMemberIds: ['p'] };
    const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: async () => { reads++; return { exists: true, data: () => data }; } }) }) }) }) };
    expect(await getUnreadCursorV1ModeForMember(db, 'c', 'p', 100)).toBe('on');
    expect(await getUnreadCursorV1ModeForMember(db, 'c', 'other', 101)).toBe('shadow');
    expect(reads).toBe(1);
    expect(await getUnreadCursorV1ModeForMember(db, 'c', 'p', 100 + CACHE_TTL_MS + 1)).toBe('on');
    expect(reads).toBe(2);
  });
});

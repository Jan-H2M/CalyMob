const {
  normalizeMode,
  effectiveUnreadCursorV1Mode,
  getUnreadCursorV1Mode,
  getUnreadCursorV1ModeForMember,
} = require('./unreadCursorFeatureFlag');
const { MemoryFirestore } = require('../../test-utils/memoryFirestore');

describe('unread cursor v1 flag policy', () => {
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

  test('missing flags are off while read failures remain unknown', async () => {
    expect(await getUnreadCursorV1Mode(new MemoryFirestore(), 'c', 1)).toBe('off');
    const db = { collection: () => { throw new Error('read failed'); } };
    expect(await getUnreadCursorV1Mode(db, 'failed', 1)).toBe('unknown');
  });

  test('rereads every time so a warm instance cannot retain pre-cutover mode', async () => {
    let reads = 0;
    let data = { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'shadow', unreadCursorV1PilotMemberIds: ['p'] };
    const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: async () => { reads++; return { exists: true, data: () => data }; } }) }) }) }) };
    expect(await getUnreadCursorV1ModeForMember(db, 'c', 'p')).toBe('on');
    expect(await getUnreadCursorV1ModeForMember(db, 'c', 'other')).toBe('shadow');
    expect(reads).toBe(2);
    data = { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'on' };
    expect(await getUnreadCursorV1ModeForMember(db, 'c', 'other')).toBe('on');
    expect(reads).toBe(3);
  });
});

const { MemoryFirestore, MemoryTimestamp: MockMemoryTimestamp } = require('../../test-utils/memoryFirestore');

jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      fromDate: date => new MockMemoryTimestamp(date),
    },
  },
}));

const {
  authoritativeCreateTime,
  advanceAnnouncementAuthority,
  stampUnreadCreatedAt,
  stampAnnouncementReplyCreated,
  recomputeAnnouncementAuthority,
} = require('./unreadTimestampAuthority');

function snapshot(db, path, data, createTime) {
  db.docs.set(path, data);
  return {
    createTime,
    data: () => db.docs.get(path),
    ref: db.doc(path),
  };
}

describe('unread timestamp authority', () => {
  test('createTime overrides future, past, missing and malformed client clocks', async () => {
    const trusted = new MockMemoryTimestamp('2026-09-26T10:00:00.123Z');
    for (const [name, createdAt] of [
      ['future', new MockMemoryTimestamp('2099-01-01T00:00:00Z')],
      ['past', new MockMemoryTimestamp('2020-01-01T00:00:00Z')],
      ['missing', undefined],
      ['malformed', 'tomorrow'],
    ]) {
      const db = new MemoryFirestore();
      const data = createdAt === undefined ? {} : { created_at: createdAt };
      const item = snapshot(db, `items/${name}`, data, trusted);
      await stampUnreadCreatedAt({ snapshot: item });
      expect(db.docs.get(`items/${name}`).created_at).toBe(trusted);
      expect(db.docs.get(`items/${name}`).unread_created_at).toBe(trusted);
    }
  });

  test('CloudEvent time is only a tested fallback when createTime is absent', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const value = authoritativeCreateTime(
      {},
      '2026-09-26T10:00:00.123Z',
      date => new MockMemoryTimestamp(date),
    );
    expect(value.toMillis()).toBe(Date.parse('2026-09-26T10:00:00.123Z'));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('missing canonical activity is filled even when legacy activity exists', async () => {
    const legacy = new MockMemoryTimestamp('2026-09-26T09:00:00Z');
    const db = new MemoryFirestore({
      'clubs/c/announcements/a': {
        unread_created_at: legacy,
        last_activity_at: legacy,
      },
    });
    await advanceAnnouncementAuthority({
      db,
      announcementRef: db.doc('clubs/c/announcements/a'),
      activityAt: legacy,
    });
    expect(db.docs.get('clubs/c/announcements/a').unread_activity_at)
      .toBe(legacy);
  });

  test('out-of-order replies and a late root trigger never lower parent activity', async () => {
    const rootTime = new MockMemoryTimestamp('2026-09-26T09:00:00Z');
    const newer = new MockMemoryTimestamp('2026-09-26T11:00:00Z');
    const older = new MockMemoryTimestamp('2026-09-26T10:00:00Z');
    const db = new MemoryFirestore({
      'clubs/c/announcements/a': { unread_created_at: rootTime },
    });
    for (const [id, at] of [['newer', newer], ['older', older]]) {
      const reply = snapshot(
        db,
        `clubs/c/announcements/a/replies/${id}`,
        {},
        at,
      );
      await stampAnnouncementReplyCreated({
        db,
        snapshot: reply,
        announcementRef: db.doc('clubs/c/announcements/a'),
      });
    }
    await advanceAnnouncementAuthority({
      db,
      announcementRef: db.doc('clubs/c/announcements/a'),
      activityAt: rootTime,
    });
    const parent = db.docs.get('clubs/c/announcements/a');
    expect(parent.unread_activity_at.toMillis()).toBe(newer.toMillis());
    expect(parent.unread_last_reply_at.toMillis()).toBe(newer.toMillis());
  });

  test('a reply deleted between stamping and parent advance cannot create phantom activity',
      async () => {
    const rootTime = new MockMemoryTimestamp('2026-09-26T09:00:00Z');
    const replyTime = new MockMemoryTimestamp('2026-09-26T11:00:00Z');
    const rootPath = 'clubs/c/announcements/a';
    const replyPath = `${rootPath}/replies/race`;
    const db = new MemoryFirestore({
      [rootPath]: {
        unread_created_at: rootTime,
        unread_activity_at: rootTime,
      },
      [replyPath]: {},
    });
    const storedRef = db.doc(replyPath);
    const reply = {
      createTime: replyTime,
      data: () => db.docs.get(replyPath),
      ref: {
        ...storedRef,
        get: () => storedRef.get(),
        update: async data => {
          await storedRef.update(data);
          db.docs.delete(replyPath);
        },
      },
    };

    await stampAnnouncementReplyCreated({
      db,
      snapshot: reply,
      announcementRef: db.doc(rootPath),
    });

    expect(db.docs.get(rootPath).unread_activity_at).toBe(rootTime);
    expect(db.docs.has(replyPath)).toBe(false);
  });

  test('deleting the newest reply recomputes activity from remaining server createTimes', async () => {
    const root = new MockMemoryTimestamp('2026-09-26T09:00:00Z');
    const oldReply = new MockMemoryTimestamp('2026-09-26T10:00:00Z');
    const deletedReply = new MockMemoryTimestamp('2026-09-26T11:00:00Z');
    const rootPath = 'clubs/c/announcements/a';
    const db = new MemoryFirestore({
      [rootPath]: {
        __test_create_time: root,
        unread_created_at: root,
        unread_activity_at: deletedReply,
        unread_last_reply_at: deletedReply,
      },
      [`${rootPath}/replies/old`]: {
        __test_create_time: oldReply,
        unread_created_at: oldReply,
      },
    });

    await recomputeAnnouncementAuthority({
      db,
      announcementRef: db.doc(rootPath),
      deleteField: () => ({ delete: true }),
    });
    const parent = db.docs.get(rootPath);
    expect(parent.unread_activity_at.toMillis()).toBe(oldReply.toMillis());
    expect(parent.last_activity_at.toMillis()).toBe(oldReply.toMillis());
    expect(parent.unread_last_reply_at.toMillis()).toBe(oldReply.toMillis());
    expect(parent.last_reply_at.toMillis()).toBe(oldReply.toMillis());
  });

  test('deleting the only reply falls back to the root createTime', async () => {
    const root = new MockMemoryTimestamp('2026-09-26T09:00:00Z');
    const latest = new MockMemoryTimestamp('2026-09-26T11:00:00Z');
    const rootPath = 'clubs/c/announcements/a';
    const db = new MemoryFirestore({
      [rootPath]: {
        __test_create_time: root,
        unread_activity_at: latest,
        unread_last_reply_at: latest,
      },
    });
    const deleted = { delete: true };
    await recomputeAnnouncementAuthority({
      db,
      announcementRef: db.doc(rootPath),
      deleteField: () => deleted,
    });
    const parent = db.docs.get(rootPath);
    expect(parent.unread_activity_at.toMillis()).toBe(root.toMillis());
    expect(parent.unread_last_reply_at).toBe(deleted);
  });
});

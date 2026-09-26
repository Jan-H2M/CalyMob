const fs = require('fs');
const path = require('path');
const {
  MemoryFirestore,
  MemoryTimestamp: MockMemoryTimestamp,
} = require('../../test-utils/memoryFirestore');

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (options, handler) => ({ options, handler }),
}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    Timestamp: { fromDate: date => new MockMemoryTimestamp(date) },
  }),
}));

const {
  reconcileUnreadTimestampCreate,
  onAnnouncementUnreadTimestampCreated,
  onAnnouncementReplyUnreadTimestampCreated,
  onEventMessageUnreadTimestampCreated,
  onTeamMessageUnreadTimestampCreated,
  onSessionMessageUnreadTimestampCreated,
} = require('./unreadTimestampReconciliationTriggers');

test('all five idempotent authority triggers have Eventarc retry enabled', () => {
  for (const trigger of [
    onAnnouncementUnreadTimestampCreated,
    onAnnouncementReplyUnreadTimestampCreated,
    onEventMessageUnreadTimestampCreated,
    onTeamMessageUnreadTimestampCreated,
    onSessionMessageUnreadTimestampCreated,
  ]) {
    expect(trigger.options.region).toBe('europe-west1');
    expect(trigger.options.retry).toBe(true);
  }
  const deleteSource = fs.readFileSync(
    path.join(__dirname, 'onAnnouncementReplyDeleted.js'), 'utf8',
  );
  const aclSource = fs.readFileSync(
    path.join(__dirname, 'onPiscineSessionChatAclWritten.js'), 'utf8',
  );
  expect(deleteSource).toContain('retry: true');
  expect(aclSource).toContain('retry: true');
});

test('a failed authority write is safe to retry and converges idempotently', async () => {
  const db = new MemoryFirestore();
  const path = 'clubs/c/operations/o/messages/m';
  const trusted = new MockMemoryTimestamp(10, 123_000_900);
  db.docs.set(path, { created_at: new MockMemoryTimestamp('2099-01-01') });
  const ref = db.doc(path);
  let attempts = 0;
  let snapshot;
  const retryingRef = {
    get: async () => snapshot,
    update: async updates => {
      attempts++;
      if (attempts === 1) throw new Error('transient');
      await ref.update(updates);
    },
  };
  snapshot = {
    exists: true,
    createTime: trusted,
    data: () => db.docs.get(path),
    ref: retryingRef,
  };
  const input = { db, snapshot, kind: 'message' };
  await expect(reconcileUnreadTimestampCreate(input)).rejects.toThrow('transient');
  await expect(reconcileUnreadTimestampCreate(input))
    .resolves.toEqual({ status: 'reconciled' });
  await expect(reconcileUnreadTimestampCreate(input))
    .resolves.toEqual({ status: 'reconciled' });
  expect(db.docs.get(path).created_at).toBe(trusted);
  expect(db.docs.get(path).unread_created_at).toBe(trusted);
});

test('sender cursor failure keeps retry trigger pending until it converges', async () => {
  const db = new MemoryFirestore();
  const path = 'clubs/c/team_channels/general/messages/m';
  const trusted = new MockMemoryTimestamp(10, 123_000_900);
  db.docs.set(path, { sender_id: 'sender', __test_create_time: trusted });
  const ref = db.doc(path);
  const snapshot = {
    exists: true,
    createTime: trusted,
    data: () => db.docs.get(path),
    ref,
  };
  let attempts = 0;
  const advanceSender = async args => {
    attempts += 1;
    expect(args.visibleAt).toBe(trusted);
    if (attempts === 1) throw new Error('cursor transaction unavailable');
    return { status: 'acknowledged' };
  };
  const input = {
    db,
    snapshot,
    kind: 'message',
    senderCursor: { clubId: 'c', section: 'teams', scopeId: 'general' },
    advanceSender,
  };
  await expect(reconcileUnreadTimestampCreate(input))
    .rejects.toThrow('cursor transaction unavailable');
  await expect(reconcileUnreadTimestampCreate(input))
    .resolves.toEqual({ status: 'reconciled' });
  expect(attempts).toBe(2);
});

test('a delayed retry stops cleanly when its target was deleted', async () => {
  const trusted = new MockMemoryTimestamp(10, 123_000_900);
  const staleData = { sender_id: 'sender' };
  const ref = {
    get: jest.fn(async () => ({ exists: false, data: () => undefined, ref })),
    update: jest.fn(),
  };
  const snapshot = {
    exists: true,
    createTime: trusted,
    data: () => staleData,
    ref,
  };
  const advanceSender = jest.fn();

  await expect(reconcileUnreadTimestampCreate({
    db: new MemoryFirestore(),
    snapshot,
    kind: 'message',
    senderCursor: { clubId: 'c', section: 'teams', scopeId: 'general' },
    advanceSender,
  })).resolves.toEqual({ skipped: 'deleted' });

  expect(ref.get).toHaveBeenCalledTimes(1);
  expect(ref.update).not.toHaveBeenCalled();
  expect(advanceSender).not.toHaveBeenCalled();
});

test.each([5, 'not-found'])(
  'a target deleted after the current read makes NOT_FOUND terminal (%s)',
  async code => {
    const trusted = new MockMemoryTimestamp(10, 123_000_900);
    const data = { sender_id: 'sender' };
    const notFound = Object.assign(new Error('No document to update'), { code });
    let current;
    const ref = {
      get: jest.fn(async () => current),
      update: jest.fn(async () => { throw notFound; }),
    };
    current = {
      exists: true,
      createTime: trusted,
      data: () => data,
      ref,
    };
    const advanceSender = jest.fn();

    await expect(reconcileUnreadTimestampCreate({
      db: new MemoryFirestore(),
      snapshot: current,
      kind: 'message',
      senderCursor: { clubId: 'c', section: 'teams', scopeId: 'general' },
      advanceSender,
    })).resolves.toEqual({ skipped: 'deleted' });

    expect(ref.update).toHaveBeenCalledTimes(1);
    expect(advanceSender).not.toHaveBeenCalled();
  },
);

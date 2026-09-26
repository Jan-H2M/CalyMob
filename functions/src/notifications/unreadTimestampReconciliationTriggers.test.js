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
  const snapshot = {
    exists: true,
    createTime: trusted,
    data: () => db.docs.get(path),
    ref: {
      update: async updates => {
        attempts++;
        if (attempts === 1) throw new Error('transient');
        await ref.update(updates);
      },
    },
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
  db.docs.set(path, { sender_id: 'sender' });
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

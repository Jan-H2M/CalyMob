const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const {
  TEAM_MESSAGE_RETENTION_DAYS,
  EVENT_MESSAGE_RETENTION_DAYS,
  SESSION_MESSAGE_RETENTION_DAYS,
} = require('../utils/constants');

function cutoffTimestamp(days) {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - (days * 24 * 60 * 60 * 1000)),
  );
}

function extractStoragePaths(data = {}) {
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  return attachments
    .map((attachment) => attachment && attachment.storage_path)
    .filter(Boolean);
}

async function deleteFiles(storagePaths = []) {
  if (storagePaths.length === 0) return;

  const bucket = admin.storage().bucket();
  await Promise.all(
    storagePaths.map(async (storagePath) => {
      try {
        await bucket.file(storagePath).delete({ ignoreNotFound: true });
      } catch (error) {
        console.warn(`Failed to delete storage object ${storagePath}: ${error.message}`);
      }
    }),
  );
}

async function cleanupCollection(query) {
  const snapshot = await query.get();
  if (snapshot.empty) return 0;

  const batch = admin.firestore().batch();
  const storagePaths = [];

  snapshot.docs.forEach((doc) => {
    storagePaths.push(...extractStoragePaths(doc.data()));
    batch.delete(doc.ref);
  });

  await batch.commit();
  await deleteFiles(storagePaths);
  return snapshot.size;
}

exports.cleanupOldMessages = onSchedule(
  {
    schedule: '0 3 * * 1',
    timeZone: 'Europe/Brussels',
    region: 'europe-west1',
  },
  async () => {
    const db = admin.firestore();
    const clubsSnapshot = await db.collection('clubs').get();

    let deletedTeamMessages = 0;
    let deletedEventMessages = 0;
    let deletedSessionMessages = 0;

    for (const clubDoc of clubsSnapshot.docs) {
      const clubId = clubDoc.id;

      const teamChannelsSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('team_channels')
        .get();

      for (const channelDoc of teamChannelsSnapshot.docs) {
        deletedTeamMessages += await cleanupCollection(
          channelDoc.ref
            .collection('messages')
            .where('created_at', '<', cutoffTimestamp(TEAM_MESSAGE_RETENTION_DAYS)),
        );
      }

      const operationsSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .get();

      for (const operationDoc of operationsSnapshot.docs) {
        deletedEventMessages += await cleanupCollection(
          operationDoc.ref
            .collection('messages')
            .where('created_at', '<', cutoffTimestamp(EVENT_MESSAGE_RETENTION_DAYS)),
        );
      }

      const sessionsSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .get();

      for (const sessionDoc of sessionsSnapshot.docs) {
        deletedSessionMessages += await cleanupCollection(
          sessionDoc.ref
            .collection('messages')
            .where('created_at', '<', cutoffTimestamp(SESSION_MESSAGE_RETENTION_DAYS)),
        );
      }
    }

    console.log(
      `cleanupOldMessages finished: team=${deletedTeamMessages}, event=${deletedEventMessages}, session=${deletedSessionMessages}`,
    );
  },
);

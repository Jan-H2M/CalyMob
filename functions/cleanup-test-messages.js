/**
 * Script to delete all test messages from event chats
 * Run with: node cleanup-test-messages.js
 */

const admin = require('firebase-admin');

// Initialize with application default credentials
admin.initializeApp({
  projectId: 'calycompta'
});

const db = admin.firestore();

async function cleanupTestMessages() {
  console.log('🧹 Starting cleanup of test messages...\n');

  try {
    // Get all operations
    const operationsSnapshot = await db
      .collection('clubs/calypso/operations')
      .get();

    let totalDeleted = 0;

    for (const operationDoc of operationsSnapshot.docs) {
      const operationId = operationDoc.id;
      const operationData = operationDoc.data();
      const operationTitle = operationData.titre || operationData.title || 'Unknown';

      // Get all messages for this operation
      const messagesSnapshot = await db
        .collection(`clubs/calypso/operations/${operationId}/messages`)
        .get();

      if (messagesSnapshot.empty) continue;

      const batch = db.batch();
      let count = 0;

      messagesSnapshot.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      if (count > 0) {
        await batch.commit();
        totalDeleted += count;
        console.log(`✅ Deleted ${count} messages from "${operationTitle}"`);
      }
    }

    console.log(`\n🎉 Done! Deleted ${totalDeleted} messages total.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

cleanupTestMessages();

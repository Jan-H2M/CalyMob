#!/usr/bin/env node
/**
 * Script om push notification flow te testen
 * Simuleert wat de Cloud Function doet
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testNotificationFlow() {
  const clubId = 'calypso';

  console.log('🔍 Testing notification flow...\n');

  // 1. Find an open operation with inscriptions
  const operationsSnapshot = await db.collection(`clubs/${clubId}/operations`)
    .where('statut', '==', 'ouvert')
    .limit(1)
    .get();

  if (operationsSnapshot.empty) {
    console.log('❌ No open operations found');
    process.exit(1);
  }

  const opDoc = operationsSnapshot.docs[0];
  const operation = opDoc.data();
  console.log(`📅 Operation: ${operation.titre} (${opDoc.id})`);
  console.log(`   titre field: ${operation.titre}`);
  console.log(`   title field: ${operation.title}`);

  // 2. Get inscriptions
  const inscriptionsSnapshot = await db.collection(`clubs/${clubId}/operations/${opDoc.id}/inscriptions`).get();
  console.log(`\n👥 Found ${inscriptionsSnapshot.size} inscriptions`);

  if (inscriptionsSnapshot.empty) {
    console.log('❌ No inscriptions found');
    process.exit(1);
  }

  // 3. Check each inscription and their member FCM tokens
  console.log('\n--- Checking members and FCM tokens ---');

  for (const inscDoc of inscriptionsSnapshot.docs) {
    const inscData = inscDoc.data();
    const membreId = inscData.membre_id;

    console.log(`\n📝 Inscription: ${inscDoc.id}`);
    console.log(`   membre_id: ${membreId}`);
    console.log(`   membre_nom: ${inscData.membre_nom}`);
    console.log(`   membre_prenom: ${inscData.membre_prenom}`);

    if (!membreId) {
      console.log('   ⚠️  No membre_id in inscription!');
      continue;
    }

    // Get member document
    const memberDoc = await db.collection(`clubs/${clubId}/members`).doc(membreId).get();

    if (!memberDoc.exists) {
      console.log(`   ❌ Member document not found for ${membreId}`);
      continue;
    }

    const memberData = memberDoc.data();
    console.log(`   ✅ Member found: ${memberData.prenom} ${memberData.nom}`);
    console.log(`   📱 fcm_token: ${memberData.fcm_token ? memberData.fcm_token.substring(0, 30) + '...' : '(not set)'}`);
    console.log(`   🔔 notifications_enabled: ${memberData.notifications_enabled}`);

    if (memberData.fcm_tokens) {
      console.log(`   📱 fcm_tokens array: ${memberData.fcm_tokens.length} token(s)`);
    }
  }

  // 4. Check messages subcollection
  const messagesSnapshot = await db.collection(`clubs/${clubId}/operations/${opDoc.id}/messages`).get();
  console.log(`\n💬 Found ${messagesSnapshot.size} messages in this operation`);

  if (!messagesSnapshot.empty) {
    const lastMessage = messagesSnapshot.docs[messagesSnapshot.docs.length - 1];
    const msgData = lastMessage.data();
    console.log(`   Last message from: ${msgData.sender_name} (${msgData.sender_id})`);
    console.log(`   Message: ${msgData.message?.substring(0, 50)}...`);
  }

  console.log('\n\n✅ Done!');
  process.exit(0);
}

testNotificationFlow().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * delete_all_messages.cjs
 *
 * Deletes ALL messages from ALL categories in Firestore for the Calypso club.
 * Categories:
 *   1. Event messages:   clubs/calypso/operations/{id}/messages/*
 *   2. Announcements:    clubs/calypso/announcements/* + replies subcollection
 *   3. Team messages:    clubs/calypso/team_channels/{id}/messages/*
 *   4. Session messages: clubs/calypso/piscine_sessions/{id}/messages/*
 *
 * Also resets unread_counts on all member documents.
 *
 * Usage:
 *   node scripts/delete_all_messages.cjs
 *   node scripts/delete_all_messages.cjs --dry-run   (preview without deleting)
 */

const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────
const CLUB_ID = 'calypso';
const BATCH_LIMIT = 500;
const DRY_RUN = process.argv.includes('--dry-run');

// ── Firebase Admin Setup (same pattern as update_firestore_version.cjs) ─
const functionsPath = path.join(__dirname, '../functions');
const admin = require(path.join(functionsPath, 'node_modules/firebase-admin'));

function initFirebase() {
  const possiblePaths = [
    '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(__dirname, '../functions/service-account-key.json'),
  ].filter(Boolean);

  for (const saPath of possiblePaths) {
    if (fs.existsSync(saPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
      console.log(`✅ Firebase initialized with service account: ${path.basename(saPath)}`);
      return admin.firestore();
    }
  }

  // Fallback: Application Default Credentials
  admin.initializeApp({ projectId: 'calycompta' });
  console.log('✅ Firebase initialized with Application Default Credentials');
  return admin.firestore();
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function deleteCollection(db, collectionRef, label) {
  let totalDeleted = 0;
  let snapshot;

  do {
    snapshot = await collectionRef.limit(BATCH_LIMIT).get();
    if (snapshot.empty) break;

    if (DRY_RUN) {
      totalDeleted += snapshot.size;
      console.log(`  [DRY RUN] Would delete ${snapshot.size} docs from ${label}`);
      break; // In dry-run, just count the first batch
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`  Deleted ${snapshot.size} docs from ${label} (total: ${totalDeleted})`);
  } while (snapshot.size === BATCH_LIMIT);

  return totalDeleted;
}

async function deleteSubcollectionMessages(db, parentCollectionPath, subcollectionName, categoryLabel) {
  const parentSnap = await db.collection(parentCollectionPath).get();
  let grandTotal = 0;

  if (parentSnap.empty) {
    console.log(`  No parent documents found in ${parentCollectionPath}`);
    return 0;
  }

  console.log(`  Found ${parentSnap.size} parent documents in ${categoryLabel}`);

  for (const parentDoc of parentSnap.docs) {
    const subRef = parentDoc.ref.collection(subcollectionName);
    const count = await deleteCollection(
      db,
      subRef,
      `${categoryLabel}/${parentDoc.id}/${subcollectionName}`
    );
    grandTotal += count;
  }

  return grandTotal;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     DELETE ALL MESSAGES — Calypso Diving Club       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE — no data will be deleted\n');
  } else {
    console.log('⚠️  LIVE MODE — messages will be permanently deleted!\n');
  }

  const db = initFirebase();
  const clubRef = `clubs/${CLUB_ID}`;
  const results = {};

  // 1. Event Messages
  console.log('\n📧 1/4 — Event Messages');
  results.eventMessages = await deleteSubcollectionMessages(
    db,
    `${clubRef}/operations`,
    'messages',
    'Event Messages'
  );

  // 2. Announcements + Replies
  console.log('\n📢 2/4 — Announcements');
  // First delete all replies subcollections
  const announcementsSnap = await db.collection(`${clubRef}/announcements`).get();
  let repliesDeleted = 0;
  if (!announcementsSnap.empty) {
    console.log(`  Found ${announcementsSnap.size} announcements`);
    for (const annDoc of announcementsSnap.docs) {
      const repliesRef = annDoc.ref.collection('replies');
      repliesDeleted += await deleteCollection(db, repliesRef, `Announcements/${annDoc.id}/replies`);
    }
  }
  // Then delete the announcements themselves
  const announcementsDeleted = await deleteCollection(
    db,
    db.collection(`${clubRef}/announcements`),
    'Announcements'
  );
  results.announcements = announcementsDeleted;
  results.announcementReplies = repliesDeleted;

  // 3. Team Channel Messages
  console.log('\n💬 3/4 — Team Channel Messages');
  results.teamMessages = await deleteSubcollectionMessages(
    db,
    `${clubRef}/team_channels`,
    'messages',
    'Team Channels'
  );

  // 4. Session Messages (Piscine)
  console.log('\n🏊 4/4 — Session Messages');
  results.sessionMessages = await deleteSubcollectionMessages(
    db,
    `${clubRef}/piscine_sessions`,
    'messages',
    'Session Messages'
  );

  // 5. Reset unread counts on all members
  console.log('\n🔔 Resetting unread counts on members...');
  const membersSnap = await db.collection(`${clubRef}/members`).get();
  let membersReset = 0;
  if (!membersSnap.empty) {
    // Process in batches
    const memberDocs = membersSnap.docs;
    for (let i = 0; i < memberDocs.length; i += BATCH_LIMIT) {
      const chunk = memberDocs.slice(i, i + BATCH_LIMIT);
      if (!DRY_RUN) {
        const batch = db.batch();
        for (const memberDoc of chunk) {
          batch.update(memberDoc.ref, {
            'unread_counts': {
              event_messages: 0,
              announcements: 0,
              team_messages: 0,
              session_messages: 0,
              total: 0,
            },
          });
        }
        await batch.commit();
      }
      membersReset += chunk.length;
    }
    console.log(`  ${DRY_RUN ? '[DRY RUN] Would reset' : 'Reset'} unread counts for ${membersReset} members`);
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Event messages deleted:    ${results.eventMessages}`);
  console.log(`  Announcements deleted:     ${results.announcements}`);
  console.log(`  Announcement replies:      ${results.announcementReplies}`);
  console.log(`  Team messages deleted:     ${results.teamMessages}`);
  console.log(`  Session messages deleted:  ${results.sessionMessages}`);
  console.log(`  Members unread reset:      ${membersReset}`);
  const total = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`  ─────────────────────────────────`);
  console.log(`  TOTAL documents deleted:   ${total}`);
  if (DRY_RUN) {
    console.log('\n🔍 This was a dry run. Run without --dry-run to actually delete.');
  } else {
    console.log('\n✅ All messages have been deleted successfully!');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

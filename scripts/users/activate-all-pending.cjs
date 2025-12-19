#!/usr/bin/env node

/**
 * Automatic Activation Script - NO USER INPUT REQUIRED
 *
 * Activates ALL pending members automatically
 * Can be called from UI or terminal
 *
 * Usage:
 *   node scripts/activate-all-pending.cjs
 *   node scripts/activate-all-pending.cjs <email>  // Activate specific user
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso';
const DEFAULT_PASSWORD = '123456';

/**
 * Activate a single user
 */
async function activateUser(memberId, memberData) {
  try {
    console.log(`\n🔄 Activating: ${memberData.email}...`);

    // Check if Firebase Auth account already exists
    try {
      await admin.auth().getUser(memberId);
      console.log(`⚠️  Firebase Auth already exists for ${memberData.email}`);
      return { success: false, reason: 'already-exists' };
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
      // User doesn't exist, continue with creation
    }

    // Create Firebase Auth account
    const userRecord = await admin.auth().createUser({
      uid: memberId,
      email: memberData.email,
      password: DEFAULT_PASSWORD,
      displayName: memberData.displayName || `${memberData.prenom} ${memberData.nom}`,
      emailVerified: false,
      disabled: false,
    });

    console.log(`   ✓ Firebase Auth created (UID: ${userRecord.uid})`);

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: memberData.role,
      clubId: CLUB_ID,
    });

    console.log(`   ✓ Custom claims set (role: ${memberData.role})`);

    // Update Firestore
    const memberRef = db.collection('clubs').doc(CLUB_ID).collection('members').doc(memberId);
    const now = admin.firestore.Timestamp.now();

    await memberRef.update({
      isActive: true,
      'metadata.pendingActivation': admin.firestore.FieldValue.delete(),
      updatedAt: now,
    });

    console.log(`   ✓ Firestore updated`);

    // Create audit log
    await db.collection('clubs').doc(CLUB_ID).collection('audit_logs').add({
      userId: memberId,
      userEmail: memberData.email,
      action: 'USER_ACTIVATED',
      targetId: memberId,
      targetType: 'user',
      targetName: memberData.displayName || `${memberData.prenom} ${memberData.nom}`,
      details: {
        activatedBy: 'Auto-activation script',
        defaultPassword: DEFAULT_PASSWORD,
      },
      timestamp: now,
      clubId: CLUB_ID,
      severity: 'info',
    });

    console.log(`   ✓ Audit log created`);
    console.log(`✅ SUCCESS: ${memberData.email} activated!`);
    console.log(`   Password: ${DEFAULT_PASSWORD}`);

    return { success: true, email: memberData.email };
  } catch (error) {
    console.error(`❌ ERROR activating ${memberData.email}:`, error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  CalyCompta - Auto-Activate Pending Members');
    console.log('═══════════════════════════════════════════════════════════\n');

    const targetEmail = process.argv[2]; // Optional: specific email to activate

    // Get all pending members
    const membersRef = db.collection('clubs').doc(CLUB_ID).collection('members');
    let query = membersRef.where('metadata.pendingActivation', '==', true);

    if (targetEmail) {
      console.log(`🎯 Looking for: ${targetEmail}\n`);
      query = query.where('email', '==', targetEmail);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      if (targetEmail) {
        console.log(`❌ No pending member found with email: ${targetEmail}`);
      } else {
        console.log('✓ No pending members found. All done!');
      }
      process.exit(0);
    }

    console.log(`Found ${snapshot.size} member(s) awaiting activation:\n`);

    const results = {
      total: snapshot.size,
      success: 0,
      failed: 0,
      alreadyExists: 0
    };

    // Activate all pending members
    for (const doc of snapshot.docs) {
      const memberData = doc.data();
      const result = await activateUser(doc.id, memberData);

      if (result.success) {
        results.success++;
      } else if (result.reason === 'already-exists') {
        results.alreadyExists++;
      } else {
        results.failed++;
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total:           ${results.total}`);
    console.log(`✅ Activated:     ${results.success}`);
    console.log(`⚠️  Already exist: ${results.alreadyExists}`);
    console.log(`❌ Failed:        ${results.failed}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Script error:', error.message);
    process.exit(1);
  }
}

main();

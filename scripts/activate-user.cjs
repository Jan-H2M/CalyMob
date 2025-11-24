#!/usr/bin/env node

/**
 * Script to activate pending users (Firestore-only members → Firebase Auth)
 *
 * This script:
 * 1. Lists all members with pendingActivation: true
 * 2. Creates Firebase Auth account with default password: 123456
 * 3. Updates Firestore document (removes pendingActivation, sets isActive: true)
 * 4. User must change password on first login
 *
 * Usage:
 *   node scripts/activate-user.js
 *
 * Prerequisites:
 *   - Firebase Admin SDK initialized
 *   - Service account key: serviceAccountKey.json
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✓ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Error: serviceAccountKey.json not found');
    console.error('   Place your Firebase service account key at: serviceAccountKey.json');
    process.exit(1);
  }
}

const db = admin.firestore();
const auth = admin.auth();

// Default password for new accounts
const DEFAULT_PASSWORD = '123456';
const CLUB_ID = 'calypso';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * Get all pending activation members
 */
async function getPendingMembers() {
  try {
    const membersRef = db.collection(`clubs/${CLUB_ID}/members`);
    const snapshot = await membersRef.where('metadata.pendingActivation', '==', true).get();

    const members = [];
    snapshot.forEach(doc => {
      members.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return members;
  } catch (error) {
    console.error('❌ Error fetching pending members:', error.message);
    throw error;
  }
}

/**
 * Activate a member (create Firebase Auth + update Firestore)
 */
async function activateMember(member) {
  try {
    console.log(`\n🔄 Activating ${member.displayName} (${member.email})...`);

    // Step 1: Create Firebase Auth user
    console.log('   Creating Firebase Auth account...');
    const userRecord = await auth.createUser({
      uid: member.id, // Use Firestore document ID as Firebase Auth UID
      email: member.email,
      password: DEFAULT_PASSWORD,
      displayName: member.displayName,
      disabled: false
    });

    console.log(`   ✓ Firebase Auth account created (UID: ${userRecord.uid})`);

    // Step 2: Set custom claims (CRITICAL: must include status and isActive to prevent role reversion bug)
    console.log('   Setting custom claims...');
    await auth.setCustomUserClaims(userRecord.uid, {
      role: member.role,
      clubId: CLUB_ID,
      status: 'active',
      isActive: true
    });
    console.log(`   ✓ Custom claims set (role: ${member.role}, clubId: ${CLUB_ID}, status: active, isActive: true)`);

    // Step 3: Update Firestore document
    console.log('   Updating Firestore document...');
    const memberRef = db.doc(`clubs/${CLUB_ID}/members/${member.id}`);
    await memberRef.update({
      isActive: true,
      'metadata.pendingActivation': admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('   ✓ Firestore document updated');

    // Step 4: Create audit log
    console.log('   Creating audit log...');
    const auditRef = db.collection(`clubs/${CLUB_ID}/audit_logs`).doc();
    await auditRef.set({
      userId: 'system', // Script activation
      userEmail: member.email,
      action: 'USER_ACTIVATED',
      targetId: member.id,
      targetType: 'user',
      targetName: member.displayName,
      details: {
        activatedBy: 'activate-user.js script',
        defaultPassword: DEFAULT_PASSWORD
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      clubId: CLUB_ID,
      severity: 'info'
    });
    console.log('   ✓ Audit log created');

    console.log(`\n✅ SUCCESS: ${member.displayName} activated!`);
    console.log(`   Email: ${member.email}`);
    console.log(`   Temporary password: ${DEFAULT_PASSWORD}`);
    console.log(`   ⚠️  User must change password on first login\n`);

    return true;
  } catch (error) {
    console.error(`\n❌ ERROR activating ${member.displayName}:`, error.message);

    // If Firebase Auth creation failed, clean up
    if (error.code === 'auth/email-already-exists') {
      console.error('   This email already has a Firebase Auth account.');
      console.error('   Use the "Réinitialiser mot de passe" button in the UI instead.');
    }

    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  CalyCompta - Activate Pending Members');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get pending members
    console.log('🔍 Searching for members awaiting activation...\n');
    const pendingMembers = await getPendingMembers();

    if (pendingMembers.length === 0) {
      console.log('✓ No pending members found. All members are activated!\n');
      rl.close();
      return;
    }

    console.log(`Found ${pendingMembers.length} member(s) awaiting activation:\n`);

    // Display members
    pendingMembers.forEach((member, index) => {
      console.log(`  ${index + 1}. ${member.displayName} (${member.email})`);
      console.log(`     Role: ${member.role}`);
      console.log(`     Created: ${member.createdAt?.toDate?.()?.toLocaleDateString?.() || 'Unknown'}\n`);
    });

    // Ask which member to activate
    console.log('═══════════════════════════════════════════════════════════\n');
    const answer = await question('Enter member number to activate (or "all" for all members, "q" to quit): ');

    if (answer.toLowerCase() === 'q') {
      console.log('\n👋 Cancelled. No members activated.\n');
      rl.close();
      return;
    }

    let membersToActivate = [];

    if (answer.toLowerCase() === 'all') {
      membersToActivate = pendingMembers;
    } else {
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < pendingMembers.length) {
        membersToActivate = [pendingMembers[index]];
      } else {
        console.log('\n❌ Invalid selection. Exiting.\n');
        rl.close();
        return;
      }
    }

    // Confirm activation
    console.log(`\n⚠️  You are about to activate ${membersToActivate.length} member(s).`);
    console.log(`   Default password will be: ${DEFAULT_PASSWORD}`);
    console.log(`   Users must change their password on first login.\n`);

    const confirm = await question('Proceed? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('\n👋 Cancelled. No members activated.\n');
      rl.close();
      return;
    }

    // Activate members
    console.log('\n═══════════════════════════════════════════════════════════');
    let successCount = 0;

    for (const member of membersToActivate) {
      const success = await activateMember(member);
      if (success) successCount++;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n✅ Activation complete: ${successCount}/${membersToActivate.length} successful\n`);

    if (successCount > 0) {
      console.log('📋 Summary:');
      console.log(`   - ${successCount} member(s) can now log in`);
      console.log(`   - Default password: ${DEFAULT_PASSWORD}`);
      console.log(`   - Users should change their password after first login\n`);
    }

    rl.close();
  } catch (error) {
    console.error('\n❌ Script error:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Run script
main();

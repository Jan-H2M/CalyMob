#!/usr/bin/env node

/**
 * Sync Custom Claims Script
 *
 * PROBLEEM: Firebase Auth custom claims worden NIET automatisch gesynchroniseerd met Firestore.
 * Dit veroorzaakt een bug waarbij gebruikers soms met verkeerde rol inloggen
 * (na token refresh valt role terug naar 'user' als custom claims ontbreken).
 *
 * OPLOSSING: Dit script leest alle users uit Firestore en synchroniseert hun
 * role/clubId naar Firebase Auth custom claims.
 *
 * GEBRUIK:
 *   node scripts/sync-custom-claims.cjs [--dry-run] [--email=user@example.com]
 *
 * OPTIONS:
 *   --dry-run              Test mode - geen wijzigingen, alleen rapporteren
 *   --email=user@email.com Synchroniseer alleen deze specifieke gebruiker
 *
 * VOORBEELDEN:
 *   node scripts/sync-custom-claims.cjs                    # Sync alle users
 *   node scripts/sync-custom-claims.cjs --dry-run          # Test mode
 *   node scripts/sync-custom-claims.cjs --email=jan@x.com  # Sync één user
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const emailArg = args.find(arg => arg.startsWith('--email='));
const targetEmail = emailArg ? emailArg.split('=')[1] : null;

// Load service account key
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found at:', serviceAccountPath);
  console.error('   Please download it from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount),
  projectId: 'calycompta'
});

const auth = getAuth();
const db = getFirestore();

/**
 * Get custom claims from Firestore member document
 */
function getClaimsFromMemberDoc(memberData) {
  return {
    role: memberData.app_role || memberData.role || 'user',
    clubId: memberData.clubId || 'calypso',
    status: memberData.app_status || memberData.status || 'active',
    isActive: memberData.isActive !== false && memberData.actif !== false
  };
}

/**
 * Check if custom claims need updating
 */
function claimsNeedUpdate(currentClaims, newClaims) {
  if (!currentClaims) return true;

  return currentClaims.role !== newClaims.role ||
         currentClaims.clubId !== newClaims.clubId ||
         currentClaims.status !== newClaims.status ||
         currentClaims.isActive !== newClaims.isActive;
}

/**
 * Sync custom claims for a single user
 */
async function syncUserClaims(memberId, memberData, clubId) {
  const email = memberData.email;

  try {
    // Get Firebase Auth user
    let authUser;
    try {
      authUser = await auth.getUser(memberId);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(`   ⚠️  SKIPPED: Firebase Auth user not found for ${email}`);
        console.log(`       (Firestore member exists but no Firebase Auth account)`);
        return { skipped: true, reason: 'no-auth-user' };
      }
      throw error;
    }

    // Calculate new claims from Firestore data
    const newClaims = getClaimsFromMemberDoc(memberData);
    const currentClaims = authUser.customClaims || {};

    // Check if update needed
    if (!claimsNeedUpdate(currentClaims, newClaims)) {
      console.log(`   ✓ UP-TO-DATE: ${email} (${newClaims.role})`);
      return { updated: false };
    }

    // Show what will change
    console.log(`   🔄 UPDATE NEEDED: ${email}`);
    console.log(`      Current claims:`, JSON.stringify(currentClaims, null, 2).replace(/\n/g, '\n      '));
    console.log(`      New claims:`, JSON.stringify(newClaims, null, 2).replace(/\n/g, '\n      '));

    if (dryRun) {
      console.log(`      [DRY RUN] Would set custom claims`);
      return { updated: true, dryRun: true };
    }

    // Set custom claims
    await auth.setCustomUserClaims(memberId, newClaims);
    console.log(`      ✅ Custom claims updated`);

    return { updated: true };

  } catch (error) {
    console.error(`   ❌ ERROR: ${email}`, error.message);
    return { error: true, message: error.message };
  }
}

/**
 * Sync all users in a club
 */
async function syncClubUsers(clubId) {
  console.log(`\n📂 Processing club: ${clubId}`);
  console.log('━'.repeat(80));

  const membersRef = db.collection('clubs').doc(clubId).collection('members');
  const snapshot = await membersRef.get();

  console.log(`Found ${snapshot.size} members in Firestore\n`);

  const stats = {
    total: snapshot.size,
    updated: 0,
    upToDate: 0,
    skipped: 0,
    errors: 0
  };

  for (const doc of snapshot.docs) {
    const memberData = doc.data();
    const memberId = doc.id;

    // Skip if filtering by email and this isn't the target
    if (targetEmail && memberData.email !== targetEmail) {
      continue;
    }

    const result = await syncUserClaims(memberId, memberData, clubId);

    if (result.error) {
      stats.errors++;
    } else if (result.skipped) {
      stats.skipped++;
    } else if (result.updated) {
      stats.updated++;
    } else {
      stats.upToDate++;
    }
  }

  return stats;
}

/**
 * Main function
 */
async function main() {
  console.log('🔄 Sync Custom Claims');
  console.log('━'.repeat(80));

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
  }

  if (targetEmail) {
    console.log(`🎯 Filtering by email: ${targetEmail}`);
  }

  console.log('━'.repeat(80));

  try {
    // Sync all clubs (we only have 'calypso' for now, but this is extensible)
    const clubIds = ['calypso'];
    let totalStats = {
      total: 0,
      updated: 0,
      upToDate: 0,
      skipped: 0,
      errors: 0
    };

    for (const clubId of clubIds) {
      const stats = await syncClubUsers(clubId);

      totalStats.total += stats.total;
      totalStats.updated += stats.updated;
      totalStats.upToDate += stats.upToDate;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
    }

    // Summary
    console.log('\n' + '━'.repeat(80));
    console.log('📊 SUMMARY');
    console.log('━'.repeat(80));
    console.log(`Total members:       ${totalStats.total}`);
    console.log(`✅ Updated:          ${totalStats.updated}${dryRun ? ' (would be)' : ''}`);
    console.log(`✓  Already up-to-date: ${totalStats.upToDate}`);
    console.log(`⚠️  Skipped:          ${totalStats.skipped}`);
    console.log(`❌ Errors:           ${totalStats.errors}`);
    console.log('━'.repeat(80));

    if (dryRun) {
      console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
    } else if (totalStats.updated > 0) {
      console.log('\n💡 Users must log out and log back in for changes to take effect.');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

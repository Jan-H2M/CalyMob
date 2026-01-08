#!/usr/bin/env node
/**
 * Update app version in Firestore (CalyCompta maintenance page)
 * This script is called by bump_version.sh to sync mobile version with web admin
 *
 * Usage: node update_firestore_version.js <version>
 * Example: node update_firestore_version.js 1.0.13
 */

const path = require('path');

// Load firebase-admin from functions directory
const functionsPath = path.join(__dirname, '../functions');
const admin = require(path.join(functionsPath, 'node_modules/firebase-admin'));

// Initialize Firebase Admin with service account
// Tries multiple locations in order:
// 1. Hardcoded path (Jan's machine)
// 2. Environment variable GOOGLE_APPLICATION_CREDENTIALS
// 3. Application Default Credentials (gcloud)

const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '../functions/service-account-key.json')
].filter(Boolean);

let initialized = false;

// Try service account files first
for (const serviceAccountPath of possibleServiceAccountPaths) {
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log('✅ Firebase Admin initialized with service account');
    initialized = true;
    break;
  } catch (error) {
    // Continue to next path
    continue;
  }
}

// If no service account found, try Application Default Credentials
if (!initialized) {
  try {
    admin.initializeApp({
      projectId: 'calycompta'
    });
    console.log('✅ Firebase Admin initialized with Application Default Credentials');
    initialized = true;
  } catch (error) {
    console.error('❌ Error: Could not initialize Firebase Admin');
    console.error('   Tried the following methods:');
    console.error('   1. Service account at hardcoded path');
    console.error('   2. GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.error('   3. Application Default Credentials (run: gcloud auth application-default login)');
    console.error('');
    console.error('   For manual update, visit: https://caly.club/parametres/maintenance');
    process.exit(1);
  }
}

const db = admin.firestore();

async function updateVersionInFirestore(version, buildNumber) {
  if (!version) {
    console.error('❌ Error: Version argument is required');
    console.error('Usage: node update_firestore_version.cjs <version> [buildNumber]');
    console.error('Example: node update_firestore_version.cjs 1.0.13 70');
    process.exit(1);
  }

  // Validate version format (e.g., 1.0.12)
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`❌ Error: Invalid version format "${version}"`);
    console.error('   Expected format: X.Y.Z (e.g., 1.0.12)');
    process.exit(1);
  }

  try {
    const displayVersion = buildNumber ? `${version} (build ${buildNumber})` : version;
    console.log(`\n📱 Updating Firestore version to ${displayVersion}...`);

    const versionData = {
      version: version,
      forceRefresh: false,
      message: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'mobile_build_script'
    };

    // Add build number if provided
    if (buildNumber) {
      versionData.buildNumber = parseInt(buildNumber);
    }

    await db.collection('settings').doc('app_version').set(versionData);

    console.log(`✅ Firestore version updated to ${displayVersion}`);
    console.log('   Users will see this in CalyCompta > Paramètres > Maintenance');

    // Clean up
    await admin.app().delete();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error updating Firestore:', error.message);
    process.exit(1);
  }
}

// Get version and optional build number from command line arguments
const version = process.argv[2];
const buildNumber = process.argv[3];
updateVersionInFirestore(version, buildNumber);

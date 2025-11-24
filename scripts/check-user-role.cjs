const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Initialize Firebase Admin with service account
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth();
const db = getFirestore();

async function checkUserRole(email) {
  try {
    console.log(`\n🔍 Checking user: ${email}`);
    console.log('━'.repeat(60));

    // Get Firebase Auth user
    const userRecord = await auth.getUserByEmail(email);
    console.log(`\n📋 Firebase Auth Info:`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Display Name: ${userRecord.displayName}`);

    // Check custom claims
    console.log(`\n🔐 Custom Claims:`);
    if (userRecord.customClaims) {
      console.log(`   Role: ${userRecord.customClaims.role || '❌ NOT SET'}`);
      console.log(`   Club ID: ${userRecord.customClaims.clubId || '❌ NOT SET'}`);
    } else {
      console.log('   ❌ NO CUSTOM CLAIMS SET');
    }

    // Get Firestore document
    const memberRef = db.collection('clubs').doc('calypso').collection('members').doc(userRecord.uid);
    const memberDoc = await memberRef.get();

    console.log(`\n📄 Firestore Document:`);
    if (!memberDoc.exists) {
      console.log('   ❌ DOCUMENT DOES NOT EXIST');
      return { userRecord, firestoreData: null };
    }

    const data = memberDoc.data();
    console.log(`   Path: clubs/calypso/members/${userRecord.uid}`);
    console.log(`   app_role: ${data.app_role || '❌ NOT SET'}`);
    console.log(`   role (legacy): ${data.role || '❌ NOT SET'}`);
    console.log(`   app_status: ${data.app_status || '❌ NOT SET'}`);
    console.log(`   member_status: ${data.member_status || '❌ NOT SET'}`);
    console.log(`   has_app_access: ${data.has_app_access !== undefined ? data.has_app_access : '❌ NOT SET'}`);
    console.log(`   status (legacy): ${data.status || '❌ NOT SET'}`);
    console.log(`   isActive (legacy): ${data.isActive !== undefined ? data.isActive : '❌ NOT SET'}`);

    console.log('\n━'.repeat(60));

    // Analyze issues
    const issues = [];
    if (!userRecord.customClaims?.role) {
      issues.push('⚠️  Custom claims role is missing');
    }
    if (!userRecord.customClaims?.clubId) {
      issues.push('⚠️  Custom claims clubId is missing');
    }
    if (!data.app_role) {
      issues.push('⚠️  Firestore app_role is missing');
    }
    if (!data.app_status) {
      issues.push('⚠️  Firestore app_status is missing');
    }
    if (data.has_app_access !== true) {
      issues.push('⚠️  has_app_access is not set to true');
    }

    if (issues.length > 0) {
      console.log('\n🚨 Issues Found:');
      issues.forEach(issue => console.log(`   ${issue}`));
    } else {
      console.log('\n✅ All checks passed!');
    }

    return { userRecord, firestoreData: data };

  } catch (error) {
    console.error(`❌ Error checking user:`, error.message);
    throw error;
  }
}

// Check your user
checkUserRole('jan.andriessens@gmail.com')
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });

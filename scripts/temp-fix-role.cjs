const admin = require('firebase-admin');
const serviceAccount = require('../../calycompta-firebase-adminsdk-fbsvc-b8af38e545.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function checkAndFixUser() {
  const email = 'jan.andriessens@gmail.com';

  try {
    // Get user from Auth
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('=== FIREBASE AUTH ===');
    console.log('UID:', userRecord.uid);
    console.log('Custom Claims:', JSON.stringify(userRecord.customClaims, null, 2));

    // Get user from Firestore
    const memberRef = admin.firestore()
      .collection('clubs')
      .doc('calypso')
      .collection('members')
      .doc(userRecord.uid);

    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      console.log('ERROR: User not found in Firestore');
      return;
    }

    const data = memberDoc.data();
    console.log('\n=== FIRESTORE ===');
    console.log('Role (app_role):', data.app_role || data.role);
    console.log('Status (app_status):', data.app_status || data.status);
    console.log('isActive:', data.isActive);

    // Check mismatch
    const claimsRole = userRecord.customClaims?.role;
    const firestoreRole = data.app_role || data.role;
    console.log('\n=== COMPARISON ===');
    console.log('Claims role:', claimsRole);
    console.log('Firestore role:', firestoreRole);
    console.log('MATCH:', claimsRole === firestoreRole ? 'YES' : 'NO - NEEDS FIX');

    if (claimsRole !== firestoreRole) {
      console.log('\n=== FIXING ===');
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        role: firestoreRole,
        status: data.app_status || data.status || 'active',
        clubId: 'calypso',
        isActive: data.isActive !== false
      });
      console.log('✅ Custom claims updated to match Firestore!');
      console.log('   Role:', firestoreRole);
      console.log('➜ User moet uitloggen en opnieuw inloggen om de wijzigingen te zien.');
    } else {
      console.log('\n✅ Custom claims are already correct!');
    }
  } catch (error) {
    console.error('ERROR:', error.message);
  }

  process.exit(0);
}

checkAndFixUser();

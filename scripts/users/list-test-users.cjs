const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso';

async function listUsers() {
  console.log('📋 Listing test users...\n');

  const membersRef = db.collection('clubs').doc(CLUB_ID).collection('members');
  const snapshot = await membersRef.get();

  const testUsers = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.email && (
      data.email.includes('test') ||
      data.email.includes('demo') ||
      data.email.includes('TEST') ||
      data.prenom?.includes('TEST') ||
      data.nom?.includes('TEST')
    )) {
      testUsers.push({
        id: doc.id,
        email: data.email,
        nom: data.nom,
        prenom: data.prenom,
        role: data.role,
        status: data.status
      });
    }
  });

  if (testUsers.length === 0) {
    console.log('✅ No test users found');
    return;
  }

  console.log(`Found ${testUsers.length} test users:\n`);
  testUsers.forEach((user, i) => {
    console.log(`${i + 1}. ${user.prenom} ${user.nom}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   ID: ${user.id}\n`);
  });
}

listUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

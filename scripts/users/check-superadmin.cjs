#!/usr/bin/env node

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'calycompta',
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.projectId,
});

const db = admin.firestore();

async function checkSuperadmin() {
  console.log('\n🔍 Checking for superadmin users...\n');

  try {
    const membersSnapshot = await db
      .collection('clubs')
      .doc('calypso')
      .collection('members')
      .where('role', '==', 'superadmin')
      .get();

    console.log(`Total members with role 'superadmin': ${membersSnapshot.size}\n`);

    if (membersSnapshot.empty) {
      console.log('❌ No superadmin members found!');
      console.log('\nChecking all members...\n');

      const allMembers = await db
        .collection('clubs')
        .doc('calypso')
        .collection('members')
        .get();

      console.log(`Total members: ${allMembers.size}\n`);

      allMembers.docs.forEach(doc => {
        const data = doc.data();
        console.log(`- ${data.prenom} ${data.nom} (${data.email})`);
        console.log(`  Role: ${data.role}`);
        console.log(`  Active: ${data.isActive}`);
        console.log('');
      });
    } else {
      membersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`✓ ${data.prenom} ${data.nom}`);
        console.log(`  Email: ${data.email}`);
        console.log(`  Role: ${data.role}`);
        console.log(`  Active: ${data.isActive}`);
        console.log(`  Document ID: ${doc.id}`);
        console.log('');
      });

      // Now check with isActive filter
      const activeSuper = await db
        .collection('clubs')
        .doc('calypso')
        .collection('members')
        .where('role', '==', 'superadmin')
        .where('isActive', '==', true)
        .get();

      console.log(`\n📬 Active superadmin members: ${activeSuper.size}\n`);

      activeSuper.docs.forEach(doc => {
        const data = doc.data();
        console.log(`✅ ${data.prenom} ${data.nom} (${data.email})`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

checkSuperadmin();

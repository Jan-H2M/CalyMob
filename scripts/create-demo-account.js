#!/usr/bin/env node
/**
 * Script om een demo account aan te maken voor App Store/Play Store reviewers
 *
 * METHODE 1: Via dit script (vereist service account key)
 *   1. Download service account key van Firebase Console:
 *      Firebase Console > Project Settings > Service Accounts > Generate new private key
 *   2. Sla op als: CalyMob/functions/certs/serviceAccountKey.json
 *   3. Voer uit:
 *      cd CalyMob && npm install firebase-admin && node scripts/create-demo-account.js
 *
 * METHODE 2: Via Firebase Console (handmatig, geen script nodig)
 *   Zie de instructies onderaan dit bestand.
 */

// Check of firebase-admin beschikbaar is
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.log('\n⚠️  firebase-admin niet geïnstalleerd.');
  console.log('   Installeer met: npm install firebase-admin\n');
  console.log('   Of volg de handmatige instructies onderaan dit bestand.\n');
  showManualInstructions();
  process.exit(1);
}

const path = require('path');
const fs = require('fs');

// Configuratie
const CONFIG = {
  email: 'demo.reviewer@calypsodc.be',
  password: 'CalyMob2025!',
  clubId: 'calypso',
  member: {
    nom: 'App Store Reviewer',
    prenom: 'Demo',
    email: 'demo.reviewer@calypsodc.be',
    niveau: '1*',
    clubStatuten: [],
    app_role: null,
    phone_number: null,
    photo_url: null,
    share_email: true,
    share_phone: false,
    notifications_enabled: false,
    app_installed: true,
    is_demo_account: true,
  }
};

function showManualInstructions() {
  console.log('=' .repeat(60));
  console.log('📋 HANDMATIGE INSTRUCTIES VOOR DEMO ACCOUNT\n');
  console.log('STAP 1: Firebase Authentication');
  console.log('-------------------------------');
  console.log('1. Ga naar: https://console.firebase.google.com/project/calycompta/authentication/users');
  console.log('2. Klik "Add user"');
  console.log(`3. Email: ${CONFIG.email}`);
  console.log(`4. Password: ${CONFIG.password}`);
  console.log('5. Klik "Add user" en noteer de User UID\n');

  console.log('STAP 2: Firestore Database');
  console.log('--------------------------');
  console.log('1. Ga naar: https://console.firebase.google.com/project/calycompta/firestore');
  console.log('2. Navigeer naar: clubs > calypso > members');
  console.log('3. Klik "+ Add document"');
  console.log('4. Document ID: [plak de User UID van stap 1]');
  console.log('5. Voeg deze velden toe:');
  console.log('');
  Object.entries(CONFIG.member).forEach(([key, value]) => {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const displayValue = value === null ? 'null' : JSON.stringify(value);
    console.log(`   ${key}: ${displayValue} (${type})`);
  });
  console.log('   created_at: [server timestamp]');
  console.log('   updated_at: [server timestamp]');
  console.log('');
  console.log('STAP 3: Test het account');
  console.log('------------------------');
  console.log('1. Open CalyMob app');
  console.log(`2. Log in met: ${CONFIG.email} / ${CONFIG.password}`);
  console.log('3. Controleer dat alle schermen werken\n');
  console.log('=' .repeat(60));
}

async function initializeFirebase() {
  const possiblePaths = [
    path.join(__dirname, '../functions/certs/serviceAccountKey.json'),
    path.join(__dirname, '../functions/certs/calycompta-firebase-adminsdk.json'),
    path.join(__dirname, '../serviceAccountKey.json'),
  ];

  let serviceAccountPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serviceAccountPath = p;
      break;
    }
  }

  if (!serviceAccountPath) {
    console.log('\n❌ Geen service account key gevonden!\n');
    console.log('Download een service account key van Firebase Console:');
    console.log('1. Ga naar: https://console.firebase.google.com/project/calycompta/settings/serviceaccounts/adminsdk');
    console.log('2. Klik "Generate new private key"');
    console.log('3. Sla op als: CalyMob/functions/certs/serviceAccountKey.json');
    console.log('4. Voer dit script opnieuw uit\n');
    console.log('Of volg de handmatige instructies:\n');
    showManualInstructions();
    process.exit(1);
  }

  console.log(`📁 Service account: ${path.basename(serviceAccountPath)}`);
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'calycompta',
  });
}

async function createDemoAccount() {
  console.log('\n🚀 Demo Account Creator voor CalyMob\n');
  console.log('=' .repeat(50));

  await initializeFirebase();

  const auth = admin.auth();
  const db = admin.firestore();
  let userId = null;

  // Stap 1: Check of account al bestaat
  console.log('\n📧 Controleren of account al bestaat...');
  try {
    const existingUser = await auth.getUserByEmail(CONFIG.email);
    userId = existingUser.uid;
    console.log(`✅ Account bestaat al: ${userId}`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log('\n👤 Firebase Auth account aanmaken...');
      try {
        const userRecord = await auth.createUser({
          email: CONFIG.email,
          password: CONFIG.password,
          displayName: `${CONFIG.member.prenom} ${CONFIG.member.nom}`,
          emailVerified: true,
        });
        userId = userRecord.uid;
        console.log(`✅ Auth account aangemaakt: ${userId}`);
      } catch (createError) {
        console.error('❌ Fout bij aanmaken Auth account:', createError.message);
        process.exit(1);
      }
    } else {
      console.error('❌ Fout bij ophalen user:', error.message);
      process.exit(1);
    }
  }

  // Stap 2: Maak of update Firestore member document
  console.log('\n📄 Firestore member document aanmaken/updaten...');
  try {
    const memberRef = db.collection(`clubs/${CONFIG.clubId}/members`).doc(userId);
    const memberData = {
      ...CONFIG.member,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    const memberDoc = await memberRef.get();
    if (memberDoc.exists) {
      console.log('ℹ️  Member document bestaat al, wordt geüpdatet...');
      await memberRef.update({
        ...CONFIG.member,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await memberRef.set(memberData);
    }
    console.log(`✅ Member document aangemaakt/geüpdatet`);
  } catch (error) {
    console.error('❌ Fout bij aanmaken member document:', error.message);
    process.exit(1);
  }

  // Resultaat
  console.log('\n' + '=' .repeat(50));
  console.log('✅ DEMO ACCOUNT KLAAR!\n');
  console.log('📋 Credentials voor App Store/Play Store review:\n');
  console.log(`   Email:    ${CONFIG.email}`);
  console.log(`   Password: ${CONFIG.password}`);
  console.log(`   User ID:  ${userId}`);
  console.log('\n' + '=' .repeat(50));
  console.log('\n📝 Kopieer naar:');
  console.log('   • App Store Connect > App > App Review Information');
  console.log('   • Google Play Console > App > App content > App access');
  console.log('\n💡 Test het account in CalyMob voordat je indient!\n');

  process.exit(0);
}

createDemoAccount().catch((error) => {
  console.error('❌ Onverwachte fout:', error);
  process.exit(1);
});

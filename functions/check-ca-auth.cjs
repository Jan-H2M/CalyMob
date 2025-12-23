/**
 * Script om te controleren welke CA-leden al een Firebase Auth account hebben
 *
 * Vergelijkt:
 * 1. Firestore members met clubStatuten die "CA" bevat
 * 2. Firebase Authentication accounts
 */

const admin = require('firebase-admin');
const serviceAccount = require('/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCAMembers() {
  console.log('🔍 Ophalen van CA-leden uit Firestore...\n');

  const clubId = 'calypso';

  // Haal alle members op
  const membersSnapshot = await db.collection('clubs').doc(clubId).collection('members').get();

  const caMembers = [];

  membersSnapshot.forEach(doc => {
    const data = doc.data();
    const clubStatuten = data.clubStatuten || [];

    // Check of "CA" in clubStatuten zit (case-insensitive)
    const isCA = clubStatuten.some(s => s.toLowerCase() === 'ca');

    if (isCA) {
      caMembers.push({
        id: doc.id,
        nom: data.nom || '',
        prenom: data.prenom || '',
        email: data.email || '',
        has_app_access: data.has_app_access || false,
        app_role: data.app_role || null,
        clubStatuten: clubStatuten
      });
    }
  });

  console.log(`📋 Gevonden ${caMembers.length} CA-leden in Firestore:\n`);

  // Check elk CA-lid in Firebase Auth
  const results = [];

  for (const member of caMembers) {
    let authStatus = 'GEEN AUTH ACCOUNT';
    let authDetails = null;

    if (member.email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(member.email);
        authStatus = 'HEEFT AUTH ACCOUNT';
        authDetails = {
          uid: userRecord.uid,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          lastSignIn: userRecord.metadata.lastSignInTime || 'Nooit ingelogd'
        };
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          authStatus = 'GEEN AUTH ACCOUNT';
        } else {
          authStatus = `ERROR: ${error.code}`;
        }
      }
    } else {
      authStatus = 'GEEN EMAIL';
    }

    results.push({
      ...member,
      authStatus,
      authDetails
    });
  }

  // Toon resultaten
  console.log('='.repeat(80));
  console.log('RESULTATEN');
  console.log('='.repeat(80));

  const withAuth = results.filter(r => r.authStatus === 'HEEFT AUTH ACCOUNT');
  const withoutAuth = results.filter(r => r.authStatus === 'GEEN AUTH ACCOUNT');
  const noEmail = results.filter(r => r.authStatus === 'GEEN EMAIL');

  console.log(`\n✅ CA-leden MET Firebase Auth account (${withAuth.length}):`);
  console.log('-'.repeat(80));
  for (const member of withAuth) {
    console.log(`  ${member.prenom} ${member.nom}`);
    console.log(`    📧 ${member.email}`);
    console.log(`    🔑 UID: ${member.authDetails.uid}`);
    console.log(`    📱 App access: ${member.has_app_access ? 'Ja' : 'Nee'} | Rol: ${member.app_role || 'geen'}`);
    console.log(`    📅 Laatste login: ${member.authDetails.lastSignIn}`);
    console.log(`    ✉️  Email verified: ${member.authDetails.emailVerified ? 'Ja' : 'Nee'}`);
    console.log('');
  }

  console.log(`\n❌ CA-leden ZONDER Firebase Auth account (${withoutAuth.length}):`);
  console.log('-'.repeat(80));
  for (const member of withoutAuth) {
    console.log(`  ${member.prenom} ${member.nom}`);
    console.log(`    📧 ${member.email}`);
    console.log(`    📱 App access: ${member.has_app_access ? 'Ja' : 'Nee'} | Rol: ${member.app_role || 'geen'}`);
    console.log(`    ⚠️  Moet nog aangemaakt worden in Firebase Auth`);
    console.log('');
  }

  if (noEmail.length > 0) {
    console.log(`\n⚠️  CA-leden ZONDER email (${noEmail.length}):`);
    console.log('-'.repeat(80));
    for (const member of noEmail) {
      console.log(`  ${member.prenom} ${member.nom} - Geen email adres!`);
    }
  }

  // Samenvatting
  console.log('\n' + '='.repeat(80));
  console.log('SAMENVATTING');
  console.log('='.repeat(80));
  console.log(`  Totaal CA-leden:     ${results.length}`);
  console.log(`  Met Auth account:    ${withAuth.length}`);
  console.log(`  Zonder Auth account: ${withoutAuth.length}`);
  console.log(`  Zonder email:        ${noEmail.length}`);

  console.log('\n📌 CONCLUSIE:');
  if (withoutAuth.length === 0) {
    console.log('   Alle CA-leden hebben al een Firebase Auth account.');
    console.log('   Je kunt "Envoyer email" gebruiken om ze een welkomstmail te sturen.');
  } else {
    console.log(`   ${withoutAuth.length} CA-leden hebben nog geen Firebase Auth account.`);
    console.log('   Je moet eerst een account voor hen aanmaken voordat je een mail kunt sturen.');
  }

  process.exit(0);
}

checkCAMembers().catch(error => {
  console.error('❌ Fout:', error);
  process.exit(1);
});

/**
 * identify-uids.cjs
 *
 * Quick lookup: print member info for a given list of UIDs to identify them.
 * No writes — read-only diagnostic.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const CLUB_ID = 'calypso';
const UIDS_TO_CHECK = [
  'nvDVlhglO1eGXPBVRd7NbJ2Uevn2', // organisateur_id on La Gombe
  'mhm3y0igqqej58qpig',          // Yves DEHOGNE per Jan's confirmation
];

const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '..', '..', 'functions', 'service-account-key.json'),
].filter(Boolean);

function loadServiceAccount() {
  for (const p of possibleServiceAccountPaths) {
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('No Firebase Admin credentials found');
}

admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
const db = admin.firestore();

async function main() {
  // Look up each UID against the members collection AND Firebase Auth.
  for (const uid of UIDS_TO_CHECK) {
    console.log(`\n=== ${uid} ===`);

    // 1. Members collection (document ID = UID)
    const memberDoc = await db.doc(`clubs/${CLUB_ID}/members/${uid}`).get();
    if (memberDoc.exists) {
      const m = memberDoc.data();
      console.log(`[member doc] prenom=${m.prenom || ''} nom=${m.nom || ''}`);
      console.log(`             email=${m.email || ''}`);
      console.log(`             telephone=${m.telephone || m.telephone_principal || ''}`);
      console.log(`             clubStatuten=${JSON.stringify(m.clubStatuten || [])}`);
      console.log(`             lifras=${m.numero_lifras || m.lifras_id || ''}`);
    } else {
      console.log(`[member doc] NOT FOUND in clubs/${CLUB_ID}/members`);

      // 2. Search by linked_user_id field (legacy)
      const linkedSnap = await db
        .collection(`clubs/${CLUB_ID}/members`)
        .where('linked_user_id', '==', uid)
        .get();
      if (!linkedSnap.empty) {
        linkedSnap.forEach((d) => {
          const m = d.data();
          console.log(`[linked_user_id match] doc=${d.id} ${m.prenom || ''} ${m.nom || ''}`);
        });
      }

      // 3. Search by user_id field
      const userIdSnap = await db
        .collection(`clubs/${CLUB_ID}/members`)
        .where('user_id', '==', uid)
        .get();
      if (!userIdSnap.empty) {
        userIdSnap.forEach((d) => {
          const m = d.data();
          console.log(`[user_id match] doc=${d.id} ${m.prenom || ''} ${m.nom || ''}`);
        });
      }
    }

    // 4. Firebase Auth lookup
    try {
      const authUser = await admin.auth().getUser(uid);
      console.log(`[auth] email=${authUser.email || ''} displayName=${authUser.displayName || ''}`);
      console.log(`       phoneNumber=${authUser.phoneNumber || ''}`);
      console.log(`       disabled=${authUser.disabled} created=${authUser.metadata.creationTime}`);
    } catch (e) {
      console.log(`[auth] NOT FOUND in Firebase Auth (${e.code || e.message})`);
    }
  }

  // Bonus: find all member docs whose name is "Yves DEHOGNE" (case-insensitive)
  console.log('\n=== All Yves DEHOGNE members ===');
  const allMembers = await db.collection(`clubs/${CLUB_ID}/members`).get();
  allMembers.forEach((d) => {
    const m = d.data();
    const nom = (m.nom || '').toUpperCase();
    const prenom = (m.prenom || '').toUpperCase();
    if (nom.includes('DEHOGNE') || prenom.includes('YVES')) {
      console.log(
        `  doc=${d.id} prenom=${m.prenom || ''} nom=${m.nom || ''} email=${m.email || ''} lifras=${m.numero_lifras || m.lifras_id || ''}`,
      );
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

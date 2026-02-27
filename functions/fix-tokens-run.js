const admin = require('firebase-admin');

const CLUB_ID = 'calypso_dive_club';
const DRY_RUN = true; // First dry run

const serviceAccount = require('/sessions/sweet-pensive-dijkstra/mnt/Calypso/CalyCompta/calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixFcmTokens() {
  console.log(`\n🔍 FCM Token Cleanup - ${DRY_RUN ? 'DRY RUN' : '⚠️  LIVE MODE'}`);
  console.log(`   Club: ${CLUB_ID}\n`);

  const membersSnapshot = await db
    .collection('clubs')
    .doc(CLUB_ID)
    .collection('members')
    .get();

  console.log(`📋 ${membersSnapshot.size} members gevonden\n`);

  let fixedCount = 0;
  let alreadyOkCount = 0;
  let noTokensCount = 0;

  for (const doc of membersSnapshot.docs) {
    const data = doc.data();
    const memberId = doc.id;
    const displayName = data.prenom ? `${data.prenom} ${data.nom || ''}`.trim() : memberId;

    if (!data.fcm_tokens || !Array.isArray(data.fcm_tokens)) {
      noTokensCount++;
      continue;
    }

    const original = data.fcm_tokens;
    const fixed = original.flat(Infinity).filter(t => typeof t === 'string' && t.length > 0);
    const unique = [...new Set(fixed)];
    const hasIssue = JSON.stringify(original) !== JSON.stringify(unique);

    if (!hasIssue) {
      alreadyOkCount++;
      continue;
    }

    console.log(`🔧 ${displayName} (${memberId}):`);
    console.log(`   Oud: ${JSON.stringify(original).substring(0, 120)}`);
    console.log(`   Nieuw: ${JSON.stringify(unique).substring(0, 120)}`);
    console.log(`   Tokens: ${original.length} -> ${unique.length}`);
    fixedCount++;
  }

  console.log(`\n📊 Resultaat:`);
  console.log(`   Te fixen:     ${fixedCount}`);
  console.log(`   Al correct:   ${alreadyOkCount}`);
  console.log(`   Geen tokens:  ${noTokensCount}`);

  if (DRY_RUN && fixedCount > 0) {
    console.log(`\n⚠️  Dit was een DRY RUN.`);
  }
  
  process.exit(0);
}

fixFcmTokens().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

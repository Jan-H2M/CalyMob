const admin = require('firebase-admin');
const path = require('path');
const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function find() {
  const clubs = await db.collection('clubs').get();
  console.log(`Found ${clubs.size} clubs:`);
  clubs.forEach(doc => {
    const d = doc.data();
    console.log(`  ID: "${doc.id}" | name: "${d.name || d.nom || 'N/A'}"`);
  });

  // Also check if boutique_stock exists at root level
  const rootBoutique = await db.collection('boutique_stock').limit(3).get();
  console.log(`\nRoot boutique_stock: ${rootBoutique.size} items`);
  rootBoutique.forEach(doc => {
    const d = doc.data();
    console.log(`  ${doc.id}: type=${d.type} | ${d.nom}`);
  });

  process.exit(0);
}
find().catch(err => { console.error(err); process.exit(1); });

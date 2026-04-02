/**
 * Extract operations + registrations from Firestore for activity report
 */
const admin = require('firebase-admin');
const path = require('path');
const sa = require(path.resolve(__dirname, 'service-account-calycompta.json'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'calycompta' });
const db = admin.firestore();

async function main() {
  // Find club
  const clubs = await db.collection('clubs').get();
  let clubId = null;
  for (const doc of clubs.docs) {
    const check = await db.collection('clubs').doc(doc.id).collection('members').limit(1).get();
    if (!check.empty) { clubId = doc.id; break; }
  }
  console.error('Club:', clubId);

  // Fetch all operations
  const opsSnap = await db.collection('clubs').doc(clubId).collection('operations').get();
  const operations = opsSnap.docs.map(doc => {
    const d = doc.data();
    const result = { id: doc.id };
    for (const [k, v] of Object.entries(d)) {
      if (v && typeof v === 'object' && v.toDate) result[k] = v.toDate().toISOString();
      else result[k] = v;
    }
    return result;
  });
  console.error('Operations:', operations.length);

  // Fetch all event registrations
  const regsSnap = await db.collection('clubs').doc(clubId).collection('event_registrations').get();
  const registrations = regsSnap.docs.map(doc => {
    const d = doc.data();
    const result = { id: doc.id };
    for (const [k, v] of Object.entries(d)) {
      if (v && typeof v === 'object' && v.toDate) result[k] = v.toDate().toISOString();
      else result[k] = v;
    }
    return result;
  });
  console.error('Registrations:', registrations.length);

  // Fetch piscine sessions
  const piscSnap = await db.collection('clubs').doc(clubId).collection('piscine_sessions').get();
  const piscineSessions = piscSnap.docs.map(doc => {
    const d = doc.data();
    const result = { id: doc.id };
    for (const [k, v] of Object.entries(d)) {
      if (v && typeof v === 'object' && v.toDate) result[k] = v.toDate().toISOString();
      else result[k] = v;
    }
    return result;
  });
  console.error('Piscine sessions:', piscineSessions.length);

  console.log(JSON.stringify({ operations, registrations, piscineSessions }, null, 0));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

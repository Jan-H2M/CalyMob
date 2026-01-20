const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'calycompta'
  });
}

const db = admin.firestore();

async function compareNemo() {
  const nemoId = 'qAckY9XdXPasfzQ7dhtH';

  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    NEMO 33 - Payment Status Vergelijking                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const inscriptions = await db.collection('clubs').doc('calypso')
    .collection('operations').doc(nemoId)
    .collection('inscriptions').get();

  console.log('Naam                      | paye  | payment_status | transaction_matched');
  console.log('--------------------------|-------|----------------|--------------------');

  inscriptions.docs.forEach(p => {
    const d = p.data();
    const naam = (d.membre_prenom + ' ' + d.membre_nom).padEnd(25);
    const paye = String(d.paye).padEnd(5);
    const status = String(d.payment_status || 'null').padEnd(14);
    const matched = String(d.transaction_matched || false);
    console.log(naam + ' | ' + paye + ' | ' + status + ' | ' + matched);
  });

  const paid = inscriptions.docs.filter(d => d.data().paye).length;
  const unpaid = inscriptions.size - paid;

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log('Totaal: ' + inscriptions.size + ' | Betaald: ' + paid + ' | Niet betaald: ' + unpaid);
}

compareNemo().then(() => process.exit(0));

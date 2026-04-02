/**
 * Test script: Voegt meerdere replies toe aan "Rappel cotisations 2026"
 * Dit triggert de Cloud Function onNewAnnouncementReply voor elke reply.
 * 
 * Usage: cd functions && node test-announcement-replies.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLUB_ID = 'calypso';
const ANNOUNCEMENT_ID = 'smUZN9jaRvrtz3BR0AP1';

// Fictieve leden die antwoorden (NIET Jan, zodat hij notificaties krijgt)
const senders = [
  { id: 'test_marie', name: 'Marie DUPONT' },
  { id: 'test_luc', name: 'Luc BERNARD' },
  { id: 'test_sophie', name: 'Sophie MARTIN' },
];

const replies = [
  { sender: senders[0], message: "Merci pour le rappel ! J'ai fait le virement ce matin." },
  { sender: senders[1], message: "Est-ce qu'on peut payer en plusieurs fois cette année ?" },
  { sender: senders[2], message: "Bonjour, quel est le montant exact pour les adultes ?" },
  { sender: senders[0], message: "Sophie, c'est 150€ pour les adultes et 100€ pour les enfants." },
  { sender: senders[1], message: "Merci Marie ! Et la date limite, c'est quand exactement ?" },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function addReplies() {
  const repliesRef = db.collection('clubs').doc(CLUB_ID)
    .collection('announcements').doc(ANNOUNCEMENT_ID)
    .collection('replies');

  console.log(`\n📝 Adding ${replies.length} replies to "Rappel cotisations 2026"...\n`);

  for (let i = 0; i < replies.length; i++) {
    const r = replies[i];
    const docRef = await repliesRef.add({
      sender_id: r.sender.id,
      sender_name: r.sender.name,
      message: r.message,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ [${i + 1}/${replies.length}] ${r.sender.name}: "${r.message.substring(0, 50)}..." (${docRef.id})`);

    // Wacht 8 seconden tussen berichten zodat notificaties mooi na elkaar komen
    if (i < replies.length - 1) {
      console.log('   ⏳ Waiting 8 seconds before next reply...');
      await sleep(8000);
    }
  }

  console.log('\n🎉 All replies added! Watch for notifications on your iPhone.\n');
  process.exit(0);
}

addReplies().catch(e => { console.error('Error:', e); process.exit(1); });

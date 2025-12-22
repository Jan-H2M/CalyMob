const admin = require('firebase-admin');

// Init with explicit credentials via environment
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.HOME + '/.config/gcloud/application_default_credentials.json';

admin.initializeApp({
  projectId: 'calycompta'
});

const db = admin.firestore();

async function sendTestMessage() {
  try {
    const messageRef = await db.collection('clubs/calypso/operations/lyaFzWn6fSUmGTk97L2Z/messages').add({
      sender_id: 'owner_test',
      sender_name: 'Owner Test',
      message: '🔧 Cloud Datastore Owner test - ' + new Date().toLocaleTimeString('nl-BE'),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      read_by: []
    });
    
    console.log('✅ Testbericht verstuurd, ID:', messageRef.id);
    console.log('📱 Check je telefoon voor notificatie!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

sendTestMessage();

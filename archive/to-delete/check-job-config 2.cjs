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

async function checkConfig() {
  console.log('\n📋 Checking Communication Job Configuration\n');

  // Get communication settings
  const settingsDoc = await db
    .collection('clubs')
    .doc('calypso')
    .collection('settings')
    .doc('communication')
    .get();

  if (!settingsDoc.exists) {
    console.log('❌ No communication settings found');
    return;
  }

  const settings = settingsDoc.data();
  const jobs = settings.jobs || [];

  console.log(`Found ${jobs.length} job(s):\n`);

  jobs.forEach((job, index) => {
    console.log(`Job ${index + 1}:`);
    console.log(`  ID: ${job.id}`);
    console.log(`  Name: "${job.name}" (length: ${job.name?.length}, has trailing space: ${job.name?.endsWith(' ')})`);
    console.log(`  Active: ${job.isActive}`);
    console.log(`  Days: ${JSON.stringify(job.daysOfWeek)}`);
    console.log(`  Time: ${job.timeOfDay}`);
    console.log(`  Recipient Roles: ${JSON.stringify(job.recipientRoles)}`);
    console.log(`  Minimum Count: ${job.minimumCount}`);
    console.log('');
  });

  // Check Google Mail config
  const mailConfigDoc = await db
    .collection('clubs')
    .doc('calypso')
    .collection('settings')
    .doc('google_mail')
    .get();

  if (mailConfigDoc.exists) {
    const mailConfig = mailConfigDoc.data();
    console.log('✅ Google Mail Configuration Found:');
    console.log(`  From Email: ${mailConfig.fromEmail}`);
    console.log(`  From Name: ${mailConfig.fromName}`);
    console.log(`  Has Client ID: ${!!mailConfig.clientId}`);
    console.log(`  Has Client Secret: ${!!mailConfig.clientSecret}`);
    console.log(`  Has Refresh Token: ${!!mailConfig.refreshToken}`);
  } else {
    console.log('❌ No Google Mail configuration found');
  }
  console.log('');

  // Check for superadmin users
  const superadmins = await db
    .collection('clubs')
    .doc('calypso')
    .collection('members')
    .where('role', '==', 'superadmin')
    .where('isActive', '==', true)
    .get();

  console.log(`\n👥 Found ${superadmins.size} active superadmin(s):`);
  superadmins.docs.forEach(doc => {
    const data = doc.data();
    console.log(`  - ${data.prenom} ${data.nom} (${data.email})`);
  });

  // Check account codes
  const codes = await db
    .collection('clubs')
    .doc('calypso')
    .collection('account_mappings')
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();

  console.log(`\n📊 Found ${codes.size} account code(s) (showing last 5)`);

  process.exit(0);
}

checkConfig().catch(console.error);

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const readline = require('readline');

// Initialize Firebase Admin with application default credentials
initializeApp({
  projectId: 'calycompta'
});

const auth = getAuth();
const db = getFirestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createUser() {
  console.log('🚀 Create New User');
  console.log('━'.repeat(60));

  try {
    // Get user input
    const email = await question('Email: ');
    const displayName = await question('Display Name: ');
    const password = await question('Password (min 6 chars): ');

    console.log('\nSelect Role:');
    console.log('  1. user (Utilisateur)');
    console.log('  2. validateur (Validateur)');
    console.log('  3. admin (Administrateur)');
    console.log('  4. superadmin (Super Admin)');
    const roleChoice = await question('Role [1-4]: ');

    const roleMap = {
      '1': 'user',
      '2': 'validateur',
      '3': 'admin',
      '4': 'superadmin'
    };
    const role = roleMap[roleChoice] || 'user';

    const clubId = (await question('Club ID [calypso]: ')) || 'calypso';

    console.log('\n━'.repeat(60));
    console.log('Creating user with:');
    console.log(`  Email: ${email}`);
    console.log(`  Name: ${displayName}`);
    console.log(`  Role: ${role}`);
    console.log(`  Club: ${clubId}`);
    console.log('━'.repeat(60));

    const confirm = await question('\nConfirm? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      return;
    }

    // Step 1: Create Firebase Auth user
    console.log('\n📝 Creating Firebase Auth user...');
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email: email,
        password: password,
        emailVerified: true,
        displayName: displayName,
        disabled: false
      });
      console.log(`✅ Firebase Auth user created: ${userRecord.uid}`);
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        console.log('⚠️  User already exists in Firebase Auth');
        userRecord = await auth.getUserByEmail(email);
        console.log(`   Using existing user: ${userRecord.uid}`);
      } else {
        throw error;
      }
    }

    // Step 2: Set custom claims (CRITICAL: must include status and isActive to prevent role reversion bug)
    console.log('📝 Setting custom claims...');
    await auth.setCustomUserClaims(userRecord.uid, {
      role: role,
      clubId: clubId,
      status: 'active',
      isActive: true
    });
    console.log('✅ Custom claims set (role, clubId, status, isActive)');

    // Step 3: Create Firestore document
    console.log('📝 Creating Firestore document...');
    const memberRef = db.collection('clubs').doc(clubId).collection('members').doc(userRecord.uid);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      await memberRef.set({
        id: userRecord.uid,
        email: email,
        displayName: displayName,
        firstName: displayName.split(' ')[0] || '',
        lastName: displayName.split(' ').slice(1).join(' ') || '',
        role: role,
        status: 'active',
        isActive: true,
        actif: true,
        clubId: clubId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        metadata: {
          createdBy: 'create-user-script'
        }
      });
      console.log(`✅ Firestore document created at: clubs/${clubId}/members/${userRecord.uid}`);
    } else {
      console.log('⚠️  Firestore document already exists');

      // Update role if different
      const existingData = memberDoc.data();
      if (existingData.role !== role) {
        await memberRef.update({
          role: role,
          updatedAt: Timestamp.now()
        });
        console.log(`✅ Role updated from ${existingData.role} to ${role}`);
      }
    }

    console.log('\n' + '━'.repeat(60));
    console.log('✅ User created successfully!');
    console.log('━'.repeat(60));
    console.log('Login Credentials:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log(`  Role: ${role}`);
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error creating user:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
  } finally {
    rl.close();
  }
}

// Run the script
createUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

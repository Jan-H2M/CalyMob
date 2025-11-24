const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin with application default credentials
// This will use the credentials from 'firebase login'
initializeApp({
  projectId: 'calycompta'
});

const auth = getAuth();
const db = getFirestore();

async function createUserWithFirestore(email, password, displayName, role, clubId) {
  try {
    console.log(`\n📝 Creating user: ${email} with role: ${role}`);

    // Step 1: Create Firebase Auth user
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
        console.log('⚠️  User already exists in Firebase Auth, using existing user');
        userRecord = await auth.getUserByEmail(email);

        // Update password and details
        await auth.updateUser(userRecord.uid, {
          password: password,
          emailVerified: true,
          displayName: displayName
        });
        console.log('✅ Firebase Auth user updated');
      } else {
        throw error;
      }
    }

    // Step 2: Set custom claims for the user
    await auth.setCustomUserClaims(userRecord.uid, {
      role: role,
      clubId: clubId
    });
    console.log('✅ Custom claims set');

    // Step 3: Create Firestore document
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
        actif: true, // For backward compatibility
        clubId: clubId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        metadata: {
          createdBy: 'setup-script'
        }
      });
      console.log(`✅ Firestore document created at: clubs/${clubId}/members/${userRecord.uid}`);
    } else {
      console.log('⚠️  Firestore document already exists, skipping');
    }

    console.log(`✅ User ${email} fully set up!`);
    return userRecord.uid;

  } catch (error) {
    console.error(`❌ Error creating user ${email}:`, error.message);
    throw error;
  }
}

async function setupAuth() {
  console.log('🚀 Setting up Firebase Authentication and Firestore...');
  console.log('━'.repeat(60));

  const clubId = 'calypso';

  try {
    // Create demo users with different roles
    const users = [
      {
        email: 'demo@calypso.be',
        password: 'demo123',
        displayName: 'Demo User',
        role: 'validateur'
      },
      {
        email: 'admin@calypso.be',
        password: 'admin123',
        displayName: 'Admin User',
        role: 'admin'
      },
      {
        email: 'user@calypso.be',
        password: 'user123',
        displayName: 'Basic User',
        role: 'user'
      }
    ];

    for (const userData of users) {
      await createUserWithFirestore(
        userData.email,
        userData.password,
        userData.displayName,
        userData.role,
        clubId
      );
    }

    console.log('\n' + '━'.repeat(60));
    console.log('✅ Setup completed successfully!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  }
}

setupAuth()
  .then(() => {
    console.log('\n📋 Login Credentials:');
    console.log('━'.repeat(60));
    console.log('Validateur:');
    console.log('  Email: demo@calypso.be');
    console.log('  Password: demo123');
    console.log('\nAdmin:');
    console.log('  Email: admin@calypso.be');
    console.log('  Password: admin123');
    console.log('\nUser:');
    console.log('  Email: user@calypso.be');
    console.log('  Password: user123');
    console.log('━'.repeat(60));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
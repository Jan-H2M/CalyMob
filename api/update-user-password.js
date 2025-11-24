// Vercel API handler for updating Firebase Auth user password
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      // Parse the service account from environment variable
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_KEY from environment');
    } catch (error) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error.message);
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY format');
    }
  } else {
    // Fallback to local service account file for development
    try {
      serviceAccount = require('../serviceAccountKey.json');
      console.log('✅ Using local serviceAccountKey.json');
    } catch (error) {
      console.error('❌ No service account configuration found');
      throw new Error('Firebase service account not configured');
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/**
 * Update Firebase Auth user password
 * This endpoint is called when sending activation/password reset emails
 * to ensure the temporary password in the email matches Firebase Auth
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, newPassword, authToken, clubId } = req.body;

    console.log('🔐 [UPDATE-PASSWORD] Starting password update request');
    console.log('🔐 [UPDATE-PASSWORD] Request details:', {
      userId,
      clubId,
      hasNewPassword: !!newPassword,
      hasAuthToken: !!authToken,
    });

    // Validate required fields
    if (!userId || !newPassword || !authToken || !clubId) {
      console.error('❌ Missing required fields:', {
        userId: !!userId,
        newPassword: !!newPassword,
        authToken: !!authToken,
        clubId: !!clubId,
      });
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'newPassword', 'authToken', 'clubId'],
      });
    }

    // Verify Firebase Auth token
    console.log('🔐 [UPDATE-PASSWORD] Verifying Firebase Auth token...');
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(authToken);
      console.log('✅ [UPDATE-PASSWORD] Auth token verified for user:', decodedToken.uid);
    } catch (error) {
      console.error('❌ [UPDATE-PASSWORD] Invalid auth token:', error.message);
      return res.status(401).json({
        error: 'Unauthorized',
        details: 'Invalid authentication token',
      });
    }

    // Check if the user making the request is an admin or superadmin
    const userRole = decodedToken.role || 'user';
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      console.error('❌ [UPDATE-PASSWORD] Insufficient permissions:', { userRole });
      return res.status(403).json({
        error: 'Forbidden',
        details: 'Only admins can update user passwords',
      });
    }

    // Update the password in Firebase Auth
    console.log('🔐 [UPDATE-PASSWORD] Updating password in Firebase Auth...');
    await admin.auth().updateUser(userId, {
      password: newPassword,
    });

    console.log('✅ [UPDATE-PASSWORD] Password updated in Firebase Auth');

    // Set requirePasswordChange flag in Firestore
    console.log('🔐 [UPDATE-PASSWORD] Setting requirePasswordChange flag in Firestore...');
    console.log('🔐 [UPDATE-PASSWORD] Document path:', `clubs/${clubId}/members/${userId}`);
    const db = admin.firestore();
    const userDocRef = db.collection('clubs').doc(clubId).collection('members').doc(userId);

    // First verify document exists
    const docSnapshot = await userDocRef.get();
    if (!docSnapshot.exists) {
      console.error('❌ [UPDATE-PASSWORD] User document does not exist in Firestore!');
      return res.status(404).json({
        error: 'User document not found in Firestore',
        details: `Document path: clubs/${clubId}/members/${userId}`,
      });
    }

    console.log('✅ [UPDATE-PASSWORD] User document exists, updating...');
    await userDocRef.update({
      'security.requirePasswordChange': true,
      'security.passwordSetAt': admin.firestore.FieldValue.serverTimestamp(),
      'security.passwordSetBy': decodedToken.uid,
    });

    // Verify the update was successful
    const updatedDoc = await userDocRef.get();
    const updatedData = updatedDoc.data();
    console.log('✅ [UPDATE-PASSWORD] requirePasswordChange flag set successfully');
    console.log('🔍 [UPDATE-PASSWORD] Verification - security field after update:', JSON.stringify(updatedData.security, null, 2));

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully and user must change password on next login',
    });

  } catch (error) {
    console.error('❌ [UPDATE-PASSWORD] Error:', error);
    console.error('❌ [UPDATE-PASSWORD] Error message:', error.message);
    console.error('❌ [UPDATE-PASSWORD] Error stack:', error.stack);

    // Handle specific Firebase errors
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        error: 'User not found',
        details: 'No Firebase Auth user exists with this ID',
      });
    }

    return res.status(500).json({
      error: error.message || 'Failed to update password',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

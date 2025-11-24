// Vercel API handler for password change (user-initiated)
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Track initialization status
let initializationError = null;
let isInitialized = false;

// Initialize Firebase Admin SDK
function initializeFirebase() {
  if (getApps().length > 0) {
    isInitialized = true;
    return;
  }

  try {
    let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
      throw new Error('Firebase service account key is not configured');
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountKey);
      console.log('✅ Parsed service account directly');
    } catch (e1) {
      try {
        const decoded = JSON.parse(serviceAccountKey);
        if (typeof decoded === 'string') {
          serviceAccount = JSON.parse(decoded);
          console.log('✅ Parsed double-encoded service account');
        } else {
          serviceAccount = decoded;
        }
      } catch (e2) {
        console.log('Attempting to fix multiline private key issue...');
        const privateKeyMatch = serviceAccountKey.match(/"private_key":\s*"(-----BEGIN[\s\S]*?-----END[^"]*?)"/);
        if (privateKeyMatch) {
          const originalPrivateKey = privateKeyMatch[1];
          const escapedPrivateKey = originalPrivateKey.replace(/\n/g, '\\n');
          const fixedJson = serviceAccountKey.replace(privateKeyMatch[0], `"private_key": "${escapedPrivateKey}"`);
          serviceAccount = JSON.parse(fixedJson);
          console.log('✅ Fixed and parsed service account with multiline private key');
        } else {
          throw new Error('Could not extract private key from service account JSON');
        }
      }
    }

    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error('❌ Service account missing required fields');
      throw new Error('Service account key is missing required fields');
    }

    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
    isInitialized = true;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    initializationError = error;
    throw error;
  }
}

/**
 * Vercel Serverless Function to change user's own password
 * This endpoint allows authenticated users to change their password
 */
async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Initialize Firebase if not already initialized
  try {
    initializeFirebase();
  } catch (initError) {
    console.error('❌ [change-password API] Firebase initialization failed:', initError);
    return res.status(500).json({
      error: 'Server configuration error',
      details: initError.message,
      hint: 'Firebase Admin SDK initialization failed. Check server configuration.'
    });
  }

  try {
    const { userId, clubId, authToken, newPassword } = req.body;

    // Validate request body
    if (!userId || !clubId || !authToken || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields: userId, clubId, authToken, newPassword'
      });
    }

    console.log('🔑 [change-password API] Request:', { userId, clubId });

    // Verify the auth token
    const auth = getAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(authToken);
    } catch (error) {
      console.error('❌ [change-password API] Invalid auth token:', error);
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    // Verify user is changing their own password
    if (decodedToken.uid !== userId) {
      console.error('❌ [change-password API] User ID mismatch');
      return res.status(403).json({
        error: 'You can only change your own password'
      });
    }

    // Import Firebase Firestore
    const { getFirestore, Timestamp, FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const now = Timestamp.now();

    // 1. Get member data from Firestore
    const memberRef = db.collection('clubs').doc(clubId).collection('members').doc(userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return res.status(404).json({ error: 'Membre non trouvé dans Firestore' });
    }

    const memberData = memberDoc.data();

    if (!memberData) {
      return res.status(404).json({ error: 'Données du membre introuvables' });
    }

    // 2. Update password in Firebase Auth
    try {
      await auth.updateUser(userId, {
        password: newPassword
      });
      console.log('✅ [change-password API] Password updated in Firebase Auth');
    } catch (error) {
      console.error('❌ [change-password API] Error updating password:', error);

      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({
          error: 'Utilisateur non trouvé dans Firebase Auth'
        });
      }

      throw error;
    }

    // 3. Update Firestore to remove requirePasswordChange flag
    console.log('🔐 [change-password API] Removing requirePasswordChange flag from security field...');
    const updateData = {
      'security.requirePasswordChange': false, // Set to false instead of delete
      updatedAt: now,
      'metadata.passwordChangedAt': now,
      'metadata.passwordChangedBy': userId
    };

    await memberRef.update(updateData);
    console.log('✅ [change-password API] Firestore updated - requirePasswordChange flag set to false');

    // Verify the update
    const updatedDoc = await memberRef.get();
    const updatedData = updatedDoc.data();
    console.log('🔍 [change-password API] Verification - security field after update:', JSON.stringify(updatedData.security, null, 2));

    // 4. Create audit log
    try {
      await db.collection('clubs')
        .doc(clubId)
        .collection('audit_logs')
        .add({
          action: 'password.changed',
          userId: userId,
          userName: memberData.displayName || memberData.email,
          targetId: userId,
          targetType: 'user',
          targetName: memberData.displayName,
          details: {
            changedBy: 'User (self-service)',
            changedVia: 'PasswordChangeModal',
            wasRequired: memberData.requirePasswordChange || false
          },
          timestamp: now,
          clubId: clubId,
          severity: 'info',
        });

      console.log('✅ [change-password API] Audit log created');
    } catch (error) {
      console.error('❌ [change-password API] Error creating audit log:', error);
      // Continue anyway - audit log is not critical
    }

    // Return success
    return res.status(200).json({
      success: true,
      message: 'Mot de passe changé avec succès',
      userId: userId
    });

  } catch (error) {
    console.error('❌ [change-password API] Unexpected error:', error);

    // Return a more specific error message based on the error type
    if (error.message?.includes('Firebase')) {
      return res.status(500).json({
        error: 'Configuration error: Firebase initialization failed',
        details: error.message,
        hint: 'Please check Firebase service account configuration'
      });
    }

    return res.status(500).json({
      error: 'Erreur lors du changement de mot de passe',
      details: error.message || 'Unknown error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

export default handler;

// Vercel API handler for password reset
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
    // In production, Vercel will use service account from environment variables
    // In development, you can use a service account key file
    let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
      throw new Error('Firebase service account key is not configured');
    }

    let serviceAccount;
    try {
      // The service account key can be in different formats depending on how it's stored
      // Try multiple parsing strategies

      // Strategy 1: Direct parse (if it's properly formatted JSON)
      try {
        serviceAccount = JSON.parse(serviceAccountKey);
        console.log('✅ Parsed service account directly');
      } catch (e1) {
        // Strategy 2: The env var might be a stringified JSON (double-encoded)
        try {
          const decoded = JSON.parse(serviceAccountKey);
          if (typeof decoded === 'string') {
            serviceAccount = JSON.parse(decoded);
            console.log('✅ Parsed double-encoded service account');
          } else {
            serviceAccount = decoded;
          }
        } catch (e2) {
          // Strategy 3: Manual parsing for multiline private keys
          // This handles cases where the JSON has actual newlines in the private key
          // We'll extract the private key separately and handle it

          console.log('Attempting to fix multiline private key issue...');

          // Use regex to extract the private key
          const privateKeyMatch = serviceAccountKey.match(/"private_key":\s*"(-----BEGIN[\s\S]*?-----END[^"]*?)"/);

          if (privateKeyMatch) {
            const originalPrivateKey = privateKeyMatch[1];
            // Escape the newlines in the private key
            const escapedPrivateKey = originalPrivateKey.replace(/\n/g, '\\n');
            // Replace the private key in the JSON with the escaped version
            const fixedJson = serviceAccountKey.replace(privateKeyMatch[0], `"private_key": "${escapedPrivateKey}"`);
            serviceAccount = JSON.parse(fixedJson);
            console.log('✅ Fixed and parsed service account with multiline private key');
          } else {
            throw new Error('Could not extract private key from service account JSON');
          }
        }
      }
    } catch (parseError) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', parseError);
      console.error('First 200 chars:', serviceAccountKey.substring(0, 200));
      throw new Error('Invalid Firebase service account key format: ' + parseError.message);
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
 * Vercel Serverless Function to reset a user's password
 * This endpoint allows admins to reset a user's password
 */
async function handler(req, res) {
  // Enable CORS for the app
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
    console.error('❌ [reset-password API] Firebase initialization failed:', initError);
    return res.status(500).json({
      error: 'Server configuration error',
      details: initError.message,
      hint: 'Firebase Admin SDK initialization failed. Check server configuration.'
    });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const idToken = authHeader.substring(7); // Remove "Bearer " prefix
    const { userId, clubId, newPassword, requirePasswordChange } = req.body;

    // Validate request body
    if (!userId || !clubId) {
      return res.status(400).json({
        error: 'Missing required fields: userId, clubId'
      });
    }

    // Set default password if not provided
    const passwordToSet = newPassword || '123456';
    const shouldRequireChange = requirePasswordChange !== undefined ? requirePasswordChange : true;

    console.log('🔑 [reset-password API] Request:', { userId, clubId, requirePasswordChange: shouldRequireChange });

    // Verify the auth token
    const auth = getAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (error) {
      console.error('❌ [reset-password API] Invalid auth token:', error);
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    // Check if user has admin/superadmin role
    const userRole = decodedToken.role || 'user';
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      console.error('❌ [reset-password API] Insufficient permissions:', { userRole });
      return res.status(403).json({
        error: 'Insufficient permissions. Admin or superadmin role required.'
      });
    }

    // Import Firebase Firestore
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const now = Timestamp.now();

    // 1. Get member data from Firestore to verify the user exists
    const memberRef = db.collection('clubs').doc(clubId).collection('members').doc(userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return res.status(404).json({ error: 'Membre non trouvé dans Firestore' });
    }

    const memberData = memberDoc.data();

    if (!memberData) {
      return res.status(404).json({ error: 'Données du membre introuvables' });
    }

    // 2. Update the user's password in Firebase Auth
    try {
      await auth.updateUser(userId, {
        password: passwordToSet
      });
      console.log('✅ [reset-password API] Password updated in Firebase Auth');
    } catch (error) {
      console.error('❌ [reset-password API] Error updating password:', error);

      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({
          error: 'Utilisateur non trouvé dans Firebase Auth'
        });
      }

      throw error;
    }

    // 3. Update Firestore member document to set requirePasswordChange flag
    const updateData = {
      requirePasswordChange: shouldRequireChange,
      updatedAt: now,
      'metadata.passwordResetAt': now,
      'metadata.passwordResetBy': decodedToken.uid
    };

    await memberRef.update(updateData);
    console.log('✅ [reset-password API] Firestore updated with requirePasswordChange flag');

    // 4. Create audit log
    try {
      await db.collection('clubs')
        .doc(clubId)
        .collection('auditLogs')
        .add({
          action: 'password.reset',
          userId: decodedToken.uid,
          userName: decodedToken.name || decodedToken.email,
          targetId: userId,
          targetType: 'user',
          targetName: memberData.displayName,
          details: {
            resetBy: 'Vercel API',
            resetVia: 'UserDetailView',
            requirePasswordChange: shouldRequireChange,
            temporaryPassword: passwordToSet,
          },
          timestamp: now,
          clubId: clubId,
          severity: 'warning',
        });

      console.log('✅ [reset-password API] Audit log created');
    } catch (error) {
      console.error('❌ [reset-password API] Error creating audit log:', error);
      // Continue anyway - audit log is not critical
    }

    // 5. Send password reset email if user has email verification enabled
    if (memberData.email) {
      try {
        // Generate a password reset link (optional)
        const resetLink = await auth.generatePasswordResetLink(memberData.email);
        console.log('✅ [reset-password API] Password reset link generated');
      } catch (error) {
        console.error('⚠️ [reset-password API] Could not generate reset link:', error);
        // Continue anyway - email is optional
      }
    }

    // Return success
    return res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      temporaryPassword: passwordToSet,
      requirePasswordChange: shouldRequireChange,
      userId: userId,
      userEmail: memberData.email
    });

  } catch (error) {
    console.error('❌ [reset-password API] Unexpected error:', error);

    // Return a more specific error message based on the error type
    if (error.message?.includes('Firebase')) {
      return res.status(500).json({
        error: 'Configuration error: Firebase initialization failed',
        details: error.message,
        hint: 'Please check Firebase service account configuration'
      });
    }

    return res.status(500).json({
      error: 'Erreur lors de la réinitialisation du mot de passe',
      details: error.message || 'Unknown error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

export default handler;
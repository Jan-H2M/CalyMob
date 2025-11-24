// Vercel API handler for user activation
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
 * Vercel Serverless Function to activate a pending user
 * This endpoint wraps the Firebase Cloud Function activateUser
 */
async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Initialize Firebase if not already initialized
  try {
    initializeFirebase();
  } catch (initError) {
    console.error('❌ [activate-user API] Firebase initialization failed:', initError);
    return res.status(500).json({
      error: 'Server configuration error',
      details: initError.message,
      hint: 'Firebase Admin SDK initialization failed. Check server configuration.'
    });
  }

  try {
    const { userId, clubId, authToken } = req.body;

    // Validate request body
    if (!userId || !clubId || !authToken) {
      return res.status(400).json({
        error: 'Missing required fields: userId, clubId, authToken'
      });
    }

    console.log('🔑 [activate-user API] Request:', { userId, clubId });

    // Verify the auth token
    const auth = getAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(authToken);
    } catch (error) {
      console.error('❌ [activate-user API] Invalid auth token:', error);
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    // Check if user has admin/superadmin role
    const userRole = decodedToken.role || 'user';
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      console.error('❌ [activate-user API] Insufficient permissions:', { userRole });
      return res.status(403).json({
        error: 'Insufficient permissions. Admin or superadmin role required.'
      });
    }

    // Call the Firebase Cloud Function directly
    // Since we're using Firebase Admin SDK, we'll replicate the logic here
    // or use the httpsCallable approach

    // Import Firebase Firestore
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const DEFAULT_PASSWORD = "Calypso2024!";
    const now = new Date();

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

    // Check if already activated
    if (!memberData.metadata?.pendingActivation) {
      return res.status(400).json({
        error: 'Ce membre est déjà activé ou n\'est pas en attente d\'activation'
      });
    }

    // 2. Create Firebase Auth user
    let authUser;
    try {
      authUser = await auth.createUser({
        uid: userId,
        email: memberData.email,
        password: DEFAULT_PASSWORD,
        displayName: memberData.displayName,
        emailVerified: false,
      });

      console.log('✅ [activate-user API] Firebase Auth user created:', authUser.uid);
    } catch (error) {
      console.error('❌ [activate-user API] Error creating Firebase Auth user:', error);

      if (error.code === 'auth/email-already-exists') {
        return res.status(409).json({
          error: 'Un compte Firebase Auth existe déjà avec cet email'
        });
      }

      throw error;
    }

    // 3. Set custom claims
    try {
      await auth.setCustomUserClaims(userId, {
        role: memberData.app_role || memberData.role || 'user',
        clubId: clubId
      });
      console.log('✅ [activate-user API] Custom claims set');
    } catch (error) {
      console.error('❌ [activate-user API] Error setting custom claims:', error);
      // Continue anyway - claims can be set later
    }

    // 4. Update Firestore member document
    await memberRef.update({
      isActive: true,
      member_status: 'active',
      'metadata.pendingActivation': FieldValue.delete(),
      'metadata.activatedAt': now,
      'metadata.activatedBy': decodedToken.uid,
      updatedAt: now
    });

    console.log('✅ [activate-user API] Firestore updated');

    // 5. Create audit log
    try {
      await db.collection('clubs')
        .doc(clubId)
        .collection('auditLogs')
        .add({
          action: 'user.activated',
          userId: decodedToken.uid,
          userName: decodedToken.name || decodedToken.email,
          targetId: userId,
          targetType: 'user',
          targetName: memberData.displayName,
          details: {
            activatedBy: 'Vercel API',
            activatedVia: 'UserDetailView button',
            defaultPassword: DEFAULT_PASSWORD,
          },
          timestamp: now,
          clubId: clubId,
          severity: 'info',
        });

      console.log('✅ [activate-user API] Audit log created');
    } catch (error) {
      console.error('❌ [activate-user API] Error creating audit log:', error);
      // Continue anyway
    }

    // Return success
    return res.status(200).json({
      success: true,
      message: 'Utilisateur activé avec succès',
      email: memberData.email,
      defaultPassword: DEFAULT_PASSWORD,
      userId: userId
    });

  } catch (error) {
    console.error('❌ [activate-user API] Unexpected error:', error);

    // Return a more specific error message based on the error type
    if (error.message?.includes('Firebase')) {
      return res.status(500).json({
        error: 'Configuration error: Firebase initialization failed',
        details: error.message,
        hint: 'Please check Firebase service account configuration'
      });
    }

    return res.status(500).json({
      error: 'Erreur lors de l\'activation de l\'utilisateur',
      details: error.message || 'Unknown error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

export default handler;
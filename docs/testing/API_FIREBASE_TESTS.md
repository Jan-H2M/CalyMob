# Firebase Authentication & API Communication Test Guide

## Overview
This document provides comprehensive testing procedures for Firebase Authentication and API endpoint communication in CalyCompta.

---

## 1. FIREBASE AUTHENTICATION SETUP

### 1.1 Firebase Configuration
```javascript
// src/lib/firebase.ts
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};
```

### 1.2 Test Environment Variables
```bash
# .env.test
VITE_FIREBASE_API_KEY=test-api-key
VITE_FIREBASE_AUTH_DOMAIN=test.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=calypso-test
VITE_USE_FIREBASE_PROD=false  # Use emulator
VITE_CLUB_ID=calypso
```

---

## 2. FIREBASE AUTH SDK TESTS

### Test 2.1: Firebase Initialization
```javascript
describe('Firebase Initialization', () => {
  test('Firebase app initializes correctly', () => {
    expect(firebase.apps.length).toBe(1);
    expect(firebase.app().name).toBe('[DEFAULT]');
  });

  test('Auth service is available', () => {
    const auth = firebase.auth();
    expect(auth).toBeDefined();
    expect(auth.currentUser).toBe(null); // Before login
  });

  test('Firestore service is available', () => {
    const db = firebase.firestore();
    expect(db).toBeDefined();
  });
});
```

### Test 2.2: Authentication Flow
```javascript
describe('Authentication Flow', () => {
  test('User can sign in with email/password', async () => {
    const email = 'user@test.com';
    const password = 'Test123!';

    const userCredential = await firebase.auth()
      .signInWithEmailAndPassword(email, password);

    expect(userCredential.user).toBeDefined();
    expect(userCredential.user.email).toBe(email);
  });

  test('Failed login throws correct error', async () => {
    const email = 'user@test.com';
    const wrongPassword = 'wrong';

    await expect(
      firebase.auth().signInWithEmailAndPassword(email, wrongPassword)
    ).rejects.toThrow('auth/wrong-password');
  });

  test('User can sign out', async () => {
    await firebase.auth().signOut();
    expect(firebase.auth().currentUser).toBe(null);
  });
});
```

### Test 2.3: Custom Claims
```javascript
describe('Custom Claims', () => {
  test('Custom claims are retrieved correctly', async () => {
    // Sign in first
    await firebase.auth().signInWithEmailAndPassword('admin@test.com', 'Test123!');

    // Get ID token with claims
    const idTokenResult = await firebase.auth().currentUser.getIdTokenResult();

    expect(idTokenResult.claims.role).toBe('admin');
    expect(idTokenResult.claims.clubId).toBe('calypso');
    expect(idTokenResult.claims.permissions).toBeDefined();
  });

  test('Token refresh updates claims', async () => {
    // Force token refresh
    const idTokenResult = await firebase.auth().currentUser.getIdTokenResult(true);

    expect(idTokenResult.claims).toBeDefined();
    expect(idTokenResult.expirationTime).toBeGreaterThan(Date.now());
  });
});
```

### Test 2.4: Auth State Persistence
```javascript
describe('Auth State Persistence', () => {
  test('Auth state persists across page reloads', async () => {
    // Sign in
    await firebase.auth().signInWithEmailAndPassword('user@test.com', 'Test123!');
    const userId = firebase.auth().currentUser.uid;

    // Simulate page reload
    await new Promise(resolve => {
      firebase.auth().onAuthStateChanged(user => {
        if (user) {
          expect(user.uid).toBe(userId);
          resolve();
        }
      });
    });
  });

  test('Auth persistence is LOCAL', () => {
    expect(firebase.auth().persistence).toBe(firebase.auth.Auth.Persistence.LOCAL);
  });
});
```

---

## 3. FIREBASE ADMIN SDK TESTS (API ENDPOINTS)

### Test 3.1: POST /api/activate-user

#### 3.1.1 Successful Activation
```javascript
// Test Setup
const adminToken = await getAdminToken();

// Test Request
const response = await fetch('/api/activate-user', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'test-member-id',
    clubId: 'calypso',
    role: 'user'
  })
});

// Assertions
expect(response.status).toBe(200);
const result = await response.json();
expect(result.success).toBe(true);
expect(result.authUserId).toBeDefined();
expect(result.message).toContain('activé avec succès');
```

#### 3.1.2 Authorization Tests
```javascript
describe('Activate User Authorization', () => {
  test('Fails without token', async () => {
    const response = await fetch('/api/activate-user', {
      method: 'POST',
      body: JSON.stringify({ userId: 'test', clubId: 'calypso', role: 'user' })
    });

    expect(response.status).toBe(401);
    const error = await response.json();
    expect(error.error).toContain('Token manquant');
  });

  test('Fails with user role token', async () => {
    const userToken = await getUserToken(); // Role: user

    const response = await fetch('/api/activate-user', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` },
      body: JSON.stringify({ userId: 'test', clubId: 'calypso', role: 'user' })
    });

    expect(response.status).toBe(403);
    const error = await response.json();
    expect(error.error).toContain('permissions insuffisantes');
  });

  test('Succeeds with admin token', async () => {
    const adminToken = await getAdminToken(); // Role: admin

    const response = await fetch('/api/activate-user', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ userId: 'test', clubId: 'calypso', role: 'user' })
    });

    expect(response.status).toBe(200);
  });
});
```

#### 3.1.3 Firebase Operations Verification
```javascript
test('Creates Firebase Auth user with correct properties', async () => {
  const adminToken = await getAdminToken();
  const memberId = 'new-member-' + Date.now();

  // Create member in Firestore first
  await createTestMember(memberId, {
    email: `${memberId}@test.com`,
    nom: 'Test',
    prenom: 'User'
  });

  // Activate user
  const response = await fetch('/api/activate-user', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      userId: memberId,
      clubId: 'calypso',
      role: 'user'
    })
  });

  expect(response.status).toBe(200);
  const result = await response.json();

  // Verify Firebase Auth user
  const authUser = await admin.auth().getUser(result.authUserId);
  expect(authUser.email).toBe(`${memberId}@test.com`);
  expect(authUser.displayName).toBe('Test User');
  expect(authUser.customClaims.role).toBe('user');
  expect(authUser.customClaims.clubId).toBe('calypso');

  // Verify Firestore update
  const memberDoc = await admin.firestore()
    .collection('clubs').doc('calypso')
    .collection('members').doc(memberId)
    .get();

  expect(memberDoc.data().has_app_access).toBe(true);
  expect(memberDoc.data().app_role).toBe('user');
  expect(memberDoc.data().app_status).toBe('active');
});
```

### Test 3.2: POST /api/reset-password

#### 3.2.1 Successful Password Reset
```javascript
test('Admin can reset user password', async () => {
  const adminToken = await getAdminToken();
  const targetUserId = 'test-user-id';

  const response = await fetch('/api/reset-password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: targetUserId,
      clubId: 'calypso',
      newPassword: 'TempPass123!',
      requirePasswordChange: true
    })
  });

  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.success).toBe(true);
  expect(result.requirePasswordChange).toBe(true);

  // Verify Firestore flag
  const memberDoc = await admin.firestore()
    .collection('clubs').doc('calypso')
    .collection('members').doc(targetUserId)
    .get();

  expect(memberDoc.data().requirePasswordChange).toBe(true);
});
```

#### 3.2.2 Password Reset with Email Link
```javascript
test('Generates password reset link', async () => {
  const adminToken = await getAdminToken();

  const response = await fetch('/api/reset-password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: 'test-user-id',
      clubId: 'calypso',
      generateLink: true
    })
  });

  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.resetLink).toBeDefined();
  expect(result.resetLink).toContain('https://');
  expect(result.resetLink).toContain('mode=resetPassword');
});
```

---

## 4. FIRESTORE SECURITY RULES TESTS

### Test 4.1: User Role Restrictions
```javascript
describe('Firestore Security Rules - User Role', () => {
  let userAuth;

  beforeAll(async () => {
    userAuth = await signInAsUser(); // Role: user
  });

  test('Cannot read transactions collection', async () => {
    const db = firebase.firestore();

    await expect(
      db.collection('clubs').doc('calypso')
        .collection('transactions').get()
    ).rejects.toThrow('Missing or insufficient permissions');
  });

  test('Can only read own expense claims', async () => {
    const db = firebase.firestore();
    const userId = userAuth.uid;

    // Should succeed - own claim
    const ownClaim = await db.collection('clubs').doc('calypso')
      .collection('demands')
      .where('demandeur_id', '==', userId)
      .get();

    expect(ownClaim.empty).toBe(false);

    // Should fail - others' claims
    await expect(
      db.collection('clubs').doc('calypso')
        .collection('demands')
        .where('demandeur_id', '!=', userId)
        .get()
    ).rejects.toThrow('Missing or insufficient permissions');
  });

  test('Can only see own event registrations', async () => {
    const db = firebase.firestore();
    const userId = userAuth.uid;

    // Can read events where participant
    const myEvents = await db.collection('clubs').doc('calypso')
      .collection('participants')
      .where('membre_id', '==', userId)
      .get();

    expect(myEvents).toBeDefined();
  });
});
```

### Test 4.2: Admin Role Permissions
```javascript
describe('Firestore Security Rules - Admin Role', () => {
  let adminAuth;

  beforeAll(async () => {
    adminAuth = await signInAsAdmin(); // Role: admin
  });

  test('Can read all transactions', async () => {
    const db = firebase.firestore();

    const transactions = await db.collection('clubs').doc('calypso')
      .collection('transactions').limit(5).get();

    expect(transactions.empty).toBe(false);
    expect(transactions.size).toBeGreaterThan(0);
  });

  test('Can manage users collection', async () => {
    const db = firebase.firestore();
    const testUserId = 'test-user-' + Date.now();

    // Create
    await db.collection('clubs').doc('calypso')
      .collection('members').doc(testUserId)
      .set({
        email: `${testUserId}@test.com`,
        nom: 'Test',
        prenom: 'User',
        has_app_access: false,
        member_status: 'active'
      });

    // Read
    const doc = await db.collection('clubs').doc('calypso')
      .collection('members').doc(testUserId).get();

    expect(doc.exists).toBe(true);

    // Update
    await doc.ref.update({ app_role: 'user' });

    // Delete (cleanup)
    await doc.ref.delete();
  });
});
```

---

## 5. SESSION MANAGEMENT TESTS

### Test 5.1: Session Creation
```javascript
describe('Session Management', () => {
  test('Session created on login', async () => {
    // Login
    const userCred = await firebase.auth()
      .signInWithEmailAndPassword('user@test.com', 'Test123!');

    // Wait for session creation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check localStorage
    const sessionId = localStorage.getItem('sessionId');
    expect(sessionId).toBeDefined();

    // Check Firestore
    const db = firebase.firestore();
    const session = await db.collection('clubs').doc('calypso')
      .collection('sessions').doc(sessionId).get();

    expect(session.exists).toBe(true);
    expect(session.data().userId).toBe(userCred.user.uid);
    expect(session.data().isActive).toBe(true);
  });

  test('Session updates on activity', async () => {
    const sessionId = localStorage.getItem('sessionId');
    const initialActivity = localStorage.getItem('lastActivity');

    // Simulate activity
    document.dispatchEvent(new MouseEvent('mousemove'));

    // Check localStorage updated immediately
    const newActivity = localStorage.getItem('lastActivity');
    expect(Number(newActivity)).toBeGreaterThan(Number(initialActivity));

    // Wait for debounced Firestore update
    await new Promise(resolve => setTimeout(resolve, 61000)); // 1 min + 1 sec

    // Check Firestore updated
    const db = firebase.firestore();
    const session = await db.collection('clubs').doc('calypso')
      .collection('sessions').doc(sessionId).get();

    expect(session.data().lastActivityAt.seconds * 1000)
      .toBeGreaterThan(Number(initialActivity));
  });

  test('Session terminated on logout', async () => {
    const sessionId = localStorage.getItem('sessionId');

    // Logout
    await firebase.auth().signOut();

    // Check localStorage cleared
    expect(localStorage.getItem('sessionId')).toBe(null);
    expect(localStorage.getItem('lastActivity')).toBe(null);

    // Check Firestore session inactive
    const db = firebase.firestore();
    const session = await db.collection('clubs').doc('calypso')
      .collection('sessions').doc(sessionId).get();

    expect(session.data().isActive).toBe(false);
  });
});
```

---

## 6. INTEGRATION TESTS

### Test 6.1: Complete User Activation Flow
```javascript
test('End-to-end user activation', async () => {
  // Step 1: Admin creates member
  const adminAuth = await signInAsAdmin();
  const memberId = 'e2e-member-' + Date.now();
  const memberEmail = `${memberId}@test.com`;

  await firebase.firestore()
    .collection('clubs').doc('calypso')
    .collection('members').doc(memberId)
    .set({
      email: memberEmail,
      nom: 'E2E',
      prenom: 'Test',
      has_app_access: false,
      member_status: 'active',
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });

  // Step 2: Admin activates user via API
  const adminToken = await adminAuth.getIdToken();

  const activateResponse = await fetch('/api/activate-user', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: memberId,
      clubId: 'calypso',
      role: 'user'
    })
  });

  expect(activateResponse.status).toBe(200);
  const activateResult = await activateResponse.json();

  // Step 3: User logs in with temp password
  await firebase.auth().signOut(); // Logout admin

  const userAuth = await firebase.auth()
    .signInWithEmailAndPassword(memberEmail, '123456');

  expect(userAuth.user.email).toBe(memberEmail);

  // Step 4: Check forced password change
  const memberDoc = await firebase.firestore()
    .collection('clubs').doc('calypso')
    .collection('members').doc(memberId)
    .get();

  expect(memberDoc.data().requirePasswordChange).toBe(true);

  // Step 5: User changes password
  await userAuth.user.updatePassword('NewPass123!');

  // Step 6: Update Firestore flag
  await memberDoc.ref.update({
    requirePasswordChange: false
  });

  // Verify complete
  const updatedDoc = await memberDoc.ref.get();
  expect(updatedDoc.data().requirePasswordChange).toBe(false);
  expect(updatedDoc.data().has_app_access).toBe(true);
  expect(updatedDoc.data().app_role).toBe('user');
});
```

### Test 6.2: Permission Escalation Prevention
```javascript
test('Cannot escalate permissions through API', async () => {
  // User tries to activate with admin role
  const userAuth = await signInAsUser();
  const userToken = await userAuth.getIdToken();

  const response = await fetch('/api/activate-user', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: 'some-member',
      clubId: 'calypso',
      role: 'admin' // Trying to create admin
    })
  });

  expect(response.status).toBe(403);

  // Admin tries to create superadmin
  const adminAuth = await signInAsAdmin();
  const adminToken = await adminAuth.getIdToken();

  const adminResponse = await fetch('/api/activate-user', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: 'some-member',
      clubId: 'calypso',
      role: 'superadmin' // Admin cannot create superadmin
    })
  });

  expect(adminResponse.status).toBe(403);
  const error = await adminResponse.json();
  expect(error.error).toContain('créer un utilisateur avec ce rôle');
});
```

---

## 7. PERFORMANCE TESTS

### Test 7.1: Authentication Performance
```javascript
describe('Performance Tests', () => {
  test('Login completes within 3 seconds', async () => {
    const start = performance.now();

    await firebase.auth()
      .signInWithEmailAndPassword('user@test.com', 'Test123!');

    const end = performance.now();
    const duration = end - start;

    expect(duration).toBeLessThan(3000); // 3 seconds
    console.log(`Login duration: ${duration}ms`);
  });

  test('Token refresh within 1 second', async () => {
    await signInAsUser();

    const start = performance.now();
    await firebase.auth().currentUser.getIdToken(true);
    const end = performance.now();

    const duration = end - start;
    expect(duration).toBeLessThan(1000); // 1 second
    console.log(`Token refresh duration: ${duration}ms`);
  });

  test('Session validation within 500ms', async () => {
    const sessionId = localStorage.getItem('sessionId');

    const start = performance.now();

    // Validate session
    const db = firebase.firestore();
    const session = await db.collection('clubs').doc('calypso')
      .collection('sessions').doc(sessionId).get();

    const isValid = session.exists &&
      session.data().isActive &&
      session.data().expiresAt.toDate() > new Date();

    const end = performance.now();
    const duration = end - start;

    expect(duration).toBeLessThan(500); // 500ms
    console.log(`Session validation duration: ${duration}ms`);
  });
});
```

---

## 8. ERROR HANDLING TESTS

### Test 8.1: Network Errors
```javascript
describe('Network Error Handling', () => {
  test('Handles offline mode gracefully', async () => {
    // Go offline
    await firebase.firestore().disableNetwork();

    try {
      // Try to read data
      const db = firebase.firestore();
      await db.collection('clubs').doc('calypso')
        .collection('members').get();

      // Should use cache or throw specific error
    } catch (error) {
      expect(error.code).toBe('unavailable');
    } finally {
      // Go back online
      await firebase.firestore().enableNetwork();
    }
  });

  test('Retries failed API calls', async () => {
    let attempts = 0;

    // Mock fetch to fail twice then succeed
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (...args) => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network error');
      }
      return originalFetch(...args);
    });

    // Should retry and eventually succeed
    const response = await retryableApiCall('/api/some-endpoint');
    expect(attempts).toBe(3);
    expect(response).toBeDefined();

    // Restore
    global.fetch = originalFetch;
  });
});
```

### Test 8.2: Authentication Errors
```javascript
describe('Auth Error Handling', () => {
  test('Handles wrong password correctly', async () => {
    try {
      await firebase.auth()
        .signInWithEmailAndPassword('user@test.com', 'wrong');
    } catch (error) {
      expect(error.code).toBe('auth/wrong-password');
      expect(error.message).toContain('password');
    }
  });

  test('Handles user not found', async () => {
    try {
      await firebase.auth()
        .signInWithEmailAndPassword('nonexistent@test.com', 'pass');
    } catch (error) {
      expect(error.code).toBe('auth/user-not-found');
    }
  });

  test('Handles too many attempts', async () => {
    // Make multiple failed attempts
    for (let i = 0; i < 5; i++) {
      try {
        await firebase.auth()
          .signInWithEmailAndPassword('user@test.com', 'wrong');
      } catch (e) {
        // Ignore
      }
    }

    // Next attempt should be rate limited
    try {
      await firebase.auth()
        .signInWithEmailAndPassword('user@test.com', 'wrong');
    } catch (error) {
      expect(error.code).toBe('auth/too-many-requests');
    }
  });
});
```

---

## 9. TEST UTILITIES

### 9.1 Helper Functions
```javascript
// test-utils.js
export async function signInAsUser() {
  return await firebase.auth()
    .signInWithEmailAndPassword('user@test.com', 'Test123!');
}

export async function signInAsAdmin() {
  return await firebase.auth()
    .signInWithEmailAndPassword('admin@test.com', 'Test123!');
}

export async function signInAsSuperAdmin() {
  return await firebase.auth()
    .signInWithEmailAndPassword('superadmin@test.com', 'Test123!');
}

export async function getAuthToken(role = 'user') {
  const auth = await signInByRole(role);
  return await auth.user.getIdToken();
}

export async function createTestMember(id, data) {
  return await firebase.firestore()
    .collection('clubs').doc('calypso')
    .collection('members').doc(id)
    .set({
      ...data,
      has_app_access: false,
      member_status: 'active',
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function cleanupTestData(prefix = 'test-') {
  const db = firebase.firestore();

  // Clean members
  const members = await db.collection('clubs').doc('calypso')
    .collection('members')
    .where('email', '>=', prefix)
    .where('email', '<', prefix + '\uf8ff')
    .get();

  const batch = db.batch();
  members.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}
```

### 9.2 Test Data Factory
```javascript
// test-data-factory.js
export const TestDataFactory = {
  member: (overrides = {}) => ({
    email: `test-${Date.now()}@test.com`,
    nom: 'Test',
    prenom: 'User',
    has_app_access: false,
    member_status: 'active',
    is_diver: true,
    has_lifras: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  }),

  transaction: (overrides = {}) => ({
    numero_sequence: `TEST-${Date.now()}`,
    date_execution: new Date(),
    montant: 100,
    devise: 'EUR',
    contrepartie_nom: 'Test Counterparty',
    communication: 'Test transaction',
    statut: 'en_attente',
    reconcilie: false,
    ...overrides
  }),

  expenseClaim: (overrides = {}) => ({
    titre: 'Test Expense',
    montant: 50,
    description: 'Test expense claim',
    statut: 'brouillon',
    demandeur_id: 'test-user',
    date_demande: new Date(),
    ...overrides
  }),

  event: (overrides = {}) => ({
    titre: 'Test Event',
    type: 'evenement',
    date_debut: new Date(),
    date_fin: new Date(),
    montant_prevu: 500,
    prix_membre: 25,
    statut: 'ouvert',
    organisateur_id: 'test-organizer',
    ...overrides
  })
};
```

---

## 10. CONTINUOUS INTEGRATION SETUP

### 10.1 GitHub Actions Workflow
```yaml
# .github/workflows/auth-tests.yml
name: Authentication Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      firebase:
        image: firebase-emulator
        ports:
          - 9099:9099  # Auth
          - 8080:8080  # Firestore
          - 9199:9199  # Admin

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Setup Firebase Emulator
        run: |
          npm install -g firebase-tools
          firebase emulators:start --only auth,firestore &
          sleep 10

      - name: Run Auth Tests
        env:
          VITE_USE_FIREBASE_PROD: false
        run: npm run test:auth

      - name: Run API Tests
        run: npm run test:api

      - name: Generate Coverage Report
        run: npm run test:coverage

      - name: Upload Coverage
        uses: codecov/codecov-action@v2
        with:
          file: ./coverage/lcov.info
```

### 10.2 Test Scripts
```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:auth": "vitest src/tests/auth",
    "test:api": "vitest src/tests/api",
    "test:integration": "vitest src/tests/integration",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui"
  }
}
```

---

## 11. MONITORING & DEBUGGING

### 11.1 Firebase Auth Debug
```javascript
// Enable debug mode
firebase.auth().settings.appVerificationDisabledForTesting = true;

// Monitor auth state changes
firebase.auth().onAuthStateChanged((user) => {
  console.log('Auth state changed:', user ? user.uid : 'signed out');
});

// Monitor ID token changes
firebase.auth().onIdTokenChanged((user) => {
  if (user) {
    console.log('Token refreshed for:', user.uid);
  }
});
```

### 11.2 API Request Debugging
```javascript
// Intercept and log API requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('API Request:', args[0], args[1]);

  try {
    const response = await originalFetch(...args);
    console.log('API Response:', response.status, response.statusText);
    return response;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
```

### 11.3 Firestore Rules Debug
```javascript
// Enable Firestore debug logging
firebase.firestore.setLogLevel('debug');

// Monitor permission denials
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.code === 'permission-denied') {
    console.error('Firestore permission denied:', {
      path: event.reason.path,
      operation: event.reason.operation,
      user: firebase.auth().currentUser?.uid
    });
  }
});
```

---

## TEST EXECUTION CHECKLIST

### Pre-Test Setup
- [ ] Firebase emulator running
- [ ] Test users created in emulator
- [ ] Environment variables configured
- [ ] Test data seeded

### Firebase Auth Tests
- [ ] Initialization tests passing
- [ ] Login/logout flows working
- [ ] Custom claims retrieved
- [ ] Token refresh functional
- [ ] Persistence verified

### API Endpoint Tests
- [ ] /api/activate-user tested
- [ ] /api/reset-password tested
- [ ] Authorization verified
- [ ] Error handling confirmed

### Firestore Rules Tests
- [ ] User restrictions enforced
- [ ] Admin permissions working
- [ ] Custom claims priority verified
- [ ] Rule enforcement tested

### Integration Tests
- [ ] End-to-end flows passing
- [ ] Permission escalation prevented
- [ ] Session management working
- [ ] Error recovery functional

### Performance Tests
- [ ] Login < 3 seconds
- [ ] Token refresh < 1 second
- [ ] Session validation < 500ms
- [ ] API responses timely

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
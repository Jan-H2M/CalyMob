# CalyCompta Authentication Test Plan

## Executive Summary
Comprehensive test plan for verifying the authentication system, Firebase integration, and permission levels across all user types in the CalyCompta application.

---

## 1. AUTHENTICATION SYSTEM OVERVIEW

### User Roles & Hierarchy
```
superadmin (level 3) - Full system access
    ↓
admin (level 2) - User management access
    ↓
validateur (level 1) - Full operational access
    ↓
user (level 0) - Scoped to own data only
    ↓
membre (level -1) - Club member, no app access
```

### Authentication Components
- **Frontend**: React + Firebase Auth SDK
- **Backend**: Firebase Admin SDK via Vercel Functions
- **Database**: Firestore with Security Rules
- **Session**: Firestore-based with configurable timeout

---

## 2. TEST ENVIRONMENTS

### 2.1 Firebase Emulator Suite
```bash
# Start emulators
firebase emulators:start

# Connect to emulator in .env
VITE_USE_FIREBASE_PROD=false
```

### 2.2 Production Firebase
```bash
# Use production in .env
VITE_USE_FIREBASE_PROD=true
```

---

## 3. TEST SCENARIOS BY USER TYPE

### 3.1 MEMBRE (No App Access)
**Test User**: membre@test.com
**Purpose**: Club member without app access

#### Tests:
- [ ] **LOGIN-M01**: Verify login fails with "Access denied" message
- [ ] **LOGIN-M02**: Verify no Firebase Auth user exists
- [ ] **LOGIN-M03**: Verify member exists in Firestore with `has_app_access: false`
- [ ] **LOGIN-M04**: Verify audit log shows LOGIN_FAILED event

### 3.2 USER (Standard User)
**Test User**: user@test.com
**Password**: Test123!

#### Authentication Tests:
- [ ] **LOGIN-U01**: Successful login with email/password
- [ ] **LOGIN-U02**: Failed login with wrong password (3 attempts max)
- [ ] **LOGIN-U03**: Password reset flow via "Forgot Password"
- [ ] **LOGIN-U04**: First login password change requirement
- [ ] **LOGIN-U05**: Session creation in Firestore on login
- [ ] **LOGIN-U06**: Audit log entry for LOGIN_SUCCESS

#### Permission Tests:
- [ ] **PERM-U01**: Cannot access User Management (/users)
- [ ] **PERM-U02**: Cannot access Bank Transactions (/transactions)
- [ ] **PERM-U03**: Can view own Expense Claims only
- [ ] **PERM-U04**: Can view own Event Registrations only
- [ ] **PERM-U05**: Cannot access Settings (/settings)
- [ ] **PERM-U06**: Cannot approve expense claims

#### Session Tests:
- [ ] **SESS-U01**: Idle timeout warning after configured time
- [ ] **SESS-U02**: Auto-logout after timeout expiry
- [ ] **SESS-U03**: "Stay Connected" extends session
- [ ] **SESS-U04**: Multi-tab session synchronization
- [ ] **SESS-U05**: Session persists on browser refresh

### 3.3 VALIDATEUR (Validator)
**Test User**: validator@test.com
**Password**: Test123!

#### Authentication Tests:
- [ ] **LOGIN-V01**: Successful login
- [ ] **LOGIN-V02**: Correct role in AuthContext
- [ ] **LOGIN-V03**: Custom claims priority over Firestore

#### Permission Tests:
- [ ] **PERM-V01**: Full access to Transactions
- [ ] **PERM-V02**: Can approve expense claims (single approval)
- [ ] **PERM-V03**: Can manage Events
- [ ] **PERM-V04**: Can view all Members
- [ ] **PERM-V05**: Cannot create/delete users
- [ ] **PERM-V06**: Cannot change user roles
- [ ] **PERM-V07**: Can export reports (PDF/CSV)

#### Operational Tests:
- [ ] **OPS-V01**: Can reconcile transactions
- [ ] **OPS-V02**: Can link transactions to events
- [ ] **OPS-V03**: Can manage event registrations
- [ ] **OPS-V04**: Can upload justification documents

### 3.4 ADMIN (Administrator)
**Test User**: admin@test.com
**Password**: Test123!

#### Authentication Tests:
- [ ] **LOGIN-A01**: Successful login
- [ ] **LOGIN-A02**: Admin badge displayed in UI

#### Permission Tests:
- [ ] **PERM-A01**: Can access User Management
- [ ] **PERM-A02**: Can create new users (membre/user/validateur only)
- [ ] **PERM-A03**: Cannot create admin/superadmin users
- [ ] **PERM-A04**: Can activate/deactivate users
- [ ] **PERM-A05**: Can reset user passwords
- [ ] **PERM-A06**: Can view audit logs
- [ ] **PERM-A07**: Double approval for expenses > threshold

#### User Management Tests:
- [ ] **USER-A01**: Create new user with role 'user'
- [ ] **USER-A02**: Activate user (creates Firebase Auth account)
- [ ] **USER-A03**: Change user role (within allowed hierarchy)
- [ ] **USER-A04**: Deactivate user (preserves data)
- [ ] **USER-A05**: Reset user password (requires change on login)

### 3.5 SUPERADMIN (Super Administrator)
**Test User**: superadmin@test.com
**Password**: Test123!

#### Authentication Tests:
- [ ] **LOGIN-S01**: Successful login
- [ ] **LOGIN-S02**: Full permissions loaded

#### Permission Tests:
- [ ] **PERM-S01**: Can create any role including superadmin
- [ ] **PERM-S02**: Can modify permission configurations
- [ ] **PERM-S03**: Can access all settings
- [ ] **PERM-S04**: Can delete users (soft delete)
- [ ] **PERM-S05**: Can view all clubs (if multi-tenant)

#### System Administration Tests:
- [ ] **SYS-S01**: Configure security settings (timeout, auto-logout)
- [ ] **SYS-S02**: Manage permission matrix
- [ ] **SYS-S03**: Configure approval thresholds
- [ ] **SYS-S04**: Access Firebase configuration

---

## 4. FIREBASE AUTHENTICATION FLOW TESTS

### 4.1 Firebase Auth SDK Integration
- [ ] **FB-AUTH-01**: Firebase initialized with correct config
- [ ] **FB-AUTH-02**: Auth persistence set to LOCAL
- [ ] **FB-AUTH-03**: onAuthStateChanged listener active
- [ ] **FB-AUTH-04**: Custom claims retrieved from ID token
- [ ] **FB-AUTH-05**: Token refresh when expired

### 4.2 Firebase Admin SDK (API)
- [ ] **FB-ADMIN-01**: Service account initialized correctly
- [ ] **FB-ADMIN-02**: Can create Auth users via API
- [ ] **FB-ADMIN-03**: Can set custom claims via API
- [ ] **FB-ADMIN-04**: Can verify ID tokens
- [ ] **FB-ADMIN-05**: Can update passwords via API

### 4.3 Firestore Security Rules
- [ ] **FB-RULES-01**: User can only read own data
- [ ] **FB-RULES-02**: Validateur can read all operational data
- [ ] **FB-RULES-03**: Admin can manage users collection
- [ ] **FB-RULES-04**: Transactions blocked for 'user' role
- [ ] **FB-RULES-05**: Custom claims take precedence

---

## 5. API ENDPOINT TESTS

### 5.1 POST /api/activate-user
**Required**: Admin/Superadmin role

#### Test Cases:
- [ ] **API-ACT-01**: Success with valid admin token
- [ ] **API-ACT-02**: Fail with user token (403)
- [ ] **API-ACT-03**: Fail with invalid token (401)
- [ ] **API-ACT-04**: Creates Firebase Auth user
- [ ] **API-ACT-05**: Sets custom claims correctly
- [ ] **API-ACT-06**: Updates Firestore member document
- [ ] **API-ACT-07**: Creates audit log entry

#### Request Format:
```json
{
  "userId": "member-uuid",
  "clubId": "calypso",
  "role": "user"
}
```

### 5.2 POST /api/reset-password
**Required**: Admin/Superadmin role

#### Test Cases:
- [ ] **API-PWD-01**: Success with valid admin token
- [ ] **API-PWD-02**: Fail with user token (403)
- [ ] **API-PWD-03**: Updates Firebase Auth password
- [ ] **API-PWD-04**: Sets requirePasswordChange flag
- [ ] **API-PWD-05**: Creates audit log
- [ ] **API-PWD-06**: Returns password reset link

#### Request Format:
```json
{
  "userId": "user-firebase-uid",
  "clubId": "calypso",
  "newPassword": "TempPass123!",
  "requirePasswordChange": true
}
```

---

## 6. SESSION MANAGEMENT TESTS

### 6.1 Session Creation
- [ ] **SESS-01**: Session document created on login
- [ ] **SESS-02**: Session ID stored in localStorage
- [ ] **SESS-03**: Device info captured correctly
- [ ] **SESS-04**: Expiry time calculated from settings

### 6.2 Session Validation
- [ ] **SESS-05**: Valid session allows access
- [ ] **SESS-06**: Expired session forces logout
- [ ] **SESS-07**: Invalid session ID rejected
- [ ] **SESS-08**: Deleted session forces logout

### 6.3 Activity Tracking
- [ ] **SESS-09**: Mouse movements update activity
- [ ] **SESS-10**: Keyboard input updates activity
- [ ] **SESS-11**: Activity debounced (1 min minimum)
- [ ] **SESS-12**: Multi-tab activity synchronized

### 6.4 Idle Timeout
- [ ] **SESS-13**: Warning modal at (timeout - 2 min)
- [ ] **SESS-14**: Countdown timer displays correctly
- [ ] **SESS-15**: Progress bar color changes (blue→orange→red)
- [ ] **SESS-16**: Auto-logout at timeout
- [ ] **SESS-17**: "Stay Connected" refreshes session

---

## 7. ERROR HANDLING TESTS

### 7.1 Network Errors
- [ ] **ERR-01**: Offline mode handling
- [ ] **ERR-02**: Firebase service unavailable
- [ ] **ERR-03**: API endpoint timeout
- [ ] **ERR-04**: Retry mechanism for failed requests

### 7.2 Authentication Errors
- [ ] **ERR-05**: Invalid credentials message (French)
- [ ] **ERR-06**: Rate limiting after failed attempts
- [ ] **ERR-07**: Account disabled/suspended message
- [ ] **ERR-08**: Email not verified handling

### 7.3 Permission Errors
- [ ] **ERR-09**: Unauthorized access message
- [ ] **ERR-10**: Insufficient permissions dialog
- [ ] **ERR-11**: Role change requires re-login
- [ ] **ERR-12**: Expired token handling

---

## 8. SECURITY TESTS

### 8.1 Password Security
- [ ] **SEC-01**: Minimum 6 characters enforced
- [ ] **SEC-02**: Password not visible by default
- [ ] **SEC-03**: Password change on first login
- [ ] **SEC-04**: Old password not reusable

### 8.2 Token Security
- [ ] **SEC-05**: JWT tokens signed correctly
- [ ] **SEC-06**: Tokens expire after 1 hour
- [ ] **SEC-07**: Refresh token rotation
- [ ] **SEC-08**: Token not exposed in URLs

### 8.3 Data Protection
- [ ] **SEC-09**: PII encrypted in transit (HTTPS)
- [ ] **SEC-10**: Sensitive data not in localStorage
- [ ] **SEC-11**: Audit logs capture IP/User-Agent
- [ ] **SEC-12**: CORS configured correctly

---

## 9. PERFORMANCE TESTS

### 9.1 Login Performance
- [ ] **PERF-01**: Login completes < 3 seconds
- [ ] **PERF-02**: Token refresh < 1 second
- [ ] **PERF-03**: Session validation < 500ms

### 9.2 Session Management
- [ ] **PERF-04**: Activity tracking non-blocking
- [ ] **PERF-05**: Debouncing reduces Firestore writes
- [ ] **PERF-06**: localStorage cache reduces reads

---

## 10. UI/UX TESTS

### 10.1 Login Page
- [ ] **UI-01**: Logo displays correctly
- [ ] **UI-02**: Form validation messages clear
- [ ] **UI-03**: Loading spinner during auth
- [ ] **UI-04**: Password visibility toggle works
- [ ] **UI-05**: "Remember me" functionality

### 10.2 Protected Routes
- [ ] **UI-06**: Loading state while checking auth
- [ ] **UI-07**: Redirect to login when unauthorized
- [ ] **UI-08**: Return to original URL after login
- [ ] **UI-09**: Breadcrumbs show current location

### 10.3 User Feedback
- [ ] **UI-10**: Success notifications (toast)
- [ ] **UI-11**: Error messages informative
- [ ] **UI-12**: Warning dialogs before destructive actions
- [ ] **UI-13**: Session timeout warning clear

---

## 11. INTEGRATION TESTS

### 11.1 End-to-End Flows

#### New User Onboarding
1. Admin creates user
2. User activation via API
3. Email sent with temp password
4. User logs in first time
5. Forced password change
6. Access granted to app

#### Expense Claim Approval
1. User submits expense claim
2. Validateur receives notification
3. Validateur approves (single)
4. Admin second approval (if > threshold)
5. Transaction linked
6. User notified of approval

#### Session Timeout Flow
1. User logs in successfully
2. User goes idle
3. Warning modal appears
4. Countdown begins
5. User clicks "Stay Connected"
6. Session extended
7. Modal closes

---

## 12. TEST DATA SETUP

### 12.1 Test Users Creation Script
```javascript
// Create test users for each role
const testUsers = [
  { email: 'membre@test.com', role: 'membre', hasAppAccess: false },
  { email: 'user@test.com', role: 'user', hasAppAccess: true },
  { email: 'validator@test.com', role: 'validateur', hasAppAccess: true },
  { email: 'admin@test.com', role: 'admin', hasAppAccess: true },
  { email: 'superadmin@test.com', role: 'superadmin', hasAppAccess: true }
];
```

### 12.2 Test Data Requirements
- 5 test users (one per role)
- 10 test transactions
- 5 test events
- 3 expense claims per user
- Audit logs for each action

---

## 13. AUTOMATED TEST SUITE

### 13.1 Unit Tests (Jest/Vitest)
```javascript
// Test permission service
describe('PermissionService', () => {
  test('hasPermission returns correct value', () => {
    // Test implementation
  });

  test('role hierarchy enforced', () => {
    // Test implementation
  });
});
```

### 13.2 Integration Tests (Cypress)
```javascript
// Test login flow
describe('Authentication Flow', () => {
  it('should login successfully with valid credentials', () => {
    cy.visit('/login');
    cy.get('[data-testid="email"]').type('user@test.com');
    cy.get('[data-testid="password"]').type('Test123!');
    cy.get('[data-testid="login-btn"]').click();
    cy.url().should('include', '/dashboard');
  });
});
```

### 13.3 API Tests (Postman/Newman)
```json
{
  "name": "Activate User",
  "request": {
    "method": "POST",
    "url": "{{baseUrl}}/api/activate-user",
    "headers": {
      "Authorization": "Bearer {{adminToken}}"
    },
    "body": {
      "userId": "{{testUserId}}",
      "clubId": "calypso",
      "role": "user"
    }
  }
}
```

---

## 14. TEST EXECUTION CHECKLIST

### Phase 1: Setup (Day 1)
- [ ] Configure test environment
- [ ] Create test users
- [ ] Seed test data
- [ ] Verify Firebase emulator

### Phase 2: Authentication (Day 2)
- [ ] Test each user role login
- [ ] Test password flows
- [ ] Test session management
- [ ] Test timeout scenarios

### Phase 3: Permissions (Day 3)
- [ ] Test role-based access
- [ ] Test permission enforcement
- [ ] Test Firestore rules
- [ ] Test API authorization

### Phase 4: Integration (Day 4)
- [ ] Test end-to-end flows
- [ ] Test error scenarios
- [ ] Test performance
- [ ] Test security

### Phase 5: Reporting (Day 5)
- [ ] Document findings
- [ ] Create bug reports
- [ ] Suggest improvements
- [ ] Final test report

---

## 15. TEST REPORTING TEMPLATE

### Test Execution Summary
```
Test Date: ___________
Tester: ___________
Environment: ___________
Build Version: ___________

Total Tests: ___
Passed: ___
Failed: ___
Blocked: ___
Not Run: ___

Pass Rate: ___%
```

### Critical Issues Found
1. **Issue ID**: ___
   - **Severity**: Critical/High/Medium/Low
   - **Component**: ___
   - **Description**: ___
   - **Steps to Reproduce**: ___
   - **Expected**: ___
   - **Actual**: ___
   - **Screenshot/Video**: ___

### Recommendations
1. Security improvements
2. Performance optimizations
3. UX enhancements
4. Code refactoring needs

---

## 16. TROUBLESHOOTING GUIDE

### Common Issues

#### Firebase Emulator Not Starting
```bash
# Check if ports are in use
lsof -i :9099  # Auth
lsof -i :8080  # Firestore

# Kill processes if needed
kill -9 <PID>
```

#### Custom Claims Not Working
```javascript
// Force token refresh
await auth.currentUser.getIdToken(true);
```

#### Session Not Persisting
```javascript
// Check localStorage
console.log(localStorage.getItem('sessionId'));
console.log(localStorage.getItem('lastActivity'));
```

#### API Authentication Failing
```javascript
// Verify token format
// Should be: Bearer <token>
const token = await auth.currentUser.getIdToken();
console.log('Token:', token);
```

---

## APPENDIX A: Firebase Security Rules Reference

```javascript
// Example rules for user role
match /clubs/{clubId}/members/{memberId} {
  allow read: if request.auth != null &&
    (request.auth.uid == memberId ||
     request.auth.token.role in ['admin', 'superadmin', 'validateur']);

  allow write: if request.auth != null &&
    request.auth.token.role in ['admin', 'superadmin'];
}

match /clubs/{clubId}/transactions/{transactionId} {
  allow read: if request.auth != null &&
    request.auth.token.role != 'user'; // Users blocked from transactions
}
```

---

## APPENDIX B: Test User Credentials

| Email | Password | Role | Notes |
|-------|----------|------|--------|
| membre@test.com | N/A | membre | No app access |
| user@test.com | Test123! | user | Standard user |
| validator@test.com | Test123! | validateur | Can approve |
| admin@test.com | Test123! | admin | User management |
| superadmin@test.com | Test123! | superadmin | Full access |

---

## APPENDIX C: API Endpoint Reference

| Endpoint | Method | Auth Required | Role Required |
|----------|--------|---------------|---------------|
| /api/activate-user | POST | Yes | admin, superadmin |
| /api/reset-password | POST | Yes | admin, superadmin |
| /api/change-password | POST | Yes | Any authenticated |

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
*Next Review: [Review Date]*
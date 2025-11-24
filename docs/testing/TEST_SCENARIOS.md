# CalyCompta Test Scenarios by User Type

## Test Environment Setup

### Prerequisites
1. Firebase Emulator Suite installed
2. Test database with sample data
3. Test user accounts created
4. Chrome DevTools for network inspection
5. Postman for API testing

### Test Data
```javascript
// Test Users
const TEST_USERS = {
  membre: { email: 'membre@test.com', password: null },
  user: { email: 'user@test.com', password: 'Test123!' },
  validateur: { email: 'validator@test.com', password: 'Test123!' },
  admin: { email: 'admin@test.com', password: 'Test123!' },
  superadmin: { email: 'superadmin@test.com', password: 'Test123!' }
};
```

---

## 1. MEMBRE TEST SCENARIOS

### Scenario M-1: No App Access Login Attempt
**Objective**: Verify membres without app access cannot login

**Steps**:
1. Navigate to https://localhost:5173/login
2. Enter email: `membre@test.com`
3. Enter any password
4. Click "Se connecter"

**Expected Results**:
- Error message: "Accès refusé. Vous n'avez pas l'autorisation d'accéder à cette application."
- No Firebase Auth session created
- Audit log entry: LOGIN_FAILED with reason "no_app_access"
- User remains on login page

**Validation**:
```javascript
// Check in browser console
firebase.auth().currentUser // Should be null

// Check Firestore
// clubs/calypso/members/{memberId}
// Should have: has_app_access: false
```

---

## 2. USER (STANDARD) TEST SCENARIOS

### Scenario U-1: Successful Login
**Objective**: Verify standard user can login successfully

**Steps**:
1. Navigate to https://localhost:5173/login
2. Enter email: `user@test.com`
3. Enter password: `Test123!`
4. Click "Se connecter"

**Expected Results**:
- Redirected to /dashboard
- Session created in Firestore
- Welcome message displayed
- User menu shows correct name
- Audit log: LOGIN_SUCCESS

**Validation**:
```javascript
// Browser console
firebase.auth().currentUser.email // "user@test.com"
localStorage.getItem('sessionId') // Should exist
localStorage.getItem('lastActivity') // Recent timestamp
```

### Scenario U-2: Transaction Access Blocked
**Objective**: Verify users cannot access bank transactions

**Steps**:
1. Login as user@test.com
2. Try to navigate to /transactions
3. Or manually enter URL: https://localhost:5173/transactions

**Expected Results**:
- Access denied page shown
- Message: "Vous n'avez pas les permissions nécessaires"
- No transaction data loaded
- Network tab shows 403 error from Firestore

**Validation**:
```javascript
// Check network tab for Firestore query
// Should see permission denied error
// Response: "Missing or insufficient permissions"
```

### Scenario U-3: View Own Expense Claims Only
**Objective**: Verify scoped access to expense claims

**Steps**:
1. Login as user@test.com
2. Navigate to /demandes
3. View list of expense claims

**Expected Results**:
- Only shows claims where demandeur_id matches user ID
- Cannot see other users' claims
- Can create new claim
- Can edit own claims in draft status
- Cannot approve/reject any claims

**Test Data Setup**:
```javascript
// Create test claims
const claims = [
  { demandeur_id: 'user-id', titre: 'User Claim 1', statut: 'brouillon' },
  { demandeur_id: 'user-id', titre: 'User Claim 2', statut: 'soumis' },
  { demandeur_id: 'other-id', titre: 'Other User Claim', statut: 'soumis' } // Should not be visible
];
```

### Scenario U-4: Idle Timeout Warning
**Objective**: Test inactivity timeout and warning modal

**Steps**:
1. Login as user@test.com
2. Remain inactive for (timeout - 2) minutes
3. Warning modal should appear
4. Wait for countdown to reach 10 seconds
5. Click "Rester connecté"

**Expected Results**:
- Warning modal appears at correct time
- Countdown timer shows MM:SS format
- Progress bar changes color (blue → orange → red)
- Clicking button extends session
- Modal closes and user remains logged in

**Validation**:
```javascript
// Monitor in console
localStorage.getItem('lastActivity') // Should update
// Check Firestore session document
// lastActivityAt should be updated
```

### Scenario U-5: First Login Password Change
**Objective**: Verify forced password change on first login

**Setup**:
```javascript
// Set in Firestore: membres/{userId}
{ requirePasswordChange: true }
```

**Steps**:
1. Login as user with requirePasswordChange flag
2. Password change modal should appear immediately
3. Enter new password (min 6 chars)
4. Confirm new password
5. Click "Changer le mot de passe"

**Expected Results**:
- Cannot dismiss modal
- Password updated in Firebase Auth
- requirePasswordChange flag removed
- Can access application normally
- Audit log: PASSWORD_CHANGED

---

## 3. VALIDATEUR TEST SCENARIOS

### Scenario V-1: Full Transaction Access
**Objective**: Verify validateurs can manage transactions

**Steps**:
1. Login as validator@test.com
2. Navigate to /transactions
3. Perform various operations

**Test Operations**:
- View all transactions ✓
- Filter by date/category ✓
- Reconcile transaction ✓
- Link to event/claim ✓
- Edit transaction details ✓
- Cannot delete transactions ✗

**Expected Results**:
- Full transaction list visible
- All operations successful except delete
- Changes saved to Firestore
- Audit trail for modifications

### Scenario V-2: Single Approval for Small Expenses
**Objective**: Test expense approval below threshold

**Setup**:
```javascript
// Threshold setting: 100€
const claim = {
  montant: 50,
  statut: 'soumis',
  titre: 'Small Expense'
};
```

**Steps**:
1. Login as validator@test.com
2. Navigate to /demandes
3. Find claim with amount < 100€
4. Click "Approuver"
5. Add approval comment

**Expected Results**:
- Status changes to 'approuve'
- Single approval sufficient
- approuve_par field set
- Email sent to requester
- Audit log: EXPENSE_APPROVED

### Scenario V-3: Event Management
**Objective**: Test event creation and management

**Steps**:
1. Login as validator@test.com
2. Navigate to /evenements
3. Click "Nouvel événement"
4. Fill form:
   - Titre: "Plongée Test"
   - Date: Future date
   - Prix membre: 25€
   - Capacité: 20
5. Save event
6. Add participants
7. Mark payments

**Expected Results**:
- Event created successfully
- Can manage all registrations
- Can link bank transactions
- Cannot delete event
- Event visible to all users

---

## 4. ADMIN TEST SCENARIOS

### Scenario A-1: User Creation Flow
**Objective**: Test complete user creation process

**Steps**:
1. Login as admin@test.com
2. Navigate to /users
3. Click "Nouvel utilisateur"
4. Fill form:
   - Email: newuser@test.com
   - Nom: Test
   - Prénom: User
   - Role: user
5. Click "Créer"
6. Click "Activer" on user row

**Expected Results**:
- Member created in Firestore
- Activation creates Firebase Auth account
- Temp password: "123456"
- Email sent with credentials
- Audit log: USER_CREATED, USER_ACTIVATED

**API Call Validation**:
```javascript
// POST /api/activate-user
{
  headers: { Authorization: 'Bearer [token]' },
  body: {
    userId: 'member-id',
    clubId: 'calypso',
    role: 'user'
  }
}
// Response: 200 OK
```

### Scenario A-2: Role Change Within Hierarchy
**Objective**: Test role assignment limitations

**Test Cases**:
1. Change user → validateur ✓
2. Change validateur → user ✓
3. Change user → admin ✗
4. Change user → superadmin ✗

**Steps**:
1. Login as admin@test.com
2. Navigate to /users
3. Select user to modify
4. Click "Modifier le rôle"
5. Select new role from dropdown
6. Save changes

**Expected Results**:
- Can assign: membre, user, validateur
- Cannot assign: admin, superadmin
- Error for unauthorized roles
- Audit log: ROLE_CHANGED (success only)

### Scenario A-3: Double Approval for Large Expenses
**Objective**: Test two-tier approval process

**Setup**:
```javascript
const largeExpense = {
  montant: 150,
  statut: 'en_attente_validation',
  approuve_par: 'validator-id', // First approval done
  requires_double_approval: true
};
```

**Steps**:
1. Login as admin@test.com
2. Navigate to /demandes
3. Find expense > 100€ with first approval
4. Click "Approuver (2ème validation)"
5. Add comment

**Expected Results**:
- Status changes to 'approuve'
- approuve_par_2 field populated
- date_approbation_2 timestamp set
- Both approvers recorded
- Email to requester with both approvers

### Scenario A-4: Password Reset for User
**Objective**: Test admin password reset capability

**Steps**:
1. Login as admin@test.com
2. Navigate to /users
3. Select any user
4. Click "Réinitialiser mot de passe"
5. Confirm action

**Expected Results**:
- New password set to "123456"
- requirePasswordChange: true
- User forced to change on next login
- Email sent to user
- Audit log: PASSWORD_RESET

**API Validation**:
```bash
curl -X POST https://localhost:5173/api/reset-password \
  -H "Authorization: Bearer [admin-token]" \
  -d '{
    "userId": "user-firebase-uid",
    "clubId": "calypso",
    "requirePasswordChange": true
  }'
```

---

## 5. SUPERADMIN TEST SCENARIOS

### Scenario S-1: Create Admin User
**Objective**: Test superadmin exclusive capability

**Steps**:
1. Login as superadmin@test.com
2. Navigate to /users
3. Create new user with role: admin
4. Activate user

**Expected Results**:
- Admin user created successfully
- Custom claims include admin role
- New admin can login
- New admin has admin permissions
- Cannot create another superadmin

### Scenario S-2: Permission Matrix Configuration
**Objective**: Modify role permissions

**Steps**:
1. Login as superadmin@test.com
2. Navigate to /settings/permissions
3. Select "validateur" role
4. Add permission: "transactions.delete"
5. Save changes

**Expected Results**:
- Permission added to role
- Changes saved to Firebase
- Existing validateurs must re-login
- New permission effective after re-login
- Audit log: PERMISSIONS_UPDATED

### Scenario S-3: Security Settings Configuration
**Objective**: Modify system-wide security settings

**Steps**:
1. Login as superadmin@test.com
2. Navigate to /settings/security
3. Modify settings:
   - Enable auto-logout: Yes
   - Idle timeout: 30 minutes
   - Approval threshold: 200€
4. Save changes

**Expected Results**:
- Settings saved to Firebase
- All active sessions use new timeout
- New threshold applied immediately
- Warning modal timing adjusted
- Audit log: SETTINGS_UPDATED

### Scenario S-4: Delete User (Soft Delete)
**Objective**: Test user deletion process

**Steps**:
1. Login as superadmin@test.com
2. Navigate to /users
3. Select user to delete
4. Click "Supprimer l'utilisateur"
5. Confirm deletion

**Expected Results**:
- User status: 'deleted'
- Firebase Auth account disabled
- Data preserved in Firestore
- User cannot login
- Audit log: USER_DELETED

---

## 6. FIREBASE INTEGRATION SCENARIOS

### Scenario F-1: Token Refresh
**Objective**: Test automatic token refresh

**Steps**:
1. Login as any user
2. Wait 55 minutes (tokens expire at 60)
3. Perform any authenticated action

**Expected Results**:
- Token refreshes automatically
- No login prompt
- Action completes successfully
- New token valid for 60 minutes

**Validation**:
```javascript
// Force token refresh
const token = await firebase.auth().currentUser.getIdToken(true);
console.log('New token:', token);
```

### Scenario F-2: Multi-Tab Session
**Objective**: Test session across browser tabs

**Steps**:
1. Login in Tab 1
2. Open app in Tab 2
3. Logout in Tab 1
4. Check Tab 2

**Expected Results**:
- Tab 2 detects logout
- Redirects to login page
- Session cleared in both tabs
- localStorage sync working

### Scenario F-3: Emulator vs Production
**Objective**: Test environment switching

**Setup**:
```bash
# .env.local
VITE_USE_FIREBASE_PROD=false

# Start emulator
firebase emulators:start
```

**Steps**:
1. Start app with emulator
2. Check connection banner
3. Create test data
4. Switch to production
5. Verify data isolation

**Expected Results**:
- Emulator banner visible in dev
- Data isolated between environments
- No production data in emulator
- Smooth switching via env var

---

## 7. ERROR HANDLING SCENARIOS

### Scenario E-1: Network Failure
**Objective**: Test offline handling

**Steps**:
1. Login successfully
2. Disconnect network (DevTools)
3. Try to load new data
4. Reconnect network

**Expected Results**:
- Cached data still visible
- Error message for new requests
- Auto-retry when reconnected
- No data loss

### Scenario E-2: Invalid Credentials
**Objective**: Test login error handling

**Steps**:
1. Enter valid email
2. Enter wrong password
3. Try login 5 times

**Expected Results**:
- Error: "Email ou mot de passe incorrect"
- After 3 attempts: Rate limiting
- After 5: Temporary block (5 min)
- Audit log: Multiple LOGIN_FAILED

### Scenario E-3: Expired Session
**Objective**: Test expired session handling

**Setup**:
```javascript
// Manually expire session in Firestore
// Set expiresAt to past timestamp
```

**Steps**:
1. Login and get valid session
2. Manually expire in Firestore
3. Try to perform action

**Expected Results**:
- Session validation fails
- Redirect to login
- Message: "Votre session a expiré"
- Must login again

---

## 8. PERFORMANCE SCENARIOS

### Scenario P-1: Login Speed
**Objective**: Measure login performance

**Steps**:
1. Clear browser cache
2. Navigate to login
3. Enter credentials
4. Measure time to dashboard

**Expected Metrics**:
- Page load: < 1 second
- Login request: < 2 seconds
- Dashboard render: < 1 second
- Total: < 4 seconds

**Measurement**:
```javascript
// Browser Performance API
performance.mark('login-start');
// ... login process ...
performance.mark('login-end');
performance.measure('login-duration', 'login-start', 'login-end');
```

### Scenario P-2: Session Activity Updates
**Objective**: Verify debouncing works

**Steps**:
1. Login and open Network tab
2. Move mouse continuously
3. Type in various fields
4. Monitor Firestore writes

**Expected Results**:
- Activity detected immediately
- Firestore updates max 1/minute
- localStorage updates immediate
- No performance degradation

---

## Test Execution Checklist

### Per User Type Testing

#### MEMBRE Testing
- [ ] Cannot login
- [ ] Proper error messages
- [ ] Audit logging

#### USER Testing
- [ ] Login/logout
- [ ] Scoped permissions
- [ ] Transaction blocking
- [ ] Own data access
- [ ] Idle timeout

#### VALIDATEUR Testing
- [ ] Full operational access
- [ ] Single approval
- [ ] Event management
- [ ] Transaction reconciliation
- [ ] Report generation

#### ADMIN Testing
- [ ] User management
- [ ] Role assignment
- [ ] Double approval
- [ ] Password resets
- [ ] Settings access

#### SUPERADMIN Testing
- [ ] Create admins
- [ ] Permission config
- [ ] Security settings
- [ ] User deletion
- [ ] Full system access

---

## Test Results Template

### Test Execution Record
```
Test ID: _________
Tester: _________
Date: _________
Environment: _________

Test Scenario: _________
User Type: _________

Steps Executed:
1. ✓/✗ Step description
2. ✓/✗ Step description
3. ✓/✗ Step description

Expected vs Actual:
- Expected: _________
- Actual: _________

Status: PASS / FAIL / BLOCKED

Issues Found:
- Issue #1: _________
- Issue #2: _________

Screenshots: [Attach if failed]
Logs: [Attach relevant logs]

Notes: _________
```

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
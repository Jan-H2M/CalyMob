# Additional Authentication Tests - Execution Guide

**Date**: November 16, 2025
**Previous Tests**: ✅ Basic authentication flows PASSED (3/3)

---

## Test Suite Overview

This guide covers additional authentication and security tests:

1. **API Endpoint Testing** - Reset password API
2. **Password Change Flow** - Force password change on login
3. **Expense Claims Scoped Access** - User role data isolation
4. **Session Timeout** - Idle warning and auto-logout
5. **Audit Logs** - Verify authentication events are logged

---

## Test 4: API Endpoint - Reset Password

### 📋 Objective
Verify `/api/reset-password` endpoint works correctly and enforces admin permissions.

### 🔧 Setup
Run the test script in your terminal:
```bash
cd /Users/jan/Documents/GitHub/CalyCompta
node scripts/test-reset-password-api.mjs
```

### 📝 Test Steps

1. **Script will prompt for admin credentials**
   - Use: `jan.andriessens@gmail.com` (superadmin)
   - Or: `pamrom@yahoo.com` (admin)

2. **Select test user to reset**
   - Choose: `user@test.caly.be` (option 1)

3. **Script will:**
   - Get admin auth token
   - Call POST `/api/reset-password`
   - Verify new password is `123456`
   - Test login with new password

### ✅ Expected Results
- API returns 200 OK
- Response includes: `"success": true`
- User can login with new password `123456`
- `requirePasswordChange: true` flag is set

### 📊 Success Criteria
- [ ] API call succeeds with admin token
- [ ] Password is reset to `123456`
- [ ] Login works with new password
- [ ] User should be prompted to change password (check in UI)

---

## Test 5: Password Change Flow

### 📋 Objective
Verify forced password change on first login after reset.

### 📝 Test Steps

1. **Login to web app**: http://localhost:5174/
   - Email: `user@test.caly.be`
   - Password: `123456` (after reset from Test 4)

2. **Expected: Password Change Modal**
   - Should appear immediately after login
   - Cannot be dismissed
   - Forces user to change password

3. **Change Password**
   - Enter new password (min 6 chars)
   - Confirm new password
   - Click "Change Password"

4. **Verify**
   - Modal closes
   - User can access app normally
   - `requirePasswordChange` flag removed in Firestore

### ✅ Expected Results
- ✅ Modal appears immediately after login
- ✅ Cannot access app without changing password
- ✅ Password change succeeds
- ✅ Flag removed from user document

### 📊 Success Criteria
- [ ] Password change modal appears
- [ ] Modal cannot be dismissed
- [ ] Password updates successfully
- [ ] Can login with new password
- [ ] No password change prompt on subsequent logins

---

## Test 6: Expense Claims Scoped Access (User Role)

### 📋 Objective
Verify USER role can only see their own expense claims, not others'.

### 🔧 Preparation

First, check what expense claims exist:
```bash
node scripts/check-expense-claims.mjs
```

### 📝 Test Steps

1. **Login as user@test.caly.be**
   - Use current password

2. **Navigate to Expense Claims page**
   - Click "Dépenses" in menu
   - Or go to: http://localhost:5174/demandes

3. **Observe what claims are visible**
   - Note the number of claims shown
   - Check the `demandeur_id` of visible claims

4. **Create a test claim**
   - Click "New Expense Claim"
   - Fill in details
   - Submit

5. **Login as validateur@test.caly.be**
   - Navigate to same expense claims page
   - Should see ALL claims (including user's claim + others)

6. **Compare**
   - User should see fewer claims than validateur
   - User should only see claims where `demandeur_id` matches their UID

### ✅ Expected Results

**As user@test.caly.be**:
- ✅ Can see own claims only (demandeur_id = PkA47sGbB2ZLlwQBPf1fSa0iQ803)
- ❌ Cannot see claims from other users
- ✅ Can create new claims
- ✅ Can edit own draft claims

**As validateur@test.caly.be**:
- ✅ Can see ALL claims (including user's)
- ✅ Can approve/reject claims
- ✅ Full visibility into all expense requests

### 📊 Success Criteria
- [ ] User sees only their own claims
- [ ] Validateur sees all claims
- [ ] User can create claims
- [ ] Firestore rules enforce scoping correctly

### 🔍 Verification Query
Check in browser console (while logged in as user):
```javascript
// This should fail with permission denied for other users' claims
```

---

## Test 7: Session Timeout & Idle Warning

### 📋 Objective
Verify session timeout warnings appear and auto-logout works.

### 📝 Current Settings
Check current timeout in Firestore:
- Path: `clubs/calypso/settings/security`
- Field: `sessionTimeoutMinutes`
- Default: Usually 30-60 minutes

### 📝 Test Steps (Long Running)

**Option A: Manual Testing** (if timeout is short enough)
1. Login as any test user
2. Leave browser idle for (timeout - 2) minutes
3. Warning modal should appear
4. Countdown timer shows remaining time
5. Click "Stay Logged In" to extend session
6. OR let it expire and verify auto-logout

**Option B: Temporarily Reduce Timeout** (Recommended)
1. Login as superadmin
2. Go to Settings > Security
3. Change `sessionTimeoutMinutes` to `2` (2 minutes)
4. Save
5. Login as test user
6. Wait 1 minute
7. Warning should appear at 1:50
8. Test both options:
   - Click "Stay Logged In"
   - Let timer expire

### ✅ Expected Results
- ⏰ Warning appears at (timeout - warning time)
- ⏳ Countdown timer accurate
- 🔵 Progress bar changes color (blue → orange → red)
- ✅ "Stay Logged In" extends session
- 🚪 Auto-logout works when countdown reaches 0
- 🔐 User redirected to login page

### 📊 Success Criteria
- [ ] Warning modal appears at correct time
- [ ] Countdown timer works
- [ ] Can extend session
- [ ] Auto-logout after timeout
- [ ] Session cleared from Firestore
- [ ] localStorage cleared

---

## Test 8: Audit Log Verification

### 📋 Objective
Verify authentication events are logged in audit trail.

### 📝 Test Steps

1. **Login as superadmin**
   - Email: `jan.andriessens@gmail.com`

2. **Navigate to Audit Logs**
   - Look for "Logs" or "Audit" menu item
   - Or check Firestore directly

3. **Check for these events**:
   - `LOGIN_SUCCESS` for test users
   - `LOGIN_FAILED` for membre@test.caly.be
   - `PASSWORD_RESET` for reset password tests
   - `PASSWORD_CHANGED` if password was changed
   - `LOGOUT` events

4. **Verify log contents**:
   - Timestamp
   - User ID
   - Action type
   - IP address (if available)
   - User agent

### 📍 Firestore Path
```
clubs/calypso/audit_logs/{logId}
```

### ✅ Expected Log Structure
```json
{
  "action": "LOGIN_SUCCESS",
  "userId": "PkA47sGbB2ZLlwQBPf1fSa0iQ803",
  "userName": "Standard User",
  "email": "user@test.caly.be",
  "timestamp": "2025-11-16T12:30:00Z",
  "severity": "info",
  "clubId": "calypso",
  "details": {
    "userAgent": "...",
    "ip": "..."
  }
}
```

### 📊 Success Criteria
- [ ] Login events logged
- [ ] Failed login attempts logged
- [ ] Password reset events logged
- [ ] Logout events logged
- [ ] All required fields present
- [ ] Timestamps accurate

---

## Test Summary Checklist

### Core Tests (Already Complete) ✅
- [x] Membre cannot login (no app access)
- [x] User can login with limited access
- [x] Validateur can login with full access
- [x] Transaction blocking for user role
- [x] Transaction access for validateur role

### Additional Tests (To Complete)
- [ ] Test 4: Reset Password API
- [ ] Test 5: Password Change Flow
- [ ] Test 6: Expense Claims Scoped Access
- [ ] Test 7: Session Timeout Warning
- [ ] Test 8: Audit Log Verification

---

## Quick Reference

### Test Credentials
```
user@test.caly.be
  Current: Calypso2024! (or 123456 after reset)
  UID: PkA47sGbB2ZLlwQBPf1fSa0iQ803

validateur@test.caly.be
  Password: Calypso2024!
  UID: RNA5k97QsOgn5PaqWZM3Cs69BTa2

Admin/Superadmin:
  jan.andriessens@gmail.com
  pamrom@yahoo.com
```

### Useful URLs
```
App: http://localhost:5174/
Transactions: /transactions
Expenses: /demandes
Settings: /settings
Audit Logs: /logs (if available)
```

### Test Scripts
```bash
# Reset password API test
node scripts/test-reset-password-api.mjs

# Check expense claims
node scripts/check-expense-claims.mjs

# Create test users (already done)
node scripts/add-test-user-firestore.mjs
```

---

## Next Steps

1. **Choose which tests to run** (all or subset)
2. **Run API test first** (easiest to verify)
3. **Then test password change flow**
4. **Check expense claim scoping**
5. **Optionally test timeout** (requires time/patience)
6. **Update AUTH_TEST_RESULTS.md** with findings

---

*Last Updated: November 16, 2025*

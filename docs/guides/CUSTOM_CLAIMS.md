# 🔥 CRITICAL: Custom Claims Synchronization

## ❌ The Problem

**SYMPTOM**: Users randomly log in with wrong role (usually "user" instead of their actual role like "superadmin" or "admin").

**ROOT CAUSE**: Firebase Auth custom claims are NOT automatically synchronized with Firestore data.

### What Happens:

1. **User is created** with role `superadmin` in Firestore ✅
2. **Custom claims are NOT set** in Firebase Auth (or become outdated) ❌
3. **Token refresh** happens automatically (Firebase refreshes tokens periodically)
4. **AuthContext.tsx** tries to load role from custom claims → finds `undefined`
5. **Fallback to default** → User becomes `'user'` (last fallback in priority chain)

### Example Timeline:

```
09:00 - Login with correct role (Firestore: superadmin) ✅
09:15 - Firebase token refresh happens automatically 🔄
09:15 - Custom claims are undefined → role reverts to 'user' ❌
09:15 - User is now logged in as 'user' instead of 'superadmin' 🚨
```

## ✅ The Solution

**3-Part Fix:**

### 1. **Update AuthContext Priority** (Code Fix)

**File**: `src/contexts/AuthContext.tsx` (lines 115-116)

**Before** (BROKEN):
```typescript
app_role: (firestoreUserData?.app_role || firestoreUserData?.role || customClaims.role || 'user')
```

**After** (FIXED):
```typescript
app_role: (customClaims.role || firestoreUserData?.app_role || firestoreUserData?.role || 'user')
```

**Why**: Custom claims take precedence because they're included in EVERY Firebase Auth token and are the source of truth during token refreshes.

### 2. **Sync All Existing Users** (One-Time Script)

**Script**: `scripts/sync-custom-claims.cjs`

**Run Once**:
```bash
node scripts/sync-custom-claims.cjs
```

**What it does**:
- Reads ALL members from Firestore
- Syncs their `role`, `clubId`, `status`, `isActive` to Firebase Auth custom claims
- Reports: Updated / Already up-to-date / Skipped (no Firebase Auth) / Errors

**Example Output**:
```
📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total members:       85
✅ Updated:          8
✓  Already up-to-date: 1
⚠️  Skipped:          76 (no Firebase Auth account)
❌ Errors:           0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Options**:
```bash
# Dry-run mode (test, no changes)
node scripts/sync-custom-claims.cjs --dry-run

# Sync specific user
node scripts/sync-custom-claims.cjs --email=jan@example.com

# Sync all users (production)
node scripts/sync-custom-claims.cjs
```

### 3. **Update All User Creation/Activation Scripts** (Prevention)

**All scripts now set custom claims automatically:**

#### `scripts/create-user.cjs`
```typescript
await auth.setCustomUserClaims(userRecord.uid, {
  role: role,          // ✅ Required
  clubId: clubId,      // ✅ Required
  status: 'active',    // ✅ CRITICAL (prevents reversion)
  isActive: true       // ✅ CRITICAL (prevents reversion)
});
```

#### `scripts/activate-user.cjs`
```typescript
await auth.setCustomUserClaims(userRecord.uid, {
  role: member.role,
  clubId: CLUB_ID,
  status: 'active',
  isActive: true
});
```

#### `api/activate-user.js` (Vercel)
```typescript
await admin.auth().setCustomUserClaims(userRecord.uid, {
  role: memberData.role,
  clubId: clubId,
  status: 'active',
  isActive: true
});
```

#### `api/reset-password.js` (Vercel) - **NEW FIX**
```typescript
// CRITICAL: Set/update custom claims to prevent role reversion bug
const memberRole = memberData.app_role || memberData.role || 'user';
await admin.auth().setCustomUserClaims(userId, {
  role: memberRole,
  clubId: clubId,
  status: 'active',
  isActive: true
});
```

## 🔍 How to Debug

### Check User's Custom Claims:
```bash
node -e "
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin.auth().getUserByEmail('user@example.com')
  .then(user => {
    console.log('UID:', user.uid);
    console.log('Custom Claims:', user.customClaims);
    process.exit(0);
  });
"
```

**Expected Output**:
```json
Custom Claims: {
  "role": "superadmin",
  "clubId": "calypso",
  "status": "active",
  "isActive": true
}
```

**Bad Output** (causes bug):
```json
Custom Claims: undefined
```
OR
```json
Custom Claims: {
  "role": "user",
  "clubId": "calypso"
}
// Missing status and isActive!
```

### Fix Single User:
```bash
node scripts/sync-custom-claims.cjs --email=user@example.com
```

## 📋 Deployment Checklist

When deploying to production:

- [ ] Run `node scripts/sync-custom-claims.cjs` ONCE to sync existing users
- [ ] Deploy updated `AuthContext.tsx` (custom claims priority fix)
- [ ] Deploy updated API endpoints (`activate-user.js`, `reset-password.js`)
- [ ] Verify scripts are updated (`create-user.cjs`, `activate-user.cjs`)
- [ ] Test: Create new user → Check custom claims → Login → Verify role persists

## 🎯 Best Practices

### ✅ DO:
- **Always set custom claims** when creating Firebase Auth users
- **Include ALL fields**: `role`, `clubId`, `status`, `isActive`
- **Sync custom claims** after any role change in Firestore
- **Trust custom claims** as source of truth (not Firestore)

### ❌ DON'T:
- Don't rely only on Firestore for role/status
- Don't forget to set custom claims during user creation
- Don't modify role in Firestore without syncing custom claims
- Don't skip `status` and `isActive` fields (causes reversion bug)

## 🚀 Quick Reference Commands

```bash
# Sync all users (production)
node scripts/sync-custom-claims.cjs

# Test sync (dry-run)
node scripts/sync-custom-claims.cjs --dry-run

# Sync specific user
node scripts/sync-custom-claims.cjs --email=jan@example.com

# Create new user (auto-sets claims)
node scripts/create-user.cjs

# Activate pending user (auto-sets claims)
node scripts/activate-user.cjs

# Check user claims
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
admin.auth().getUserByEmail('user@email.com').then(u => console.log(u.customClaims));
"
```

## 📚 Related Documentation

- **Firebase Custom Claims**: https://firebase.google.com/docs/auth/admin/custom-claims
- **AuthContext Implementation**: `src/contexts/AuthContext.tsx` (lines 83-139)
- **User Creation Scripts**: `scripts/create-user.cjs`, `scripts/activate-user.cjs`
- **API Endpoints**: `api/activate-user.js`, `api/reset-password.js`

---

**Last Updated**: 2025-11-06
**Fixed By**: Custom claims priority update + sync script + preventive measures in all user creation flows

# CalyCompta Permission Matrix

## User Roles & Permission Levels

### Role Hierarchy
```
SUPERADMIN (Level 3) - Full system control
     ↓
ADMIN (Level 2) - User & settings management
     ↓
VALIDATEUR (Level 1) - Full operational access
     ↓
USER (Level 0) - Limited to own data
     ↓
MEMBRE (Level -1) - No application access
```

---

## Detailed Permission Matrix

### Legend
- ✅ Full Access
- 🔒 Scoped (Own Data Only)
- ⚠️ Conditional Access
- ❌ No Access
- 🚫 Blocked by Firestore Rules

| Permission | MEMBRE | USER | VALIDATEUR | ADMIN | SUPERADMIN | Notes |
|------------|--------|------|------------|-------|------------|--------|
| **AUTHENTICATION** |
| Login to App | ❌ | ✅ | ✅ | ✅ | ✅ | Requires `has_app_access: true` |
| Change Own Password | ❌ | ✅ | ✅ | ✅ | ✅ | Via Firebase Auth |
| Reset Own Password | ❌ | ✅ | ✅ | ✅ | ✅ | Email link |
| **USER MANAGEMENT** |
| View All Users | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Create Users | ❌ | ❌ | ❌ | ✅ | ✅ | Admin: up to validateur |
| Activate Users | ❌ | ❌ | ❌ | ✅ | ✅ | Creates Firebase account |
| Deactivate Users | ❌ | ❌ | ❌ | ✅ | ✅ | Soft delete |
| Delete Users | ❌ | ❌ | ❌ | ❌ | ✅ | Permanent deletion |
| Reset User Passwords | ❌ | ❌ | ❌ | ✅ | ✅ | Forces change on login |
| Assign Role: membre | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Assign Role: user | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Assign Role: validateur | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Assign Role: admin | ❌ | ❌ | ❌ | ❌ | ✅ | Only superadmin |
| Assign Role: superadmin | ❌ | ❌ | ❌ | ❌ | ✅ | Only superadmin |
| **TRANSACTIONS** |
| View Transactions | ❌ | 🚫 | ✅ | ✅ | ✅ | USER blocked by rules |
| Create Transactions | ❌ | 🚫 | ✅ | ✅ | ✅ | Import/manual entry |
| Edit Transactions | ❌ | 🚫 | ✅ | ✅ | ✅ | |
| Delete Transactions | ❌ | 🚫 | ❌ | ✅ | ✅ | |
| Reconcile Transactions | ❌ | 🚫 | ✅ | ✅ | ✅ | |
| Link Transactions | ❌ | 🚫 | ✅ | ✅ | ✅ | To events/claims |
| Export Transactions | ❌ | 🚫 | ✅ | ✅ | ✅ | CSV/PDF |
| **EXPENSE CLAIMS** |
| View All Claims | ❌ | ❌ | ✅ | ✅ | ✅ | |
| View Own Claims | ❌ | 🔒 | ✅ | ✅ | ✅ | USER: own only |
| Create Claims | ❌ | ✅ | ✅ | ✅ | ✅ | |
| Edit Own Claims | ❌ | ✅ | ✅ | ✅ | ✅ | If status=draft |
| Edit All Claims | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Delete Own Claims | ❌ | ✅ | ✅ | ✅ | ✅ | If status=draft |
| Delete All Claims | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Approve Claims (Single) | ❌ | ❌ | ✅ | ✅ | ✅ | < threshold |
| Approve Claims (Double) | ❌ | ❌ | ❌ | ✅ | ✅ | >= threshold |
| Reject Claims | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Mark as Reimbursed | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Upload Documents | ❌ | ✅ | ✅ | ✅ | ✅ | For own claims |
| **EVENTS** |
| View All Events | ❌ | 🔒 | ✅ | ✅ | ✅ | USER: type='evenement' |
| Create Events | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Edit Events | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Delete Events | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Manage Registrations | ❌ | ❌ | ✅ | ✅ | ✅ | |
| View Own Registrations | ❌ | 🔒 | ✅ | ✅ | ✅ | |
| Register for Events | ❌ | ✅ | ✅ | ✅ | ✅ | |
| Cancel Registration | ❌ | ✅ | ✅ | ✅ | ✅ | Own only |
| **MEMBERS** |
| View Member List | ❌ | ✅ | ✅ | ✅ | ✅ | Basic info only |
| View Member Details | ❌ | ❌ | ✅ | ✅ | ✅ | Full profile |
| Edit Member Info | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Import Members | ❌ | ❌ | ❌ | ✅ | ✅ | Excel/CSV |
| Export Members | ❌ | ❌ | ✅ | ✅ | ✅ | |
| **REPORTS** |
| View Reports | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Generate Reports | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Export PDF | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Export CSV | ❌ | ❌ | ✅ | ✅ | ✅ | |
| **SETTINGS** |
| View Settings | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Edit Club Info | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Edit Security Settings | ❌ | ❌ | ❌ | ✅ | ✅ | Timeout, auto-logout |
| Edit Categories | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Edit Account Codes | ❌ | ❌ | ❌ | ✅ | ✅ | |
| Edit Permissions | ❌ | ❌ | ❌ | ❌ | ✅ | Role permissions |
| Edit Email Templates | ❌ | ❌ | ❌ | ✅ | ✅ | |
| **AUDIT & LOGS** |
| View Audit Logs | ❌ | ❌ | ❌ | ✅ | ✅ | |
| View Own Activity | ❌ | ✅ | ✅ | ✅ | ✅ | |
| Export Audit Logs | ❌ | ❌ | ❌ | ✅ | ✅ | |
| **INVENTORY** |
| View Inventory | ❌ | ✅ | ✅ | ✅ | ✅ | |
| Manage Inventory | ❌ | ❌ | ✅ | ✅ | ✅ | |
| Request Equipment | ❌ | ✅ | ✅ | ✅ | ✅ | |
| Approve Loans | ❌ | ❌ | ✅ | ✅ | ✅ | |

---

## Firestore Security Rules Enforcement

### Rule-Enforced Permissions (Cannot be bypassed from UI)

#### USER Role Restrictions
```javascript
// Transactions - COMPLETELY BLOCKED
match /clubs/{clubId}/transactions/{transactionId} {
  allow read, write: if request.auth.token.role != 'user';
}

// Expense Claims - SCOPED TO OWN
match /clubs/{clubId}/demands/{demandId} {
  allow read: if request.auth.token.role == 'user'
    ? resource.data.demandeur_id == request.auth.uid
    : true;
}

// Events - SCOPED TO OWN + TYPE FILTER
match /clubs/{clubId}/operations/{operationId} {
  allow read: if request.auth.token.role == 'user'
    ? resource.data.type == 'evenement' &&
      exists(/databases/$(database)/documents/clubs/$(clubId)/participants/$(request.auth.uid))
    : true;
}
```

---

## Custom Permissions System

### Available Granular Permissions
```typescript
export type Permission =
  // User Management
  | 'users.view'
  | 'users.create'
  | 'users.update'
  | 'users.delete'
  | 'users.activate'
  | 'users.assign_role'

  // Transactions
  | 'transactions.view'
  | 'transactions.create'
  | 'transactions.update'
  | 'transactions.delete'
  | 'transactions.reconcile'
  | 'transactions.link'
  | 'transactions.sign'

  // Demands (Expense Claims)
  | 'demands.view'
  | 'demands.create'
  | 'demands.update'
  | 'demands.delete'
  | 'demands.approve'
  | 'demands.reject'
  | 'demands.reimburse'
  | 'demands.upload_documents'

  // Events
  | 'events.view'
  | 'events.create'
  | 'events.manage'
  | 'events.delete'

  // Settings
  | 'settings.view'
  | 'settings.update'
  | 'settings.permissions'

  // Reports
  | 'reports.view'
  | 'reports.export'
  | 'reports.create'

  // Audit
  | 'audit.view';
```

### Default Role Permissions

#### USER Default Permissions
```javascript
[
  'demands.view',      // Own only (enforced by rules)
  'demands.create',
  'demands.update',    // Own + draft only
  'demands.delete',    // Own + draft only
  'demands.upload_documents',
  'events.view',       // Own only (enforced by rules)
]
```

#### VALIDATEUR Default Permissions
```javascript
[
  ...userPermissions,
  'transactions.view',
  'transactions.create',
  'transactions.update',
  'transactions.reconcile',
  'transactions.link',
  'demands.approve',    // Single approval
  'demands.reject',
  'demands.reimburse',
  'events.create',
  'events.manage',
  'reports.view',
  'reports.export'
]
```

#### ADMIN Default Permissions
```javascript
[
  ...validateurPermissions,
  'users.view',
  'users.create',      // Up to validateur role
  'users.update',
  'users.activate',
  'users.assign_role', // Up to validateur role
  'transactions.delete',
  'demands.delete',
  'events.delete',
  'settings.view',
  'settings.update',
  'audit.view'
]
```

#### SUPERADMIN Permissions
```javascript
// ALL PERMISSIONS - No restrictions
Object.values(Permission)
```

---

## Permission Checking Logic

### Frontend (AuthContext)
```javascript
// Check single permission
const canViewUsers = hasPermission('users.view');

// Check multiple permissions (ANY)
const canManageExpenses = hasAnyPermission([
  'demands.approve',
  'demands.reject',
  'demands.reimburse'
]);

// Check multiple permissions (ALL)
const canFullyManageUsers = hasAllPermissions([
  'users.create',
  'users.update',
  'users.delete'
]);

// Check role
const isAdmin = hasRole('admin');
const isAdminOrHigher = hasRole(['admin', 'superadmin']);
```

### Backend (Firebase Functions)
```javascript
// Verify token and check claims
const decodedToken = await admin.auth().verifyIdToken(token);
const userRole = decodedToken.role;
const permissions = decodedToken.permissions || [];

// Check permission
if (!permissions.includes('users.create')) {
  throw new Error('Insufficient permissions');
}

// Check role hierarchy
const roleHierarchy = {
  'membre': -1,
  'user': 0,
  'validateur': 1,
  'admin': 2,
  'superadmin': 3
};

if (roleHierarchy[userRole] < roleHierarchy['admin']) {
  throw new Error('Admin role required');
}
```

---

## Special Permission Rules

### 1. Double Approval for Expenses
- Threshold: Configurable (default 100€)
- First Approval: VALIDATEUR or higher
- Second Approval: ADMIN or higher
- Both approvals tracked separately

### 2. Role Assignment Hierarchy
- USER → Can't assign roles
- VALIDATEUR → Can't assign roles
- ADMIN → Can assign: membre, user, validateur
- SUPERADMIN → Can assign: ALL roles

### 3. Custom Claims Priority
```javascript
// Order of precedence:
1. Firebase Auth Custom Claims (highest)
2. Firestore Member Document
3. Default Role Permissions (lowest)

// Example:
if (idToken.customClaims.role) {
  // Use custom claim role
} else if (firestoreMember.app_role) {
  // Use Firestore role
} else {
  // Default to 'user'
}
```

### 4. Session-Based Permissions
- Permissions loaded once at login
- Cached in AuthContext for session
- Changes require re-login to take effect

---

## Testing Permission Scenarios

### Scenario 1: User Tries to Access Transactions
```
User: user@test.com (role: user)
Action: Navigate to /transactions
Expected:
- Firestore rules block read
- UI shows "Access Denied"
- Audit log: UNAUTHORIZED_ACCESS
```

### Scenario 2: Admin Creates Superadmin
```
User: admin@test.com (role: admin)
Action: Create user with role=superadmin
Expected:
- API returns 403 Forbidden
- Message: "Cannot assign superadmin role"
- Audit log: PERMISSION_DENIED
```

### Scenario 3: Validateur Double Approval
```
User: validator@test.com (role: validateur)
Action: Approve expense > 100€
Expected:
- First approval successful
- Status: "en_attente_validation"
- Requires admin for second approval
```

### Scenario 4: Custom Permissions Override
```
User: special@test.com
Base Role: user
Custom Permissions: ['transactions.view']
Expected:
- Can view transactions (override)
- Cannot edit (no permission)
- Other user restrictions apply
```

---

## Troubleshooting Permission Issues

### Issue: User Can't Access Expected Resource
1. Check Firebase Auth custom claims
2. Verify Firestore member document
3. Check session permissions in AuthContext
4. Review Firestore security rules
5. Check audit logs for denial reason

### Issue: Permission Changes Not Taking Effect
1. User must log out and log in
2. Clear localStorage session
3. Force token refresh:
```javascript
await auth.currentUser.getIdToken(true);
```

### Issue: Firestore Rules Blocking Access
1. Check rule enforcement type (BLOCKED/SCOPED)
2. Verify user ID matches resource owner
3. Check resource type filters
4. Review custom claims in token

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
# CalyCompta Scripts

This directory contains Firebase Admin SDK scripts for managing users, testing email templates, and importing members in the CalyCompta application.

## Table of Contents
- [Prerequisites](#prerequisites)
- [User Management Scripts](#user-management-scripts)
- [Email Template Testing](#email-template-testing)
- [Member Import Scripts](#member-import-scripts)
- [Maintenance Scripts](#maintenance-scripts)

## Prerequisites

Before running these scripts, ensure you have:

1. **Firebase CLI installed**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Logged in to Firebase**:
   ```bash
   firebase login
   ```

3. **Firebase Admin dependencies**:
   ```bash
   npm install firebase-admin
   ```

## User Management Scripts

### 1. setup-firebase-auth.cjs

Creates multiple demo users with different roles for testing purposes.

**Usage:**
```bash
node scripts/setup-firebase-auth.cjs
```

**Created Users:**
- `demo@calypso.be` (password: demo123) - Validateur role
- `admin@calypso.be` (password: admin123) - Admin role
- `user@calypso.be` (password: user123) - User role

**What it does:**
1. Creates Firebase Authentication users
2. Sets custom claims (role, clubId)
3. Creates Firestore documents in `/clubs/calypso/members/{userId}`
4. Handles existing users gracefully (updates instead of failing)

### 2. create-user.cjs

Interactive script for creating individual users.

**Usage:**
```bash
node scripts/create-user.cjs
```

**Interactive Prompts:**
- Email address
- Display name
- Password (minimum 6 characters)
- Role (user, validateur, admin, superadmin)
- Club ID (default: calypso)

**What it does:**
1. Prompts for user details
2. Creates Firebase Authentication user
3. Sets custom claims
4. Creates Firestore document
5. Shows confirmation and login credentials

### 3. activate-user.cjs

**NEW (2025-11-01)**: Activates members created via UI (Firestore-only → Firebase Auth).

**Usage:**
```bash
node scripts/activate-user.cjs
```

**What it does:**
1. Lists all members with `pendingActivation: true` (created via UI without Firebase Auth)
2. Prompts to select which member(s) to activate
3. Creates Firebase Auth account with **default password: `123456`**
4. Sets custom claims (role, clubId)
5. Updates Firestore document (removes `pendingActivation`, sets `isActive: true`)
6. Creates audit log entry

**Interactive Workflow:**
- Shows list of pending members with email, role, creation date
- Option to activate individual member or all at once
- Confirmation prompt before activation
- Summary of activated members

**Important:**
- Default password is **always `123456`**
- Users **must change password on first login**
- Use "Réinitialiser mot de passe" button in UI if Firebase Auth account already exists

**Example:**
```
Found 2 member(s) awaiting activation:

  1. jan H2 (jan@H2M.ai)
     Role: validateur
     Created: 01/11/2025

  2. Julie Dupont (julie.dupont@example.com)
     Role: user
     Created: 31/10/2025

Enter member number to activate (or "all" for all members, "q" to quit): 1

⚠️  You are about to activate 1 member(s).
   Default password will be: 123456
   Users must change their password on first login.

Proceed? (yes/no): yes

✅ SUCCESS: jan H2 activated!
   Email: jan@H2M.ai
   Temporary password: 123456
   ⚠️  User must change password on first login
```

### 4. create-admin-user.js

Quick script to create an admin user (no prompts).

**Usage:**
```bash
node scripts/create-admin-user.js
```

Creates: `admin@example.com` with password `admin123` and admin role.

### 5. deploy-functions.sh

**NEW (2025-11-01)**: Automated Cloud Functions deployment with retry logic.

**Usage:**
```bash
./scripts/deploy-functions.sh
```

**What it does:**
1. Checks Firebase CLI installation and authentication
2. Attempts to deploy Cloud Functions
3. Automatically retries up to 3 times if deployment fails
4. Detects known Google Cloud Build errors
5. Suggests script fallback if all retries fail

**Features:**
- ✅ Automatic retry on Cloud Build failures
- ✅ Colored output (success/error/warning)
- ✅ Progress tracking for each attempt
- ✅ 10-second delay between retries
- ✅ Clear error messages and suggestions

**Example Output:**
```
═══════════════════════════════════════════════════════════
  Firebase Cloud Functions Deployment (with Auto-Retry)
═══════════════════════════════════════════════════════════

🔐 Checking Firebase authentication...
✓ Logged in to Firebase
   Project: calycompta

📤 Deployment attempt 1/3...

❌ Deployment failed (attempt 1/3)
   Known issue: Google Cloud Build infrastructure problem

⏳ Waiting 10 seconds before retry...

📤 Deployment attempt 2/3...

═══════════════════════════════════════════════════════════
✅ SUCCESS: Cloud Functions deployed successfully!
═══════════════════════════════════════════════════════════
```

**When to use:**
- First-time deployment of `activateUser` Cloud Function
- After updating function code
- When experiencing Cloud Build errors
- Instead of manual `firebase deploy --only functions`

---

## Email Template Testing

### test-email-template.cjs

Tests email templates locally by rendering them with sample data and optionally sending test emails.

**Purpose**: Validate email templates before Cloud Functions deployment

**Usage:**
```bash
node scripts/test-email-template.cjs <templateId> [options]
```

**Options:**
- `--club <clubId>` - Specify club ID (default: calypso)
- `--send <email>` - Send test email to specified address
- `--help` - Show help message

**Examples:**

1. **Render template and save to HTML**:
   ```bash
   node scripts/test-email-template.cjs abc123
   ```
   Output: `output/template-abc123-[timestamp].html`

2. **Render for specific club**:
   ```bash
   node scripts/test-email-template.cjs abc123 --club otherclub
   ```

3. **Render and send test email**:
   ```bash
   node scripts/test-email-template.cjs abc123 --send test@example.com
   ```

**What it does:**
1. Loads template from Firestore (`/clubs/{clubId}/email_templates/{templateId}`)
2. Selects sample data based on template type (pending_demands, events, transactions, members)
3. Renders template with Handlebars
4. Saves rendered HTML to `output/` directory
5. Validates template (checks for missing variables, security issues, email size)
6. Optionally sends test email via MailerSend

**Sample Data Available:**
- **pending_demands**: 3 expense demands (1 urgent, total 245.50€)
- **events**: Event with 12 participants, payment statuses
- **transactions**: Weekly summary with 25 transactions
- **members**: Welcome email with temporary password

**Output Example:**
```
🔍 Loading template...
   Club ID: calypso
   Template ID: abc123

✅ Template loaded: Rappel Demandes Personnalisé
   Type: pending_demands
   Active: Yes
   Created: 05/11/2025
   Usage: 12 times

🎨 Rendering template with sample data...

📧 Rendered Email:
   Subject: 📧 3 demande(s) de remboursement en attente
   HTML length: 8542 characters

💾 Rendered HTML saved to: /path/to/output/template-abc123-1730845234.html
   Open in browser: file:///path/to/output/template-abc123-1730845234.html

🔍 Template Validation:
   ✅ All required variables present
   ✅ No obvious security issues
   ✅ Email size OK: 8.34 KB

✅ Template test complete!
```

**Use Cases:**

1. **Before Production**: Test templates before Cloud Functions deploy
2. **Template Development**: Iterate on template design with immediate feedback
3. **Debugging**: Identify rendering issues or missing variables
4. **QA**: Validate templates work correctly with sample data
5. **Documentation**: Generate HTML previews for documentation

**Requirements:**
- Firebase Admin SDK configured
- `serviceAccountKey.json` in `` directory
- Handlebars installed: `npm install handlebars`

**Troubleshooting:**

- **"Template not found"**: Verify template ID exists in Firestore
- **"Cannot find module"**: Run `npm install` in calycompta-app directory
- **"Missing required variables"**: Update sample data in script or template variables
- **"Permission denied"**: Check serviceAccountKey.json has correct permissions

---

## Important Notes

### Firebase Auth vs Firestore

CalyCompta uses **two separate systems** for user management:

1. **Firebase Authentication**: Handles login, passwords, email verification
2. **Firestore Database**: Stores user profile data, roles, permissions

Both must be set up for a user to function properly:

```
Firebase Auth User (UID: abc123)
    ↓
    ├─ Custom Claims: { role: "validateur", clubId: "calypso" }
    └─ Firestore Doc: /clubs/calypso/members/abc123
         ├─ email: "user@example.com"
         ├─ displayName: "User Name"
         ├─ role: "validateur"
         ├─ isActive: true
         └─ ... (other fields)
```

### Creating Users from the UI

**✅ PRODUCTION READY (2025-11-01)**: UI-based member creation with Cloud Function or script activation!

#### **Recommended Production Workflow**

**1. Admin creates member in UI** (Paramètres → Membres & Sécurité → "Créer un utilisateur"):
   - Creates Firestore document only (no Firebase Auth yet)
   - Member marked with `pendingActivation: true` and `isActive: false`
   - Member appears in list with amber badge "En attente d'activation"
   - **User CANNOT log in yet**

**2A. Activate via UI (Cloud Function)** ⭐ PREFERRED METHOD:
   - Click **"Activer Firebase Auth"** button in user detail panel
   - Cloud Function creates Firebase Auth account with password `123456`
   - Firestore updated automatically (`pendingActivation` removed, `isActive: true`)
   - Success message shows temporary password
   - User can now log in

**2B. Activate via Script** (Fallback if Cloud Function unavailable):
   - Click **"📋 Copier pour script"** button to copy email to clipboard
   - Run activation script:
     ```bash
     node scripts/activate-user.cjs
     ```
   - Same result as Cloud Function (creates Firebase Auth + updates Firestore)

**Automatic Fallback:** If Cloud Function deployment fails due to Google Cloud Build issues, the UI will:
- Show error: "Cloud Function indisponible"
- Automatically display script instructions
- Copy user email to clipboard
- Allow you to activate via script as backup

#### **Cloud Function Implementation**

**Status:** ✅ Code complete, ready for deployment

**Location:** `functions/src/index.ts`

**Function:** `activateUser` (2nd Gen Cloud Function)

**Deployment:**

Option 1 - Quick deploy:
```bash
firebase deploy --only functions
```

Option 2 - With auto-retry (handles Cloud Build issues):
```bash
./scripts/deploy-functions.sh
```

**Known Issue:** Google Cloud Build may experience intermittent failures:
- Error: "Build failed with status: FAILURE"
- Empty build logs
- Cloud Run service not found
- **Solution:** Use auto-retry script or wait and redeploy later

**What the Cloud Function does:**
1. Verifies caller is admin/superadmin
2. Checks member has `pendingActivation: true`
3. Creates Firebase Auth account (UID matches Firestore doc ID)
4. Sets custom claims (role, clubId)
5. Updates Firestore (removes `pendingActivation`, sets `isActive: true`)
6. Creates audit log entry
7. Returns success with temporary password `123456`

**Security:**
- Requires authenticated user
- Only admin/superadmin can activate
- Validates all inputs
- Handles edge cases (already exists, invalid email, etc.)

#### **Alternative: Direct Script Creation**

Admins can still create users directly via script (skips UI + activation steps):
```bash
node scripts/create-user.cjs
```
This creates both Firebase Auth + Firestore in one step.

#### **Why Two-Step Activation?**

Firebase Auth user creation requires **Firebase Admin SDK**, which:
- Can only run on the **backend** (Node.js, Cloud Functions, scripts)
- Cannot run in the **browser** (security limitation)
- Requires elevated permissions not available in client-side code

**Security Benefit:** Prevents malicious users from creating unlimited accounts in Firebase Auth

### Role Hierarchy

- **user**: Basic access (read-only, can create demands)
- **validateur**: Can validate expenses, manage transactions (except settings)
- **admin**: Full access including user management and settings
- **superadmin**: Complete system access (multi-club support)

### Security

- Passwords are hashed by Firebase (never stored in plain text)
- Custom claims are tamper-proof (signed by Firebase)
- Firestore rules enforce role-based permissions
- Scripts require Firebase CLI authentication (admin access)

### Troubleshooting

**Error: "PERMISSION_DENIED"**
- Make sure you're logged in: `firebase login`
- Verify project: `firebase use calycompta`

**Error: "Email already exists"**
- The script handles this gracefully - it will update existing users
- Check Firebase Console > Authentication to see existing users

**Error: "Module not found: firebase-admin"**
- Install dependencies: `npm install firebase-admin`

**User can't log in after creation**
- Verify Firebase Auth user exists (Firebase Console > Authentication)
- Check Firestore document exists (Firebase Console > Firestore)
- Verify custom claims are set: Check user in Authentication console

**UI says "User not found"**
- The Firestore document might be missing
- Run the script again - it will create the missing document
- Check path: `/clubs/calypso/members/{userId}` should exist

## Development vs Production

These scripts work with the Firebase project specified in `.firebaserc`:

```json
{
  "projects": {
    "default": "calycompta"
  }
}
```

To switch between projects:
```bash
firebase use staging   # Use staging project
firebase use default   # Use production project
```

Always verify which project you're using before creating users!

### 3. delete-incomplete-expenses.js

Script pour supprimer toutes les dépenses avec description "À compléter".

**Usage:**
```bash
node scripts/delete-incomplete-expenses.js
```

**What it does:**
1. Searches for all expenses with `description === "À compléter"`
2. Displays list of expenses that will be deleted (ID, title, amount, date, etc.)
3. Asks for double confirmation before deletion
4. Deletes expenses in batches (max 500 per batch for Firestore limits)
5. Shows progress and final statistics

**Safety Features:**
- ⚠️ Requires double confirmation (2x "oui")
- Shows detailed list of what will be deleted before proceeding
- Uses Firestore batch operations for reliability
- **IRREVERSIBLE** - deleted expenses cannot be recovered!

**Use Cases:**
- Clean up test/demo expenses created during document review
- Remove incomplete expense drafts
- Database maintenance

**Example Output:**
```
📋 3 dépense(s) trouvée(s):

1. ID: abc123
   Description: À compléter
   Titre: Document test
   Montant: 50€
   Date: 23/10/2025
   Demandeur: User Demo
   Statut: en_attente

⚠️  ATTENTION: Cette action va supprimer 3 dépense(s) de Firestore!
⚠️  Cette action est IRRÉVERSIBLE!

Voulez-vous continuer? (oui/non):
```

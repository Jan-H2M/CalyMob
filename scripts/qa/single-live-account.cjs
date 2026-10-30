'use strict';

// QA-002. No password/token output, fixed project/identity, opt-in writes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const PROJECT = 'calycompta';
const CLUB = 'calypso';
const UID = 'calymob-qa-jan';
const EMAIL = 'qa.roles@calypsodc.be';
const KEYCHAIN_SERVICE = 'club.caly.calymob.qa';
const profiles = {
  mc: { code: 'MC', niveau: 'Moniteur Club', fonctions: ['Membre', 'Encadrant'] },
  encadrant: { code: '4', niveau: 'Plongeur 4*', fonctions: ['Membre', 'Encadrant'] },
  piscine: { code: '4', niveau: 'Plongeur 4*', fonctions: ['Membre', 'Encadrants et assistants'] },
  am: { code: 'AM', niveau: 'Assistant Moniteur', fonctions: ['Membre', 'Encadrants et assistants'] },
  eleve: { code: '1', niveau: 'Plongeur 1*', fonctions: ['Membre'] },
};

function parseArgs(args) {
  const options = { profile: 'mc', apply: false, visibilityReady: false, operator: null };
  for (const arg of args) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--visibility-ready') options.visibilityReady = true;
    else if (arg.startsWith('--profile=')) options.profile = arg.slice(10);
    else if (arg.startsWith('--operator=')) options.operator = arg.slice(11);
    else throw new Error('Unsupported argument.');
  }
  if (!profiles[options.profile]) throw new Error('Unsupported QA profile.');
  if (options.apply && (!options.visibilityReady || !options.operator)) {
    throw new Error('Apply requires verified visibility deployment and an authorised operator UID.');
  }
  return options;
}

function validateEnvironment(env, serviceAccount) {
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST ||
      serviceAccount.project_id !== PROJECT) {
    throw new Error('This account controller requires the exact live calycompta project.');
  }
}

function assertManaged(authUser, member) {
  if (authUser && (authUser.uid !== UID || authUser.email !== EMAIL)) {
    throw new Error('Refusing a different Auth identity.');
  }
  if (member && (member.email !== EMAIL || member.is_test_account !== true ||
      member.qa_managed_by !== 'QA-002' || member.exclude_from_directory !== true)) {
    throw new Error('Refusing to repurpose a member or store-review account.');
  }
  if (authUser && !member && authUser.displayName !== 'QA Jan — rôle variable') {
    throw new Error('Existing Auth account is not a managed QA-002 identity.');
  }
}

function keychainPassword({ create = false } = {}) {
  if (process.platform !== 'darwin') throw new Error('Use the configured macOS Keychain.');
  const result = spawnSync('/usr/bin/security', ['find-generic-password',
    '-a', EMAIL, '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8' });
  if (result.status === 0) {
    const password = result.stdout.trim();
    if (!password) throw new Error('Empty Keychain credential.');
    return password;
  }
  // Do not rotate or overwrite an existing account's lost credential implicitly.
  if (!create || result.status !== 44) throw new Error('QA credential unavailable in Keychain.');
  const password = crypto.randomBytes(32).toString('base64url');
  // security interactive stdin avoids a password in the process argument list.
  const saved = spawnSync('/usr/bin/security', ['-i'], {
    input: `add-generic-password -a "${EMAIL}" -s "${KEYCHAIN_SERVICE}" -w "${password}"\n`,
    encoding: 'utf8',
  });
  if (saved.status !== 0 || /SecKeychain|error:/i.test(saved.stderr || '')) {
    throw new Error('Could not save QA credential securely.');
  }
  const check = keychainPassword();
  if (check !== password) throw new Error('Keychain verification failed.');
  return password;
}

function roleFields(profile) {
  const item = profiles[profile];
  return { app_role: 'user', app_status: 'active', member_status: 'active',
    plongeur_code: item.code, plongeur_niveau: item.niveau,
    clubStatuten: item.fonctions, formation_active: false,
    target_formation_level: null, is_test_account: true,
    exclude_from_directory: true, qa_managed_by: 'QA-002' };
}

// Auth is disabled by the caller throughout this state machine. Do not enable
// if any directory read, repair or verification fails; enable is the last call.
async function activateHiddenAccount(auth, directoryRef) {
  if ((await directoryRef.get()).exists) {
    await directoryRef.delete();
    if ((await directoryRef.get()).exists) {
      throw new Error('QA directory exclusion failed; account remains disabled.');
    }
  }
  await auth.updateUser(UID, { disabled: false });
}

async function run(options, env = process.env) {
  if (!env.QA_SERVICE_ACCOUNT_FILE) throw new Error('Set QA_SERVICE_ACCOUNT_FILE to the existing secured credential.');
  const serviceAccount = JSON.parse(fs.readFileSync(env.QA_SERVICE_ACCOUNT_FILE, 'utf8'));
  validateEnvironment(env, serviceAccount);
  const admin = require('firebase-admin');
  const { FieldValue } = require('firebase-admin/firestore');
  const app = admin.initializeApp({ projectId: PROJECT,
    credential: admin.credential.cert(serviceAccount) });
  try {
    const db = app.firestore();
    const auth = app.auth();
    const club = db.doc(`clubs/${CLUB}`);
    const memberRef = club.collection('members').doc(UID);
    const directoryRef = club.collection('member_directory').doc(UID);
    const current = await memberRef.get();
    let authUser = null;
    try { authUser = await auth.getUser(UID); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    try {
      const byEmail = await auth.getUserByEmail(EMAIL);
      if (byEmail.uid !== UID) throw new Error('QA email already belongs to another account.');
    } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    assertManaged(authUser, current.exists ? current.data() : null);
    if (current.exists && !authUser) throw new Error('Private QA profile exists without Auth; investigate, do not replace.');
    if (!options.apply) {
      return { project: PROJECT, uid: UID, email: EMAIL,
        accountExists: !!authUser, directoryVisible: (await directoryRef.get()).exists,
        plannedProfile: options.profile, mutation: false };
    }
    const operator = await club.collection('members').doc(options.operator).get();
    if (!operator.exists || !['admin', 'superadmin'].includes(operator.data().app_role)) {
      throw new Error('Operator must be an existing club administrator.');
    }
    const password = keychainPassword({ create: !authUser });
    if (!authUser) {
      authUser = await auth.createUser({ uid: UID, email: EMAIL, password,
        displayName: 'QA Jan — rôle variable', disabled: true });
    } else {
      // Fail closed throughout a permission switch; no unrelated account touched.
      await auth.updateUser(UID, { disabled: true });
    }
    await auth.revokeRefreshTokens(UID);
    const auditRef = club.collection('audit_logs').doc();
    await db.runTransaction(async tx => {
      const before = await tx.get(memberRef);
      assertManaged(authUser, before.exists ? before.data() : null);
      const previous = before.exists ? before.data() : {};
      tx.set(memberRef, {
        ...roleFields(options.profile), email: EMAIL, first_name: 'QA',
        last_name: 'Jan — rôle variable', prenom: 'QA', nom: 'Jan — rôle variable',
        display_name: 'QA Jan — rôle variable', has_app_access: true,
        notifications_enabled: false, share_email: false, share_phone: false,
        share_birthday: false, consent_internal_photo: false,
        security: { requirePasswordChange: false },
        qa_profile: options.profile, qa_profile_revision: (previous.qa_profile_revision || 0) + 1,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      // Only this account's derived card is removed; its private identity remains.
      tx.delete(directoryRef);
      tx.create(auditRef, {
        action: before.exists ? 'qa_profile_changed' : 'qa_account_created',
        target_member_id: UID, performed_by: options.operator,
        executed_by: 'Codex', authorization_source: 'Jan explicit instruction',
        previous_profile: previous.qa_profile || null,
        next_profile: options.profile,
        before: { app_role: previous.app_role || null,
          plongeur_code: previous.plongeur_code || null,
          clubStatuten: previous.clubStatuten || [] },
        after: roleFields(options.profile),
        timestamp: FieldValue.serverTimestamp(),
      });
    });
    await auth.setCustomUserClaims(UID, { app_role: 'user', role: 'user',
      status: 'active', clubId: CLUB, qa: true });
    // A permission/profile switch requires normal password sign-in, not UI spoofing.
    await activateHiddenAccount(auth, directoryRef);
    return { project: PROJECT, uid: UID, email: EMAIL, profile: options.profile,
      auditId: auditRef.id, directoryVisible: false, credential: 'macOS Keychain' };
  } finally { await app.delete(); }
}

module.exports = { PROJECT, UID, EMAIL, KEYCHAIN_SERVICE, profiles, parseArgs,
  validateEnvironment, assertManaged, roleFields, activateHiddenAccount, keychainPassword, run };
if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('QA-002 stopped safely. No credentials logged; inspect the preconditions.'); process.exitCode = 1; });
}

#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

async function main() {
  const env = await initializeTestEnvironment({
    projectId: 'calymob-event-registration-rules',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
  const operationPath = 'clubs/calypso/operations/event-1';
  const ownRegistrationPath = `${operationPath}/inscriptions/legacy-member`;

  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'clubs/calypso/members/member-a'), {
        app_role: 'user',
      });
      await setDoc(doc(db, 'clubs/calypso/members/admin-a'), {
        app_role: 'admin',
      });
      await setDoc(doc(db, operationPath), {
        statut: 'ouvert',
        date_debut: new Date('2027-08-14T10:00:00Z'),
      });
      await setDoc(doc(db, ownRegistrationPath), {
        membre_id: 'member-a',
        registration_status: 'confirmed',
        prix: 25,
        paye: false,
        commentaire: null,
      });
    });

    const memberDb = env.authenticatedContext('member-a').firestore();
    const adminDb = env.authenticatedContext('admin-a').firestore();

    // Old clients can no longer create either a self-registration or a linked
    // guest directly, so they cannot race the callable's capacity transaction.
    await assertFails(setDoc(doc(
      memberDb,
      `${operationPath}/inscriptions/old-client-member`,
    ), {
      membre_id: 'member-a',
      registration_status: 'confirmed',
      prix: 0,
      paye: false,
    }));
    await assertFails(setDoc(doc(
      memberDb,
      `${operationPath}/inscriptions/old-client-guest`,
    ), {
      membre_id: 'guest-forged',
      is_guest: true,
      added_by: 'member-a',
      parent_inscription_id: 'legacy-member',
      registration_status: 'confirmed',
      prix: 0,
      paye: false,
    }));

    // Migration compatibility: an existing registration remains readable and
    // permits the same non-accounting owner edit as before the rollout.
    await assertSucceeds(getDoc(doc(memberDb, ownRegistrationPath)));
    await assertSucceeds(updateDoc(
      doc(memberDb, ownRegistrationPath),
      { commentaire: 'Information complémentaire' },
    ));

    // Manual administrative registration is intentionally preserved.
    await assertSucceeds(setDoc(doc(
      adminDb,
      `${operationPath}/inscriptions/manual-admin`,
    ), {
      membre_id: 'external-person',
      registration_status: 'confirmed',
      prix: 25,
      paye: false,
    }));

    // Callable idempotency receipts are never exposed to clients.
    await assertFails(getDoc(doc(
      memberDb,
      `${operationPath}/registration_requests/request_20260812_member_1`,
    )));
    await assertFails(setDoc(doc(
      memberDb,
      `${operationPath}/registration_requests/request_20260812_member_1`,
    ), { member_id: 'member-a' }));

    console.log(
      'PASS event registration rules: old direct self/guest writes denied; legacy update and admin manual create preserved; receipts private',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

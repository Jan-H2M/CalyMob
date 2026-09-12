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
    projectId: 'calymob-com084-evaluation-rules',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
  const claimPath = 'clubs/calypso/exercise_claims/evaluation_verified';

  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'clubs/calypso/members/student'), {
        app_role: 'user',
      });
      await setDoc(doc(db, 'clubs/calypso/members/monitor'), {
        app_role: 'user',
        plongeur_code: 'MC',
        clubStatuten: ['Encadrants'],
      });
      await setDoc(doc(db, claimPath), {
        member_id: 'student',
        declared_by: 'student',
        monitor_id: 'monitor',
        status: 'submitted',
        request_kind: 'student_evaluation',
        server_verified: true,
        declaration_notes: 'Première note',
      });
    });

    const studentDb = env.authenticatedContext('student').firestore();
    const monitorDb = env.authenticatedContext('monitor').firestore();

    await assertFails(setDoc(
      doc(studentDb, 'clubs/calypso/exercise_claims/forged_verified'),
      {
        member_id: 'student',
        declared_by: 'student',
        monitor_id: 'monitor',
        status: 'submitted',
        request_kind: 'student_evaluation',
        server_verified: true,
      },
    ));
    await assertSucceeds(setDoc(
      doc(studentDb, 'clubs/calypso/exercise_claims/legacy_claim'),
      {
        member_id: 'student',
        declared_by: 'student',
        status: 'submitted',
        validation_mode: 'calypso_monitor',
      },
    ));
    await assertSucceeds(getDoc(doc(studentDb, claimPath)));
    await assertSucceeds(updateDoc(doc(studentDb, claimPath), {
      declaration_notes: 'Note corrigée',
      updated_at: new Date('2026-09-12T12:00:00Z'),
    }));
    await assertFails(updateDoc(doc(studentDb, claimPath), {
      monitor_id: 'other-monitor',
    }));
    await assertFails(updateDoc(doc(monitorDb, claimPath), {
      status: 'accepted',
      decision: { decided_by: 'monitor' },
    }));

    console.log(
      'PASS evaluation rules: server marker cannot be forged; legacy claims remain compatible; verified decisions require callable',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

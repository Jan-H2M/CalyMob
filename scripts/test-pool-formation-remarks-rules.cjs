#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} = require('firebase/firestore');

async function main() {
  const env = await initializeTestEnvironment({
    projectId: 'calymob-mob033-pool-formation-rules',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
  const snapshotPath =
    'clubs/calypso/members/student/formation_snapshot/current';
  const poolSnapshotPath =
    'clubs/calypso/members/student/pool_formation_snapshot/current';
  const observationsPath = 'clubs/calypso/member_observations';
  const fullFormationPaths = [
    snapshotPath,
    'clubs/calypso/members/student/exercices_valides/exercise-1',
    'clubs/calypso/members/student/brevet_history/brevet-1',
    'clubs/calypso/members/student/formation_goals/current',
    'clubs/calypso/historical_exercise_claim_batches/batch-1',
    'clubs/calypso/formation_tasks/task-1',
    'clubs/calypso/exercise_claims/claim-1',
    'clubs/calypso/student_logbook_entries/dive-1',
    `${observationsPath}/career-seeded`,
  ];

  const validPoolRemark = {
    memberId: 'student',
    memberName: 'Élève Test',
    memberNiveau: 'P1',
    contextType: 'piscine',
    contextId: 'formation_overview',
    contextDate: serverTimestamp(),
    contextTitle: 'Suivi formation piscine',
    category: 'general',
    note: 'Bonne progression pendant la séance.',
    observerId: 'pool-instructor',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'clubs/calypso/members/student'), {
        app_role: 'user',
        clubStatuten: ['Membre'],
      });
      await setDoc(doc(db, 'clubs/calypso/members/ordinary-member'), {
        app_role: 'user',
        clubStatuten: ['Membre'],
      });
      await setDoc(doc(db, 'clubs/calypso/members/pool-instructor'), {
        app_role: 'user',
        // Exact privacy-regression variant: Encadrant badge + AM is piscine
        // scope in Flutter, but used to pass isEncadrantForClub in rules.
        clubStatuten: ['Encadrant'],
        plongeur_code: 'AM',
      });
      for (const code of ['MC', 'MF', 'MN']) {
        await setDoc(doc(db, `clubs/calypso/members/monitor-${code}`), {
          app_role: 'user',
          clubStatuten: ['Encadrant'],
          plongeur_code: code,
        });
      }
      await setDoc(doc(db, 'clubs/calypso/members/admin'), {
        app_role: 'admin',
        clubStatuten: [],
      });
      await setDoc(doc(db, snapshotPath), {
        member_id: 'student',
        target_level: '2*',
        mil_experience: {
          per_requirement: { mer: { have: 12, need: 5 } },
        },
      });
      await setDoc(doc(db, poolSnapshotPath), {
        member_id: 'student',
        piscine: {
          validated: 3,
          pending: 1,
          remaining: 2,
          total: 6,
          pct: 50,
        },
      });
      await setDoc(doc(db, `${observationsPath}/pool-seeded`), {
        memberId: 'student',
        contextType: 'piscine',
        note: 'Observation piscine visible.',
      });
      await setDoc(doc(db, `${observationsPath}/career-seeded`), {
        memberId: 'student',
        contextType: 'plongee',
        category: 'exercice_lifras',
        exerciceCode: 'P2.RA',
        result: 'acquis',
      });
      await setDoc(doc(db, fullFormationPaths[1]), {
        member_id: 'student',
        exercice_code: 'P2.RA',
        status: 'validated',
      });
      await setDoc(doc(db, fullFormationPaths[2]), {
        member_id: 'student',
        brevet_code: 'P1',
      });
      await setDoc(doc(db, fullFormationPaths[3]), {
        member_id: 'student',
        target_codes: ['P2'],
      });
      await setDoc(doc(db, fullFormationPaths[4]), {
        member_id: 'student',
        submitted_by: 'student',
        status: 'submitted',
      });
      await setDoc(doc(db, fullFormationPaths[5]), {
        member_id: 'student',
        current_assignee_id: 'pool-instructor',
        type: 'monitor_observation',
        status: 'waiting_for_other',
      });
      await setDoc(doc(db, fullFormationPaths[6]), {
        member_id: 'student',
        monitor_id: 'pool-instructor',
        declared_by: 'student',
        status: 'submitted',
        server_verified: false,
      });
      await setDoc(doc(db, fullFormationPaths[7]), {
        member_id: 'student',
        date: '2026-10-01',
        depth_max_meters: 20,
        source: 'manual',
      });
    });

    const ordinaryDb = env.authenticatedContext('ordinary-member').firestore();
    const poolDb = env.authenticatedContext('pool-instructor').firestore();
    const fullReaderDbs = ['monitor-MC', 'monitor-MF', 'monitor-MN', 'admin']
      .map(uid => ({uid, db: env.authenticatedContext(uid).firestore()}));
    const monitorDb = fullReaderDbs[0].db;
    const studentDb = env.authenticatedContext('student').firestore();

    for (const fullPath of fullFormationPaths) {
      await assertFails(getDoc(doc(poolDb, fullPath)));
      await assertFails(getDoc(doc(ordinaryDb, fullPath)));
      await assertSucceeds(getDoc(doc(studentDb, fullPath)));
      for (const reader of fullReaderDbs) {
        await assertSucceeds(getDoc(doc(reader.db, fullPath)));
      }
    }
    await assertSucceeds(getDoc(doc(poolDb, poolSnapshotPath)));
    await assertFails(getDoc(doc(ordinaryDb, poolSnapshotPath)));
    for (const reader of fullReaderDbs) {
      await assertSucceeds(getDoc(doc(reader.db, poolSnapshotPath)));
    }
    await assertSucceeds(getDoc(doc(studentDb, poolSnapshotPath)));
    await assertFails(getDocs(query(
      collectionGroup(poolDb, 'formation_snapshot'),
      where('member_id', '==', 'student'),
    )));
    await assertSucceeds(getDocs(query(
      collectionGroup(poolDb, 'pool_formation_snapshot'),
      where('member_id', '==', 'student'),
    )));
    await assertSucceeds(getDocs(query(
      collectionGroup(monitorDb, 'formation_snapshot'),
      where('member_id', '==', 'student'),
    )));

    // An AM must not regain full dossier access through being named as the
    // assignee/monitor. MC+ retains the existing task and claim workflow.
    await assertFails(updateDoc(
      doc(poolDb, fullFormationPaths[5]),
      {status: 'in_progress'},
    ));
    await assertSucceeds(updateDoc(
      doc(monitorDb, fullFormationPaths[5]),
      {status: 'in_progress'},
    ));
    await assertFails(updateDoc(
      doc(poolDb, fullFormationPaths[6]),
      {status: 'accepted'},
    ));
    await assertSucceeds(updateDoc(
      doc(monitorDb, fullFormationPaths[6]),
      {status: 'accepted'},
    ));
    await assertFails(setDoc(
      doc(poolDb, 'clubs/calypso/formation_tasks/am-manual-reminder'),
      {type: 'manual_reminder', member_id: 'student'},
    ));
    await assertSucceeds(setDoc(
      doc(monitorDb, 'clubs/calypso/formation_tasks/mc-manual-reminder'),
      {type: 'manual_reminder', member_id: 'student'},
    ));

    await assertSucceeds(getDoc(
      doc(poolDb, `${observationsPath}/pool-seeded`),
    ));
    await assertFails(getDoc(
      doc(poolDb, `${observationsPath}/career-seeded`),
    ));
    await assertSucceeds(getDoc(
      doc(monitorDb, `${observationsPath}/pool-seeded`),
    ));
    await assertSucceeds(getDoc(
      doc(monitorDb, `${observationsPath}/career-seeded`),
    ));
    await assertSucceeds(getDoc(
      doc(studentDb, `${observationsPath}/pool-seeded`),
    ));
    await assertSucceeds(getDoc(
      doc(studentDb, `${observationsPath}/career-seeded`),
    ));
    await assertSucceeds(getDocs(query(
      collection(poolDb, observationsPath),
      where('memberId', '==', 'student'),
      where('contextType', '==', 'piscine'),
    )));
    await assertFails(getDocs(query(
      collection(poolDb, observationsPath),
      where('memberId', '==', 'student'),
    )));

    await assertSucceeds(setDoc(
      doc(poolDb, `${observationsPath}/pool-free-text`),
      validPoolRemark,
    ));
    await assertSucceeds(getDoc(
      doc(studentDb, `${observationsPath}/pool-free-text`),
    ));
    await assertSucceeds(getDoc(
      doc(poolDb, `${observationsPath}/pool-free-text`),
    ));
    await assertFails(getDoc(
      doc(ordinaryDb, `${observationsPath}/pool-free-text`),
    ));
    await assertFails(setDoc(
      doc(ordinaryDb, `${observationsPath}/ordinary-forbidden`),
      {...validPoolRemark, observerId: 'ordinary-member'},
    ));
    await assertFails(setDoc(
      doc(poolDb, `${observationsPath}/pool-forged-result`),
      {...validPoolRemark, result: 'acquis'},
    ));
    await assertFails(setDoc(
      doc(poolDb, `${observationsPath}/pool-forged-exercise`),
      {...validPoolRemark, exerciceCode: '1.2.3'},
    ));
    await assertFails(setDoc(
      doc(poolDb, `${observationsPath}/pool-forged-name`),
      {...validPoolRemark, observerName: 'Andere Naam'},
    ));
    await assertFails(setDoc(
      doc(poolDb, `${observationsPath}/pool-forged-date`),
      {...validPoolRemark, createdAt: new Date('2020-01-01T00:00:00Z')},
    ));
    await assertFails(setDoc(
      doc(poolDb, `${observationsPath}/pool-wrong-context`),
      {...validPoolRemark, contextType: 'plongee'},
    ));
    await assertFails(setDoc(
      doc(poolDb, `${observationsPath}/pool-unknown-member`),
      {...validPoolRemark, memberId: 'missing-member'},
    ));

    await assertSucceeds(setDoc(
      doc(monitorDb, `${observationsPath}/lifras-validation`),
      {
        ...validPoolRemark,
        contextType: 'plongee',
        category: 'exercice_lifras',
        exerciceCode: '1.2.3',
        result: 'acquis',
        observerId: 'monitor-MC',
        observerName: 'Moniteur LIFRAS',
      },
    ));

    console.log(
      'PASS pool formation rules: pool instructors read only the pool-safe projection and piscine observations',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

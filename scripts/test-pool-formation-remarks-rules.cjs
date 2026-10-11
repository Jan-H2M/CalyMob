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
        clubStatuten: ['Encadrant Piscine'],
        plongeur_code: 'AM',
      });
      await setDoc(doc(db, 'clubs/calypso/members/lifras-monitor'), {
        app_role: 'user',
        clubStatuten: ['Encadrant'],
        plongeur_code: 'MC',
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
    });

    const ordinaryDb = env.authenticatedContext('ordinary-member').firestore();
    const poolDb = env.authenticatedContext('pool-instructor').firestore();
    const monitorDb = env.authenticatedContext('lifras-monitor').firestore();

    await assertFails(getDoc(doc(poolDb, snapshotPath)));
    await assertSucceeds(getDoc(doc(poolDb, poolSnapshotPath)));
    await assertFails(getDoc(doc(ordinaryDb, snapshotPath)));
    await assertFails(getDoc(doc(ordinaryDb, poolSnapshotPath)));
    await assertSucceeds(getDoc(doc(monitorDb, snapshotPath)));
    await assertSucceeds(getDoc(doc(monitorDb, poolSnapshotPath)));
    const studentDb = env.authenticatedContext('student').firestore();
    await assertSucceeds(getDoc(doc(studentDb, snapshotPath)));
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
        observerId: 'lifras-monitor',
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

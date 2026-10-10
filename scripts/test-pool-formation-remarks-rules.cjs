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
        memberId: 'student',
        targetLevel: 'P1',
      });
    });

    const ordinaryDb = env.authenticatedContext('ordinary-member').firestore();
    const poolDb = env.authenticatedContext('pool-instructor').firestore();
    const monitorDb = env.authenticatedContext('lifras-monitor').firestore();

    await assertSucceeds(getDoc(doc(poolDb, snapshotPath)));
    await assertFails(getDoc(doc(ordinaryDb, snapshotPath)));
    await assertSucceeds(getDocs(query(
      collectionGroup(poolDb, 'formation_snapshot'),
      where('targetLevel', '==', 'P1'),
    )));

    await assertSucceeds(setDoc(
      doc(poolDb, `${observationsPath}/pool-free-text`),
      validPoolRemark,
    ));
    const studentDb = env.authenticatedContext('student').firestore();
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
      'PASS pool formation rules: pool instructors can read progress and add free-text pool remarks without LIFRAS validation rights',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

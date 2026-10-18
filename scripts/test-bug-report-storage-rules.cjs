#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { deleteDoc, doc, setDoc, updateDoc } = require('firebase/firestore');
const { deleteObject, ref, uploadBytes } = require('firebase/storage');

const projectId = 'calymob-bug-report-storage-rules';
const clubId = 'calypso';
const reportId = 'AbCdEfGhIjKlMnOpQrSt';

function pngUrl(id, index) {
  return `https://firebasestorage.googleapis.com/v0/b/calycompta.firebasestorage.app/o/clubs%2F${clubId}%2Fbug_reports%2F${id}%2Fscreenshot_${index}.png?alt=media&token=synthetic`;
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
    storage: {
      rules: fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8'),
    },
  });

  try {
    await env.clearFirestore();
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, `clubs/${clubId}/members/member-a`), {
        app_role: 'user',
      });
      await setDoc(doc(db, `clubs/${clubId}/members/member-b`), {
        app_role: 'user',
      });
    });

    const memberA = env.authenticatedContext('member-a');
    const memberB = env.authenticatedContext('member-b');
    const dbA = memberA.firestore();
    const reportRef = doc(dbA, `clubs/${clubId}/bug_reports/${reportId}`);
    const emptyReport = {
      app: 'CalyMob',
      title: 'Synthetic report',
      status: 'nouveau',
      reporter: {uid: 'member-a'},
      screenshots: [],
      screenshotUrl: null,
    };
    await assertSucceeds(setDoc(reportRef, emptyReport));

    const objectPath =
      `clubs/${clubId}/bug_reports/${reportId}/screenshot_0.png`;
    const ownObject = ref(memberA.storage(), objectPath);
    const foreignObject = ref(memberB.storage(), objectPath);
    const png = Uint8Array.from([137, 80, 78, 71]);

    await assertFails(uploadBytes(foreignObject, png, {contentType: 'image/png'}));
    await assertSucceeds(uploadBytes(ownObject, png, {contentType: 'image/png'}));
    await assertFails(deleteObject(foreignObject));
    await assertSucceeds(deleteObject(ownObject));
    await assertSucceeds(deleteDoc(reportRef));

    await assertSucceeds(setDoc(reportRef, emptyReport));
    await assertSucceeds(uploadBytes(ownObject, png, {contentType: 'image/png'}));
    const url = pngUrl(reportId, 0);
    await assertSucceeds(updateDoc(reportRef, {
      screenshots: [{
        url,
        page: '/sorties',
        capturedAt: new Date('2026-10-16T12:00:00.000Z'),
        storagePath: objectPath,
        storageIndex: 0,
      }],
      screenshotUrl: url,
    }));
    await assertFails(deleteObject(ownObject));
    await assertFails(deleteDoc(reportRef));

    // A resolved-report feedback image is deliberately in a separate prefix:
    // the reporter may upload it, another member cannot, and an arbitrary
    // nested filename remains denied.
    const feedbackPath = `clubs/${clubId}/bug_reports/${reportId}/resolution_feedback/resolution_${reportId}/screenshot_0.png`;
    await assertSucceeds(uploadBytes(ref(memberA.storage(), feedbackPath), png, {contentType: 'image/png'}));
    await assertFails(uploadBytes(ref(memberB.storage(), feedbackPath), png, {contentType: 'image/png'}));
    await assertFails(uploadBytes(ref(memberA.storage(), feedbackPath.replace('screenshot_0.png', 'other.png')), png, {contentType: 'image/png'}));

    console.log('Bug-report attachment ownership rules passed.');
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

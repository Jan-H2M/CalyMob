/* eslint-disable no-console */
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || 'demo-calypso';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const functionsHost = '127.0.0.1:5001';

async function main() {
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const signup = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `birthday-${Date.now()}@example.test`,
        password: 'not-a-production-secret',
        returnSecureToken: true,
      }),
    },
  );
  const signupBody = await signup.json();
  assert.equal(signup.ok, true, JSON.stringify(signupBody));
  const identity = signupBody;
  const uid = identity.localId;

  const memberRef = db.doc(`clubs/calypso/members/${uid}`);
  const directoryRef = db.doc(`clubs/calypso/member_directory/${uid}`);
  await memberRef.set({
    first_name: 'Alice',
    last_name: 'Example',
    birth_date: admin.firestore.Timestamp.fromDate(
      new Date('1991-07-06T22:00:00.000Z'),
    ),
    share_birthday: true,
  });
  await directoryRef.set({
    share_birthday: true,
    birth_month: 7,
    birth_day: 7,
  });

  const callable = await fetch(
    `http://${functionsHost}/${projectId}/europe-west1/updateBirthdaySharing`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${identity.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          clubId: 'calypso',
          memberId: uid,
          shareBirthday: false,
        },
      }),
    },
  );
  const callableBody = await callable.json();
  assert.equal(callable.ok, true, JSON.stringify(callableBody));

  const member = (await memberRef.get()).data();
  const directory = (await directoryRef.get()).data();
  assert.equal(member.share_birthday, false);
  assert.equal(directory.share_birthday, false);
  assert.equal(directory.birth_month, null);
  assert.equal(directory.birth_day, null);

  // Once rules are deployed, supported clients cannot bypass the callable.
  const directWrite = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/clubs/calypso/members/${uid}?updateMask.fieldPaths=share_birthday`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${identity.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fields: { share_birthday: { booleanValue: true } },
      }),
    },
  );
  assert.equal(directWrite.ok, false, 'direct birthday update unexpectedly passed rules');
  assert.equal((await memberRef.get()).data().share_birthday, false);

  console.log('Birthday privacy emulator flow passed.');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

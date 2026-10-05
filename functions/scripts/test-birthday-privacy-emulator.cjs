/* eslint-disable no-console */
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || 'demo-calypso';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const functionsHost = '127.0.0.1:5001';

async function signUp(label) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `birthday-${label}-${Date.now()}@example.test`,
        password: 'not-a-production-secret',
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function patchMember(idToken, uid, fields) {
  const updateMask = Object.keys(fields)
    .map(field => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  return fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/clubs/calypso/members/${uid}?${updateMask}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [field, { booleanValue: value }]),
        ),
      }),
    },
  );
}

async function main() {
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const identity = await signUp('member');
  const otherIdentity = await signUp('other');
  const adminIdentity = await signUp('admin');
  const uid = identity.localId;

  const memberRef = db.doc(`clubs/calypso/members/${uid}`);
  const otherMemberRef = db.doc(`clubs/calypso/members/${otherIdentity.localId}`);
  const adminMemberRef = db.doc(`clubs/calypso/members/${adminIdentity.localId}`);
  const directoryRef = db.doc(`clubs/calypso/member_directory/${uid}`);
  await memberRef.set({
    first_name: 'Alice',
    last_name: 'Example',
    birth_date: admin.firestore.Timestamp.fromDate(
      new Date('1991-07-06T22:00:00.000Z'),
    ),
    share_birthday: true,
    share_phone: true,
  });
  await otherMemberRef.set({
    first_name: 'Bob',
    last_name: 'Example',
    share_birthday: true,
    share_phone: true,
  });
  await adminMemberRef.set({
    first_name: 'Admin',
    last_name: 'Example',
    app_role: 'admin',
    share_birthday: true,
    share_phone: true,
  });
  await db.doc(`clubs/calypso/sessions/${adminIdentity.localId}`).set({
    isActive: true,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date('2030-01-01T00:00:00Z')),
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

  // Supported clients cannot bypass the callable, including by combining the
  // protected field with an otherwise legitimate profile update.
  const directSelfBirthday = await patchMember(identity.idToken, uid, {
    share_birthday: true,
  });
  assert.equal(directSelfBirthday.ok, false, 'member birthday update unexpectedly passed rules');
  const directOtherProfile = await patchMember(
    identity.idToken,
    otherIdentity.localId,
    { share_phone: false },
  );
  assert.equal(directOtherProfile.ok, false, 'cross-member profile update unexpectedly passed rules');
  const memberSmuggling = await patchMember(identity.idToken, uid, {
    share_birthday: true,
    share_phone: false,
  });
  assert.equal(memberSmuggling.ok, false, 'member birthday smuggling unexpectedly passed rules');
  const legitimateMemberUpdate = await patchMember(identity.idToken, uid, {
    share_phone: false,
  });
  assert.equal(legitimateMemberUpdate.ok, true, await legitimateMemberUpdate.text());

  // The broad admin update path must not re-open the same privacy bypass for
  // either the admin's own profile or another member.
  const adminSelfBirthday = await patchMember(
    adminIdentity.idToken,
    adminIdentity.localId,
    { share_birthday: false },
  );
  assert.equal(adminSelfBirthday.ok, false, 'admin self birthday update unexpectedly passed rules');
  const adminOtherBirthday = await patchMember(
    adminIdentity.idToken,
    otherIdentity.localId,
    { share_birthday: false },
  );
  assert.equal(adminOtherBirthday.ok, false, 'admin other birthday update unexpectedly passed rules');
  const adminSmuggling = await patchMember(
    adminIdentity.idToken,
    otherIdentity.localId,
    { share_birthday: false, share_phone: false },
  );
  assert.equal(adminSmuggling.ok, false, 'admin birthday smuggling unexpectedly passed rules');
  const legitimateAdminUpdate = await patchMember(
    adminIdentity.idToken,
    otherIdentity.localId,
    { share_phone: false },
  );
  assert.equal(legitimateAdminUpdate.ok, true, await legitimateAdminUpdate.text());

  assert.equal((await memberRef.get()).data().share_birthday, false);

  console.log('Birthday privacy emulator flow passed.');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

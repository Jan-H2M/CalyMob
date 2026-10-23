#!/usr/bin/env node
'use strict';
// Local emulator-only contract test. Never contacts production.
const fs = require('node:fs');
const path = require('node:path');
const {initializeTestEnvironment, assertSucceeds, assertFails} = require('@firebase/rules-unit-testing');
const {doc, setDoc, updateDoc, getDoc, deleteDoc} = require('firebase/firestore');
const {ref, uploadBytes, getBytes, deleteObject} = require('firebase/storage');

const club = 'calypso'; const owner = 'owner'; const other = 'other'; const importId = 'owner_hash';
async function main() {
  const env = await initializeTestEnvironment({projectId: 'calymob-dive-computer-rules', firestore: {rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8')}, storage: {rules: fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8')}});
  try {
    await env.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore(), `clubs/${club}/members/${owner}`), {app_role: 'user'});
      await setDoc(doc(c.firestore(), `clubs/${club}/members/${other}`), {app_role: 'user'});
    });
    const a = env.authenticatedContext(owner); const b = env.authenticatedContext(other);
    const pathBase = `clubs/${club}/dive_computer_imports/${owner}/${importId}`;
    const payload = {owner_id: owner, source_hash: 'hash', vendor: 'suunto', status: 'pending'};
    const ownId = `${owner}_${payload.source_hash}`;
    await assertSucceeds(setDoc(doc(a.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`), payload));
    await assertFails(setDoc(doc(b.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`), {...payload, owner_id: other}));
    await assertFails(setDoc(doc(a.firestore(), `clubs/${club}/dive_computer_imports/not-owner_hash`), payload));
    await assertSucceeds(updateDoc(doc(a.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`), {status: 'complete', entry_id: 'entry'}));
    await assertFails(updateDoc(doc(a.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`), {source_hash: 'changed'}));
    await assertSucceeds(getDoc(doc(a.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`)));
    await assertFails(getDoc(doc(b.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`)));
    await assertSucceeds(uploadBytes(ref(a.storage(), `${pathBase}/source.json`), Uint8Array.from([123,125]), {contentType: 'application/json'}));
    // Both route-off source and route-opt-in profile stay in the same private prefix.
    await assertSucceeds(uploadBytes(ref(a.storage(), `${pathBase}/profile-v1.json`), Uint8Array.from([123,125]), {contentType: 'application/json'}));
    await assertFails(uploadBytes(ref(b.storage(), `${pathBase}/source.json`), Uint8Array.from([123,125]), {contentType: 'application/json'}));
    await assertSucceeds(getBytes(ref(a.storage(), `${pathBase}/source.json`)));
    await assertFails(getBytes(ref(b.storage(), `${pathBase}/source.json`)));
    await assertFails(deleteObject(ref(b.storage(), `${pathBase}/source.json`)));
    await assertSucceeds(deleteObject(ref(a.storage(), `${pathBase}/profile-v1.json`)));
    await assertFails(deleteDoc(doc(b.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`)));
    await assertSucceeds(deleteDoc(doc(a.firestore(), `clubs/${club}/dive_computer_imports/${ownId}`)));
    console.log('Dive computer import rules passed.');
  } finally { await env.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const clubId = 'calypso';
const flagsPath = `clubs/${clubId}/settings/feature_flags`;
const productPath = `clubs/${clubId}/products/product-1`;

function memberPath(memberId) {
  return `clubs/${clubId}/members/${memberId}`;
}

function orderPath(memberId) {
  return `clubs/${clubId}/orders/order-${memberId}`;
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: 'calymob-boutique-access-rules',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });

  const members = {
    'rb-active': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: ['Responsable boutique'],
    },
    'ordinary-active': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: [],
    },
    'legacy-feature': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: [],
      feature_access: { boutique: true },
    },
    'inactive-rb': {
      app_role: 'user',
      member_status: 'inactive',
      clubStatuten: ['RB'],
    },
    'uppercase-status-rb': {
      app_role: 'user',
      member_status: 'ACTIVE',
      clubStatuten: ['rB'],
    },
    'admin-backoffice': {
      app_role: 'admin',
      member_status: 'inactive',
      clubStatuten: [],
    },
  };

  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, flagsPath), {
        boutiqueEnabled: true,
        boutiqueMobileEnabled: true,
        boutiqueAccess: 'testeurs',
      });
      await setDoc(doc(db, productPath), {
        name: 'Produit publié',
        visibility: 'published',
      });
      for (const [memberId, data] of Object.entries(members)) {
        await setDoc(doc(db, memberPath(memberId)), data);
        await setDoc(doc(db, orderPath(memberId)), {
          buyer: { userId: memberId },
          status: 'awaiting_payment',
        });
      }
    });

    const memberDb = (memberId) => env.authenticatedContext(memberId).firestore();
    const readProduct = (memberId) => getDoc(doc(memberDb(memberId), productPath));
    const readOwnOrder = (memberId) => getDoc(doc(memberDb(memberId), orderPath(memberId)));
    const writeFlags = (data) => env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), flagsPath), data);
    });

    // Preparation: only an active Responsable boutique uses the member flow.
    await assertSucceeds(readProduct('rb-active'));
    await assertSucceeds(readOwnOrder('rb-active'));
    await assertFails(readProduct('ordinary-active'));
    await assertFails(readOwnOrder('ordinary-active'));
    await assertFails(readProduct('legacy-feature'));
    await assertFails(readOwnOrder('legacy-feature'));
    await assertFails(readProduct('inactive-rb'));
    await assertFails(readOwnOrder('inactive-rb'));
    await assertFails(readProduct('uppercase-status-rb'));
    await assertFails(readOwnOrder('uppercase-status-rb'));

    // The explicit admin branches remain available for CalyCompta backoffice;
    // mobile UI and callables do not grant admin-only access.
    await assertSucceeds(readProduct('admin-backoffice'));
    await assertSucceeds(readOwnOrder('admin-backoffice'));

    // Online: every active member can use products and their own orders.
    await writeFlags({
      boutiqueEnabled: true,
      boutiqueMobileEnabled: true,
      boutiqueAccess: 'tous',
    });
    await assertSucceeds(readProduct('ordinary-active'));
    await assertSucceeds(readOwnOrder('ordinary-active'));
    await assertSucceeds(readProduct('legacy-feature'));
    await assertFails(readProduct('inactive-rb'));
    await assertFails(readOwnOrder('inactive-rb'));
    await assertFails(readProduct('uppercase-status-rb'));
    await assertFails(readOwnOrder('uppercase-status-rb'));

    // Existing hidden data and disabled flags remain fail-closed for members.
    await writeFlags({
      boutiqueEnabled: true,
      boutiqueMobileEnabled: true,
      boutiqueAccess: 'masque',
    });
    await assertFails(readProduct('rb-active'));
    await assertFails(readOwnOrder('rb-active'));

    await writeFlags({
      boutiqueEnabled: false,
      boutiqueMobileEnabled: false,
      boutiqueAccess: 'tous',
    });
    await assertFails(readProduct('ordinary-active'));
    await assertFails(readOwnOrder('ordinary-active'));

    // Invalid values are backward-compatible preparation, not public access.
    await writeFlags({
      boutiqueEnabled: true,
      boutiqueMobileEnabled: true,
      boutiqueAccess: 'invalid',
    });
    await assertSucceeds(readProduct('rb-active'));
    await assertFails(readProduct('ordinary-active'));

    console.log(
      'PASS Boutique rules: preparation/online, active status, legacy flag removal, owner orders and admin backoffice verified',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} = require('firebase/firestore');

const clubId = 'calypso';
const flagsPath = `clubs/${clubId}/settings/feature_flags`;
const productPath = `clubs/${clubId}/products/product-1`;
const materialLoanPath = `clubs/${clubId}/inventory_loans/role-check`;

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
    'gonflage-code-upper': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: ['G'],
    },
    'gonflage-code-lower': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: ['g'],
    },
    'gonflage-mixed-case': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: ['gOnFlAgE'],
    },
    'gonflage-spaced-mixed': {
      app_role: 'user',
      member_status: 'active',
      clubStatuten: [' GoNfLaGe '],
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
      await setDoc(doc(db, materialLoanPath), {
        memberId: 'ordinary-active',
        status: 'active',
      });
      await setDoc(
        doc(db, `clubs/${clubId}/settings/unread_cursor_v1_migration`),
        { state: 'server-owned' },
      );
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

    // Gonflage authorization uses the same case-insensitive label/code
    // semantics as Flutter and Functions.
    for (const memberId of [
      'gonflage-code-upper',
      'gonflage-code-lower',
      'gonflage-mixed-case',
      'gonflage-spaced-mixed',
    ]) {
      await assertSucceeds(
        updateDoc(doc(memberDb(memberId), materialLoanPath), {
          lastRoleCheck: memberId,
        }),
      );
    }
    await assertFails(
      updateDoc(doc(memberDb('ordinary-active'), materialLoanPath), {
        lastRoleCheck: 'ordinary-active',
      }),
    );

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

    const adminDb = memberDb('admin-backoffice');
    const ordinaryDb = memberDb('ordinary-active');

    // Protected Boutique fields may only be written by the transactional
    // callable. Direct updates fail for ordinary and admin clients, including
    // a nested section update; unrelated admin flags remain editable.
    const protectedUpdates = [
      { boutiqueEnabled: false },
      { boutiqueMobileEnabled: false },
      { boutiqueAdminOnly: true },
      { boutiqueAccess: 'tous' },
      { boutiqueSections: { produits: 'tous' } },
      { 'boutiqueSections.produits': 'tous' },
    ];
    for (const update of protectedUpdates) {
      await assertFails(updateDoc(doc(ordinaryDb, flagsPath), update));
      await assertFails(updateDoc(doc(adminDb, flagsPath), update));
    }
    await assertFails(deleteDoc(doc(ordinaryDb, flagsPath)));
    await assertFails(deleteDoc(doc(adminDb, flagsPath)));
    await assertSucceeds(
      updateDoc(doc(adminDb, flagsPath), { carnetFormationEnabled: false }),
    );

    // A missing feature_flags document still cannot be client-created with
    // any protected field, for either role. Restore/delete here is Admin SDK
    // test setup and bypasses the client rules under test.
    await env.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), flagsPath));
    });
    const protectedCreates = [
      { boutiqueEnabled: true },
      { boutiqueMobileEnabled: true },
      { boutiqueAdminOnly: true },
      { boutiqueAccess: 'tous' },
      { boutiqueSections: { produits: 'tous' } },
    ];
    for (const protectedData of protectedCreates) {
      const payload = {
        carnetFormationEnabled: true,
        ...protectedData,
      };
      await assertFails(setDoc(doc(ordinaryDb, flagsPath), payload));
      await assertFails(setDoc(doc(adminDb, flagsPath), payload));
    }
    await assertSucceeds(
      setDoc(doc(adminDb, flagsPath), { carnetFormationEnabled: true }),
    );

    // The migration marker keeps its member read policy but is server-owned.
    const markerPath = `clubs/${clubId}/settings/unread_cursor_v1_migration`;
    await assertSucceeds(getDoc(doc(ordinaryDb, markerPath)));
    await assertSucceeds(getDoc(doc(adminDb, markerPath)));
    await assertFails(setDoc(doc(ordinaryDb, markerPath), { state: 'forged' }));
    await assertFails(setDoc(doc(adminDb, markerPath), { state: 'forged' }));
    await assertFails(deleteDoc(doc(ordinaryDb, markerPath)));
    await assertFails(deleteDoc(doc(adminDb, markerPath)));
    await env.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), markerPath));
    });
    await assertFails(setDoc(doc(ordinaryDb, markerPath), { state: 'forged' }));
    await assertFails(setDoc(doc(adminDb, markerPath), { state: 'forged' }));

    // Reserved Boutique access audits are callable-only; ordinary audit
    // entries remain available and every server-created audit is immutable.
    const auditPath = `clubs/${clubId}/audit_logs/access-change-1`;
    const forgedAudit = {
      action: 'boutique.access.preparation_enabled',
      userId: 'admin-backoffice',
      timestamp: new Date(),
    };
    await assertFails(setDoc(doc(ordinaryDb, `${auditPath}-ordinary`), {
      ...forgedAudit,
      action: 'boutique.access.opened_all',
      userId: 'ordinary-active',
    }));
    await assertFails(setDoc(doc(adminDb, auditPath), forgedAudit));
    await assertSucceeds(
      setDoc(doc(ordinaryDb, `clubs/${clubId}/audit_logs/ordinary-entry`), {
        action: 'member_updated',
        userId: 'ordinary-active',
        timestamp: new Date(),
      }),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), auditPath), forgedAudit);
    });
    await assertFails(updateDoc(doc(adminDb, auditPath), { action: 'changed' }));
    await assertFails(deleteDoc(doc(adminDb, auditPath)));

    console.log(
      'PASS Boutique rules: preparation/online, callable-only access fields, unread marker, reserved audit, owner orders and admin backoffice verified',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

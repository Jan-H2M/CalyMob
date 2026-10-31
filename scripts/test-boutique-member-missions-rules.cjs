const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
(async () => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Loopback emulator required');
  const env = await initializeTestEnvironment({ projectId: 'demo-btq-missions', firestore: { rules: fs.readFileSync(process.env.BOUTIQUE_MISSIONS_RULES || 'firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const uid of ['geoffroy', 'other', 'admin']) await setDoc(doc(db, `clubs/rules-test/members/${uid}`), { member_status: 'active', app_role: uid === 'admin' ? 'admin' : 'user' });
      await setDoc(doc(db, 'clubs/rules-test/fournisseurs/supplier'), { actif: true, supplierType: 'club_member', memberId: 'geoffroy' });
      await setDoc(doc(db, 'clubs/rules-test/supplier_order_batches/batch'), { supplierId: 'supplier', status: 'sent', items: [{ lineId: 'line', qty: 1 }] });
    });
    for (const uid of ['geoffroy', 'other']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'clubs/rules-test/supplier_order_batches/batch')));
      await assertFails(updateDoc(doc(db, 'clubs/rules-test/supplier_order_batches/batch'), { status: 'received' }));
      await assertFails(setDoc(doc(db, 'clubs/rules-test/boutique_physical_stock_units/fake'), { supplierBatchId: 'batch' }));
      await assertFails(updateDoc(doc(db, 'clubs/rules-test/fournisseurs/supplier'), { memberId: uid }));
      await assertSucceeds(setDoc(doc(db, `clubs/rules-test/expense_claims/${uid}`), { requester_id: uid, status: 'submitted', description: 'Ticket DEV', amount: 1 }));
    }
    for (const uid of ['geoffroy', 'other']) {
      const db = env.authenticatedContext(uid).firestore();
      const linked = { requester_id: uid, status: 'submitted', description: 'Ticket DEV', amount: 1, boutique_supplier_batch_id: 'batch' };
      await (uid === 'geoffroy' ? assertSucceeds : assertFails)(setDoc(doc(db, `clubs/rules-test/expense_claims/linked-${uid}`), linked));
      await assertFails(updateDoc(doc(db, `clubs/rules-test/expense_claims/${uid}`), { boutique_supplier_batch_id: 'missing' }));
    }
    for (const uid of ['geoffroy', 'other']) {
      const db = env.authenticatedContext(uid).firestore();
      const own = { demandeur_id: uid, requester_id: 'geoffroy', statut: 'soumis', description: 'Ticket DEV', montant: 1 };
      await assertSucceeds(setDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), own));
      await (uid === 'geoffroy' ? assertSucceeds : assertFails)(setDoc(doc(db, `clubs/rules-test/demandes_remboursement/linked-${uid}`), { ...own, boutique_supplier_batch_id: 'batch' }));
      await assertFails(updateDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), { boutique_supplier_batch_id: 'missing' }));
      if (uid === 'other') await assertFails(updateDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), { boutique_supplier_batch_id: 'batch' }));
    }
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'clubs/rules-test/supplier_order_batches/draft'), { supplierId: 'supplier', status: 'draft', items: [{ qty: 1 }], supplierOrderEmail: { status: 'sent' } });
      await setDoc(doc(db, 'clubs/rules-test/boutique_supplier_draft_claims/supplier'), { supplierId: 'supplier', batchId: 'draft' });
    });
    const admin = env.authenticatedContext('admin').firestore();
    await assertFails(updateDoc(doc(admin, 'clubs/rules-test/supplier_order_batches/draft'), { items: [{ qty: 2 }] }));
    await assertSucceeds(updateDoc(doc(admin, 'clubs/rules-test/supplier_order_batches/draft'), { status: 'sent' }));
    await assertSucceeds(getDoc(doc(admin, 'clubs/rules-test/supplier_order_batches/batch')));
    await assertFails(updateDoc(doc(admin, 'clubs/rules-test/supplier_order_batches/batch'), { status: 'received', lastReceiptKey: 'fake-admin-receipt-12345' }));
    console.log('PASS member missions rules: no direct assignment/stock writes; no self-linking; admin mirror read-only; normal expenses remain optional.');
  } finally { await env.cleanup(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

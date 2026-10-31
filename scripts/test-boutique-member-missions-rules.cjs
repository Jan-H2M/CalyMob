const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
(async () => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Loopback emulator required');
  const env = await initializeTestEnvironment({ projectId: 'demo-btq-missions', firestore: { rules: fs.readFileSync(process.env.BOUTIQUE_MISSIONS_RULES || 'firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const uid of ['geoffroy', 'other', 'admin']) await setDoc(doc(db, `clubs/rules-test/members/${uid}`), { member_status: 'active', app_role: uid === 'admin' ? 'admin' : uid === 'geoffroy' ? 'membre' : 'user', has_app_access: uid === 'admin', app_status: 'active' });
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
      if (uid === 'other') await assertFails(updateDoc(doc(db, `clubs/rules-test/expense_claims/${uid}`), { requester_id: 'geoffroy', boutique_supplier_batch_id: 'batch' }));
    }
    for (const uid of ['geoffroy', 'other']) {
      const db = env.authenticatedContext(uid).firestore();
      const own = { demandeur_id: uid, requester_id: 'geoffroy', statut: 'soumis', description: 'Ticket DEV', montant: 1 };
      await assertSucceeds(setDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), own));
      await (uid === 'geoffroy' ? assertSucceeds : assertFails)(setDoc(doc(db, `clubs/rules-test/demandes_remboursement/linked-${uid}`), { ...own, boutique_supplier_batch_id: 'batch' }));
      await assertFails(updateDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), { boutique_supplier_batch_id: 'missing' }));
      if (uid === 'other') {
        await assertFails(updateDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), { boutique_supplier_batch_id: 'batch' }));
        await assertFails(updateDoc(doc(db, `clubs/rules-test/demandes_remboursement/${uid}`), { demandeur_id: 'geoffroy', boutique_supplier_batch_id: 'batch' }));
      }
    }
    // Actual mobile-only role can read its own notes and finish receipt uploads,
    // but cannot edit someone else's note or gain approval/payment authority.
    const mobileOnly = env.authenticatedContext('geoffroy').firestore();
    for (const [name, ownerField, statusField, pending, approved, receiptField, approval] of [
      ['expense_claims', 'requester_id', 'status', 'submitted', 'approved', 'supporting_document_urls', { approved_by: 'geoffroy', approved_by_name: 'Geoffroy', approved_at: serverTimestamp() }],
      ['demandes_remboursement', 'demandeur_id', 'statut', 'soumis', 'approuve', 'urls_justificatifs', { approuve_par: 'geoffroy', approuve_par_nom: 'Geoffroy', date_approbation: serverTimestamp() }],
    ]) {
      const own = doc(mobileOnly, `clubs/rules-test/${name}/geoffroy`);
      const foreign = doc(mobileOnly, `clubs/rules-test/${name}/other`);
      await assertSucceeds(getDoc(own));
      await assertSucceeds(getDocs(query(collection(mobileOnly, `clubs/rules-test/${name}`), where(ownerField, '==', 'geoffroy'))));
      await assertFails(getDocs(collection(mobileOnly, `clubs/rules-test/${name}`)));
      await assertFails(getDoc(foreign));
      await assertSucceeds(updateDoc(own, { [receiptField]: ['https://example.test/ticket'], updated_at: serverTimestamp() }));
      await assertSucceeds(updateDoc(own, { description: 'Ticket DEV corrigé' }));
      await assertFails(updateDoc(foreign, { description: 'Forbidden' }));
      await assertFails(updateDoc(own, { [ownerField]: 'other' }));
      await assertFails(updateDoc(own, { [statusField]: approved, ...approval }));
      await assertFails(updateDoc(own, { paid_amount: 1, paid_transaction_id: 'forged' }));
      await assertFails(updateDoc(own, { ...approval }));
      await env.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), `clubs/rules-test/${name}/geoffroy`), { [statusField]: approved });
      });
      await assertFails(updateDoc(own, { [receiptField]: ['https://example.test/changed'] }));
      await env.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), `clubs/rules-test/${name}/geoffroy`), { [statusField]: pending });
      });
    }
    // Revocation denies new/changed Boutique associations in both expense schemas.
    // Ordinary expenses and removing an optional link remain available.
    const revoked = env.authenticatedContext('geoffroy').firestore();
    for (const [index, patch] of [
      { member_status: 'inactive' }, { app_status: 'suspended' },
      { isActive: false }, { actif: false }, { app_status: '' }, { app_status: false },
    ].entries()) {
      await env.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'clubs/rules-test/members/geoffroy'), patch);
      });
      for (const [collection, data] of [
        ['expense_claims', { requester_id: 'geoffroy', status: 'submitted', amount: 1 }],
        ['demandes_remboursement', { demandeur_id: 'geoffroy', statut: 'soumis', montant: 1 }],
      ]) {
        const plain = doc(revoked, `clubs/rules-test/${collection}/revoked-${index}`);
        await assertSucceeds(setDoc(plain, { ...data, description: 'Ticket DEV' }));
        await assertFails(updateDoc(plain, { boutique_supplier_batch_id: 'batch' }));
        await assertFails(setDoc(doc(revoked, `clubs/rules-test/${collection}/revoked-linked-${index}`), { ...data, boutique_supplier_batch_id: 'batch' }));
        await assertSucceeds(updateDoc(doc(revoked, `clubs/rules-test/${collection}/linked-geoffroy`), { boutique_supplier_batch_id: null }));
      }
      await env.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'clubs/rules-test/members/geoffroy'), { member_status: 'active', app_status: 'active', isActive: true, actif: true });
      });
      for (const collection of ['expense_claims', 'demandes_remboursement']) {
        await assertSucceeds(updateDoc(doc(revoked, `clubs/rules-test/${collection}/linked-geoffroy`), { boutique_supplier_batch_id: 'batch' }));
      }
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

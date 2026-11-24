#!/usr/bin/env node
/**
 * Unit-checks voor de dormant sync-engine (Stap 3).
 * Run: node src/expenses/__tests__/expenseSync.check.cjs
 */
const assert = require('assert');
const s = require('../expenseSync.js');
const { DEFAULT_FLAGS, notificationsOwner } = require('../migrationFlags.js');

// 1. change-detection negeert sleutel-volgorde in geneste objecten
{
  const expected = { status_history: [{ a: 1, b: 2 }], amount: 47 };
  const current = { status_history: [{ b: 2, a: 1 }], amount: 47 }; // andere key-volgorde
  assert.deepStrictEqual(s.changedFields(expected, current), [], 'key-volgorde mag geen drift geven');
}
// en detecteert wél een echte waardewijziging
{
  const changed = s.changedFields({ amount: 47 }, { amount: 48 });
  assert.deepStrictEqual(changed, ['amount']);
}

// 2. forward/reverse round-trip behoudt kernvelden
{
  const legacy = {
    montant: 47, statut: 'a_verifier_paiement', date_depense: '2026-06-26',
    demandeur_nom: 'Yves', demandeur_id: 'u1', description: 'floreffe',
    payment_reference: 'REM-1', payment_reference_key: '+++REM-1+++', fiscal_year_id: 'FY2026',
  };
  const canon = s.buildCanonicalFromLegacy(legacy, 'doc1');
  assert.strictEqual(canon.status, 'payment_verification_pending');
  assert.strictEqual(canon.amount, 47);
  assert.strictEqual(canon.payment_reference, 'REM-1');
  const back = s.buildLegacyFromCanonical(canon, 'doc1');
  assert.strictEqual(back.statut, 'a_verifier_paiement');
  assert.strictEqual(back.montant, 47);
  assert.strictEqual(back.demandeur_nom, 'Yves');
  assert.strictEqual(back.date_depense, '2026-06-26');
  assert.strictEqual(back.payment_reference, 'REM-1');
}

// 2b. withdrawal-refund provenance overleeft een web-edit (canonical zonder source)
{
  const legacy = { montant: 6, statut: 'brouillon', source: 'event_withdrawal',
    withdrawal_operation_id: 'op1', send_confirmation_email: false,
    withdrawal_refund_allocations: [{ inscription_id: 'i1', amount_cents: 600 }] };
  const canon = s.buildCanonicalFromLegacy(legacy, 'withdrawal_x');
  assert.strictEqual(canon.source, 'event_withdrawal');
  assert.strictEqual(canon.withdrawal_operation_id, 'op1');
  assert.deepStrictEqual(canon.withdrawal_refund_allocations, legacy.withdrawal_refund_allocations);
  // Web-projectie zonder source/withdrawal-velden mag ze niet op null zetten in legacy.
  const webCanon = { amount: 6, status: 'draft', title: 'note', source: null };
  const back = s.buildLegacyFromCanonical(webCanon, 'withdrawal_x');
  for (const key of ['source', 'withdrawal_operation_id', 'withdrawal_refund_allocations', 'send_confirmation_email']) {
    assert.ok(!(key in back), `${key} moet ontbreken zodat merge de legacy-waarde behoudt`);
  }
  // Maar een aanwezige canonical source wordt wel teruggespiegeld.
  assert.strictEqual(s.buildLegacyFromCanonical(canon, 'withdrawal_x').source, 'event_withdrawal');
  // Gewone claims krijgen geen lege withdrawal-velden.
  assert.ok(!('withdrawal_operation_id' in s.buildCanonicalFromLegacy({ montant: 1 }, 'd')));
}

// 3. _sync-tagging + e-mail-guard + loop-guard
{
  const tagged = s.tagSync({ amount: 1 }, { origin: 'legacy-mirror', version: 10, sourceId: 'x' });
  assert.strictEqual(tagged._sync.origin, 'legacy-mirror');
  assert.ok(s.isSyncMirrorWrite(tagged), 'mirror-write moet herkend worden (geen e-mail)');
  assert.ok(!s.isSyncMirrorWrite({ _sync: { origin: 'app' } }), 'app-write is geen mirror-write');

  // loop: inkomende mirror-write, doel weerspiegelt versie al → skip
  assert.ok(s.shouldSkipAsLoop({ origin: 'legacy-mirror', version: 5 }, { version: 5 }));
  assert.ok(s.shouldSkipAsLoop({ origin: 'legacy-mirror', version: 5 }, { version: 9 }));
  // echte (niet-mirror) write → niet skippen
  assert.ok(!s.shouldSkipAsLoop({ origin: 'app', version: 5 }, { version: 9 }));

  // e-mail-guard (legacy-triggers): enkel forward-mirror-echo overslaan
  assert.ok(s.isLegacyMirrorWrite({ _sync: { origin: 'legacy-mirror' } }));
  assert.ok(!s.isLegacyMirrorWrite({ _sync: { origin: 'canonical-mirror' } }), 'web-wijziging moet mailen');
  assert.ok(!s.isLegacyMirrorWrite({}), 'app-write (geen _sync) moet mailen');

  // reverse-mirror reageert enkel op ECHTE canonical-primary writes
  assert.ok(s.isGenuineCanonicalWrite({ _sync: { origin: 'web' } }), 'web-write terugspiegelen');
  assert.ok(s.isGenuineCanonicalWrite({}), 'app-write (geen _sync) WEL terugspiegelen');
  assert.ok(!s.isGenuineCanonicalWrite({ _sync: { origin: 'legacy-mirror' } }), 'forward-echo NIET terugspiegelen (anti-loop)');
}

// 4. ownership-matrix per fase
{
  assert.strictEqual(s.primaryFor('amount', 'fase0'), 'legacy');
  assert.strictEqual(s.primaryFor('status', 'transitie'), 'canonical'); // workflow → canonical na flip
  assert.strictEqual(s.primaryFor('amount', 'transitie'), 'legacy');     // lid-veld blijft legacy tot adoptie
  assert.strictEqual(s.primaryFor('amount', 'adoptie'), 'canonical');
  assert.strictEqual(s.primaryFor('_sync', 'transitie'), 'server');
}

// 5. flag-defaults behouden huidige werking
{
  assert.strictEqual(DEFAULT_FLAGS['sync.legacyToCanonical'], true);
  assert.strictEqual(DEFAULT_FLAGS['sync.canonicalToLegacy'], false);
  assert.strictEqual(DEFAULT_FLAGS['web.canonicalWrites'], false);
  assert.strictEqual(notificationsOwner({}), 'legacy');
}

console.log('OK — dormant sync-engine: change-detection, projecties, guards, ownership, flags');

{
  const canonical = s.buildCanonicalFromLegacy({ demandeur_id: 'member', statut: 'soumis', boutique_supplier_batch_id: 'batch-dev' }, 'expense-dev');
  assert.strictEqual(canonical.boutique_supplier_batch_id, 'batch-dev');
  assert.strictEqual(s.buildLegacyFromCanonical(canonical, 'expense-dev').boutique_supplier_batch_id, 'batch-dev');
}

{
  const claim = { requester_id: 'member', status: 'submitted', operation_id: 'op1', operation_title: 'Sortie', nombre_plongeurs: 0 };
  const legacy = s.buildLegacyFromCanonical(claim, 'expense-dev');
  assert.strictEqual(legacy.operation_id, 'op1');
  assert.strictEqual(legacy.operation_titre, 'Sortie');
  assert.strictEqual(legacy.nombre_plongeurs, 0);
  const roundTrip = s.buildCanonicalFromLegacy(legacy, 'expense-dev');
  for (const key of ['operation_id', 'operation_title', 'nombre_plongeurs']) {
    assert.strictEqual(roundTrip[key], claim[key]);
  }
  assert.ok(!Object.hasOwn(s.buildLegacyFromCanonical({ operation_id: 'op1' }, 'linked'), 'nombre_plongeurs'));
  const unlinked = s.buildLegacyFromCanonical({ requester_id: 'member' }, 'unlinked');
  for (const key of ['operation_id', 'piscine_session_id', 'operation_titre', 'nombre_plongeurs']) {
    assert.ok(!Object.hasOwn(unlinked, key), key);
  }
  assert.strictEqual(s.buildLegacyFromCanonical({ operation_id: null }, 'cleared').operation_id, null);
}

{
  const pool = { piscine_session_id: 'pool1', operation_title: 'Piscine', nombre_plongeurs: 3 };
  const legacy = s.buildLegacyFromCanonical(pool, 'expense-pool');
  assert.strictEqual(legacy.piscine_session_id, 'pool1');
  assert.strictEqual(legacy.operation_titre, 'Piscine');
  assert.ok(!Object.hasOwn(legacy, 'operation_id'));
  const canonical = s.buildCanonicalFromLegacy(legacy, 'expense-pool');
  for (const key of ['piscine_session_id', 'operation_title', 'nombre_plongeurs']) {
    assert.strictEqual(canonical[key], pool[key]);
  }
  assert.ok(!Object.hasOwn(canonical, 'operation_id'));
}

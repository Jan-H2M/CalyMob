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

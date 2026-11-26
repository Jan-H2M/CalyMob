#!/usr/bin/env node

const { parseArgs } = require('node:util');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { eventTariffProblems, missingPaidMemberTariffProblem } = require('../src/inscription/eventTariffSafety');

async function auditEventTariffs(db, clubId) {
  const { docs } = await db.collection(`clubs/${clubId}/operations`)
    .where('type', '==', 'evenement')
    .where('statut', '==', 'ouvert')
    .get();
  return docs.flatMap((doc) => {
    const operation = doc.data();
    const problems = eventTariffProblems(operation, {
      paidTariffsRemoved: Array.isArray(operation.tariff_configuration_problems)
        && operation.tariff_configuration_problems.includes(missingPaidMemberTariffProblem),
    });
    return problems.length ? [{ path: doc.ref.path, title: operation.titre ?? '', problems }] : [];
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      club: { type: 'string', default: 'calypso' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('Usage: node scripts/audit_event_tariffs.js --project <project-id> [--club <club-id>]');
    return;
  }
  if (!values.project || !values.club || values.club.includes('/')) {
    throw new Error('Indiquez --project <project-id> et, si nécessaire, --club <club-id>.');
  }
  const db = getFirestore(initializeApp({ projectId: values.project }));
  try {
    const events = await auditEventTariffs(db, values.club);
    console.log(JSON.stringify(events, null, 2));
    console.error(`${events.length} événement(s) ouvert(s) avec des problèmes de tarifs.`);
  } finally {
    await db.terminate();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { auditEventTariffs };

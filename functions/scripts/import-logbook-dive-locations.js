/**
 * Safely promote historic logbook place names to the central dive catalogue.
 *
 * It groups only strictly normalised variants (case, accents and punctuation),
 * creates an inactive catalogue candidate when no exact catalogue name exists,
 * and links the matching logbook entries to that candidate. It never guesses
 * an SSI match and never merges similar-but-different names.
 *
 * Usage:
 *   node scripts/import-logbook-dive-locations.js --dry-run [--club=calypso]
 *   node scripts/import-logbook-dive-locations.js --apply [--club=calypso]
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))),
});

const db = admin.firestore();
const dryRun = !process.argv.includes('--apply');
const clubArg = process.argv.find((arg) => arg.startsWith('--club='));
const clubId = clubArg ? clubArg.slice('--club='.length) : 'calypso';

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableCandidateId(key) {
  return `logbook_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}`;
}

function preferredName(group) {
  return [...group.names.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'fr'))[0][0];
}

async function main() {
  const clubRef = db.collection('clubs').doc(clubId);
  const [locationsSnap, entriesSnap] = await Promise.all([
    clubRef.collection('dive_locations').get(),
    clubRef.collection('student_logbook_entries').get(),
  ]);

  const locationsByKey = new Map();
  for (const doc of locationsSnap.docs) {
    const data = doc.data();
    if (data.merged_into_location_id) continue;
    const key = data.logbook_import?.name_key || normalize(data.name);
    if (key && !locationsByKey.has(key)) locationsByKey.set(key, doc.id);
  }

  const groups = new Map();
  for (const doc of entriesSnap.docs) {
    const data = doc.data();
    if (data.location_id) continue;
    const name = String(data.location_name ?? data.lieu ?? '').trim();
    const key = normalize(name);
    if (!key) continue;
    const group = groups.get(key) || { names: new Map(), entries: [] };
    group.names.set(name, (group.names.get(name) || 0) + 1);
    group.entries.push(doc);
    groups.set(key, group);
  }

  const candidates = [];
  let alreadyInCatalogue = 0;
  for (const [key, group] of groups) {
    const existingId = locationsByKey.get(key);
    if (existingId) {
      alreadyInCatalogue += 1;
      candidates.push({ key, group, locationId: existingId, create: false });
      continue;
    }
    const locationId = stableCandidateId(key);
    locationsByKey.set(key, locationId);
    candidates.push({ key, group, locationId, create: true });
  }

  const toCreate = candidates.filter((candidate) => candidate.create);
  const entriesToLink = candidates.reduce((sum, candidate) => sum + candidate.group.entries.length, 0);
  console.log(JSON.stringify({
    clubId,
    mode: dryRun ? 'dry-run' : 'apply',
    centralLocationsBefore: locationsSnap.size,
    unlinkedLogbookEntries: entriesToLink,
    normalisedHistoricNames: groups.size,
    existingCatalogueMatches: alreadyInCatalogue,
    newCatalogueCandidates: toCreate.length,
  }, null, 2));
  if (dryRun) return;

  const writer = db.bulkWriter();
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const candidate of toCreate) {
    const aliases = [...candidate.group.names.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
    writer.create(clubRef.collection('dive_locations').doc(candidate.locationId), {
      name: preferredName(candidate.group),
      country: '',
      location_type: 'Autre',
      water_type: 'unknown',
      tariffs: [],
      available_for_events: false,
      created_by: 'system_logbook_import',
      created_at: now,
      updated_at: now,
      logbook_import: {
        name_key: candidate.key,
        entry_count: candidate.group.entries.length,
        aliases,
      },
    });
  }
  for (const candidate of candidates) {
    for (const entry of candidate.group.entries) {
      writer.update(entry.ref, {
        location_id: candidate.locationId,
        location_catalog_linked_at: now,
        location_catalog_link_source: 'historical_logbook_import',
        updated_at: now,
      });
    }
  }
  await writer.close();
  console.log(`Imported ${toCreate.length} catalogue candidates and linked ${entriesToLink} historic logbook entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

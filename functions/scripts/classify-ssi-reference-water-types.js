#!/usr/bin/env node

/**
 * Apply Calypso's approved SSI text classification rules to the internal
 * reference catalogue and to already-confirmed club matches.
 *
 * Rules approved by the club:
 * - reef/récif/rec, coast, island, ocean and marine reserve => Mer
 * - lake/lac/meer => Eau douce / Lac
 * - pool/piscine and quarry/carrière remain direct classifications.
 *
 * Usage:
 *   node scripts/classify-ssi-reference-water-types.js --dry-run
 *   node scripts/classify-ssi-reference-water-types.js --apply
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const CLUB_ID = 'calypso';
const EXPORT_FILE = process.env.SSI_EXPORT_PATH || '/Users/jan/Desktop/ssi-wereldwijd-duikstekken.json';
const SERVICE_ACCOUNT = process.env.CALYCOMPTA_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'service-account-key.json');
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 400;

function deriveClassification(site) {
  const text = `${site.name || ''}\n${site.description || ''}`.toLocaleLowerCase('fr');
  if (/\b(swimming\s*pool|pool|piscine|zwembad)\b/.test(text)) {
    return { water_type: 'pool', location_type: 'Piscine', rule: 'pool_keyword', confidence: 'high' };
  }
  if (/\b(quarry|carri[eè]re|groeve|steengroeve)\b/.test(text)) {
    return { water_type: 'fresh', location_type: 'Carrière', rule: 'quarry_keyword', confidence: 'high' };
  }
  if (/\b(lake|lac|meer|lago)\b/.test(text)) {
    return { water_type: 'fresh', location_type: 'Lac', rule: 'lake_keyword', confidence: 'high' };
  }
  if (/\b(reef|récif|rec|coast|coastal|island|ocean|marine(?:\s+reserve)?|sea)\b/.test(text)) {
    return { water_type: 'sea', location_type: 'Mer', rule: 'sea_keyword', confidence: 'high' };
  }
  return { water_type: 'unknown', location_type: 'Autre', rule: 'no_direct_signal', confidence: 'unknown' };
}

async function main() {
  const source = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));
  if (!Array.isArray(source.sites)) throw new Error('SSI export has no sites array.');
  const classifications = new Map(source.sites.map((site) => [String(site.id), deriveClassification(site)]));
  const counts = {};
  for (const classification of classifications.values()) {
    counts[classification.location_type] = (counts[classification.location_type] || 0) + 1;
  }
  const summary = { mode: APPLY ? 'apply' : 'dry-run', total_ssi_sites: source.sites.length, classifications: counts };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) return summary;

  const app = admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) }, 'ssi-water-type-classifier');
  const db = app.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const referenceSites = db.collection('clubs').doc(CLUB_ID).collection('reference_dive_sites');
  const ids = [...classifications.keys()];
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of ids.slice(start, start + BATCH_SIZE)) {
      const classification = classifications.get(id);
      batch.update(referenceSites.doc(`ssi_${id}`), {
        water_type: classification.water_type,
        location_type: classification.location_type,
        classification: { source: 'ssi_text_rules_v1', ...classification, updated_at: now },
        updated_at: now,
      });
    }
    await batch.commit();
  }

  const locations = await db.collection('clubs').doc(CLUB_ID).collection('dive_locations').get();
  const writer = db.bulkWriter();
  let centralUpdated = 0;
  for (const doc of locations.docs) {
    const location = doc.data();
    const siteId = location.reference_match?.provider === 'ssi'
      ? String(location.reference_match.provider_site_id) : null;
    const classification = siteId ? classifications.get(siteId) : null;
    if (!classification || classification.water_type === 'unknown' || location.merged_into_location_id) continue;
    const patch = { updated_at: now };
    if (!location.water_type || location.water_type === 'unknown') patch.water_type = classification.water_type;
    if (!location.location_type || location.location_type === 'Autre') patch.location_type = classification.location_type;
    if (Object.keys(patch).length > 1) {
      writer.update(doc.ref, patch);
      centralUpdated += 1;
    }
  }
  await writer.close();
  console.log(`Classified ${ids.length} SSI records and updated ${centralUpdated} confirmed Calypso locations.`);
  return { ...summary, central_locations_updated: centralUpdated };
}

main().catch((error) => {
  console.error(`SSI water classification failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { deriveClassification };

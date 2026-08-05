#!/usr/bin/env node

/**
 * Import a previously downloaded SSI export into Calypso's existing Firestore
 * project. The records stay in a server-only reference collection, separate
 * from the catalogue shown in events.
 *
 * Usage:
 *   node scripts/import-ssi-reference-into-club.js --dry-run
 *   node scripts/import-ssi-reference-into-club.js --apply
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const CLUB_ID = 'calypso';
const EXPORT_FILE = process.env.SSI_EXPORT_PATH || '/Users/jan/Desktop/ssi-wereldwijd-duikstekken.json';
const TRANSLATIONS_FILE = process.env.SSI_FR_TRANSLATIONS_PATH || '/Users/jan/Desktop/ssi-fr-translations.json';
const SERVICE_ACCOUNT = process.env.CALYCOMPTA_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'service-account-key.json');
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 400;

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('fr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceUrl(site) {
  if (typeof site.url === 'string' && site.url.trim()) return site.url.trim();
  return site.region_slug ? `https://www.scubago.com/en/explore/divesite/${site.region_slug}` : null;
}

function validCoordinates(site) {
  return Number.isFinite(site.lat) && Number.isFinite(site.lng)
    && site.lat >= -90 && site.lat <= 90 && site.lng >= -180 && site.lng <= 180;
}

function documentFor(site, frenchTranslation, sourceSnapshotId) {
  const displayName = typeof site.name === 'string' ? site.name.trim() : '';
  if (!site.id || !displayName || !validCoordinates(site)) return null;
  const normalized = normalizeText(displayName);
  const searchTokens = [...new Set(normalized.split(' ').filter((token) => token.length >= 3))];
  const descriptions = {};
  if (typeof site.description === 'string' && site.description.trim()) descriptions.en = site.description.trim();
  if (frenchTranslation) descriptions.fr = frenchTranslation;
  return {
    schema_version: 1,
    provider: 'ssi',
    provider_site_id: String(site.id),
    display_name: displayName,
    normalized_name: normalized,
    aliases: [],
    match_keys: [normalized],
    search_tokens: searchTokens,
    country_iso3: typeof site.country_iso3 === 'string' ? site.country_iso3 : null,
    region_slug: typeof site.region_slug === 'string' ? site.region_slug : null,
    source_url: sourceUrl(site),
    location: { latitude: site.lat, longitude: site.lng },
    dive_activity: {
      average_max_depth_m: Number.isFinite(site.maxDepth_m) ? site.maxDepth_m : null,
      average_dive_time_min: Number.isFinite(site.divetime_min) ? site.divetime_min : null,
      average_visibility_m: Number.isFinite(site.vis_m) ? site.vis_m : null,
      average_rating: Number.isFinite(site.rating) ? site.rating : null,
      logged_dives: Number.isFinite(site.loggedDives) ? site.loggedDives : null,
      logged_users: Number.isFinite(site.loggedUsers) ? site.loggedUsers : null,
    },
    experience_levels: Array.isArray(site.level) ? site.level.filter((value) => typeof value === 'string' && value.trim()) : [],
    wildlife_ids: Array.isArray(site.wildlife_ids) ? site.wildlife_ids.filter(Number.isInteger) : [],
    affiliated_center_count: Number.isFinite(site.affiliatedCenters) ? site.affiliatedCenters : null,
    descriptions,
    media: { primary: typeof site.image === 'string' ? site.image : null, copyright: typeof site.image_copyright === 'string' ? site.image_copyright : null },
    quality: { status: 'unreviewed', canonical_site_id: null, review_notes: null },
    provenance: { source_snapshot_id: sourceSnapshotId, imported_from_export: true },
  };
}

async function main() {
  const bytes = fs.readFileSync(EXPORT_FILE);
  const source = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(source.sites)) throw new Error('SSI export has no sites array.');
  const translations = fs.existsSync(TRANSLATIONS_FILE)
    ? JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8')).translations || {} : {};
  const snapshotId = `ssi_${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}`;
  const documents = source.sites.map((site) => documentFor(
    site,
    translations[String(site.id)]?.status === 'translated' ? translations[String(site.id)].translation : null,
    snapshotId,
  )).filter(Boolean);
  const summary = {
    mode: APPLY ? 'apply' : 'dry-run', export_total: source.sites.length, valid_reference_records: documents.length,
    french_descriptions: documents.filter((doc) => doc.descriptions.fr).length, target: `clubs/${CLUB_ID}/reference_dive_sites`,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) return summary;

  const app = admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) }, 'club-reference-importer');
  const db = app.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const collection = db.collection('clubs').doc(CLUB_ID).collection('reference_dive_sites');
  let written = 0;
  for (let start = 0; start < documents.length; start += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = documents.slice(start, start + BATCH_SIZE);
    for (const doc of chunk) batch.set(collection.doc(`ssi_${doc.provider_site_id}`), { ...doc, imported_at: now, updated_at: now }, { merge: true });
    await batch.commit();
    written += chunk.length;
    console.log(`Imported ${written}/${documents.length} reference records.`);
  }
  await db.collection('clubs').doc(CLUB_ID).collection('reference_dive_site_import_runs').doc(snapshotId).set({
    provider: 'ssi', snapshot_id: snapshotId, source_exported_at: source.exported || null, source_count: source.sites.length,
    written_count: written, french_descriptions: summary.french_descriptions, completed_at: now,
  });
  console.log(`Completed SSI reference import: ${written} records.`);
  return { ...summary, written };
}

main().catch((error) => {
  console.error(`SSI reference import failed: ${error.message}`);
  process.exitCode = 1;
});

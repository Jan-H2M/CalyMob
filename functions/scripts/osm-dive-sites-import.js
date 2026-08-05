/**
 * One-off: import OSM dive sites (sport=scuba_diving) for BE + NL into
 * top-level collection `dive_sites_ref`.
 *
 * Fields: name, aliases[], lat, lng, country, water_type, source='osm',
 *         osm_type, osm_id, verified=true
 *
 * Usage: node scripts/osm-dive-sites-import.js [--dry-run]
 */
const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))),
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'calypso-divesite-import/1.0 (club logbook geocoding)';

const REGIONS = [
  { iso: 'BE', country: 'BE' },
  { iso: 'NL', country: 'NL' },
];

function waterTypeFromTags(tags) {
  const natural = (tags.natural || '').toLowerCase();
  const water = (tags.water || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();
  if (natural === 'water' && /mer|sea|zee|océan|ocean/.test(name)) return 'sea';
  if (/salt/.test(water)) return 'sea';
  if (tags.seamark || natural === 'coastline') return 'sea';
  // heuristic: known sea-area keywords
  if (/grevelingen|oosterschelde|westerschelde|waddenzee|noordzee|north sea/.test(name)) return 'sea';
  if (water === 'pool' || /todi|transfo|piscine|zwembad|pool/.test(name)) return 'pool';
  return 'fresh';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length];
    try {
      const res = await fetch(url + '?data=' + encodeURIComponent(query), {
        headers: { 'User-Agent': UA },
      });
      if (res.ok) return res.json();
      lastErr = new Error(`Overpass HTTP ${res.status} (${url})`);
    } catch (e) {
      lastErr = e;
    }
    const wait = 5000 * (attempt + 1);
    console.log(`  retry ${attempt + 1}/5 in ${wait / 1000}s (${lastErr.message})`);
    await sleep(wait);
  }
  throw lastErr;
}

function elementCoords(el) {
  if (el.type === 'node') return { lat: el.lat, lng: el.lon };
  const c = el.center;
  if (c) return { lat: c.lat, lng: c.lon };
  return null;
}

async function main() {
  const all = new Map(); // key: `${type}/${id}`
  for (const region of REGIONS) {
    const q = `[out:json][timeout:120];area["ISO3166-1"="${region.iso}"]->.a;nwr["sport"="scuba_diving"](area.a);out center tags;`;
    console.log(`Fetching OSM dive sites for ${region.iso}...`);
    const data = await overpass(q);
    console.log(`  ${data.elements.length} elements`);
    for (const el of data.elements) {
      const key = `${el.type}/${el.id}`;
      all.set(key, { el, country: region.country });
    }
  }

  console.log(`Total unique elements: ${all.size}`);

  // Load existing ref docs to avoid duplicates (by osm id)
  const existing = await db.collection('dive_sites_ref').get();
  const existingOsm = new Set(existing.docs.map((d) => `${d.data().osm_type}/${d.data().osm_id}`));
  console.log(`Existing dive_sites_ref docs: ${existing.size}`);

  let created = 0, skippedNoName = 0, skippedNoCoords = 0, skippedExisting = 0;
  const unnamed = [];
  const batch = db.batch();
  const batchLimit = 400;
  let pending = 0;

  for (const { el, country } of all.values()) {
    const tags = el.tags || {};
    // Many dive spots are tagged with scuba_diving:name instead of name
    // (the generic `name` then belongs to the underlying water body / pitch).
    const name = (tags['scuba_diving:name'] || tags.name || '').trim();
    const coords = elementCoords(el);
    const osmKey = `${el.type}/${el.id}`;

    if (existingOsm.has(osmKey)) { skippedExisting++; continue; }
    if (!name) { skippedNoName++; if (unnamed.length < 15) unnamed.push(osmKey + ' ' + JSON.stringify(tags).slice(0, 120)); continue; }
    if (!coords) { skippedNoCoords++; continue; }

    const ref = db.collection('dive_sites_ref').doc();
    batch.set(ref, {
      name,
      aliases: [],
      lat: coords.lat,
      lng: coords.lng,
      country,
      water_type: waterTypeFromTags(tags),
      source: 'osm',
      osm_type: el.type,
      osm_id: el.id,
      verified: true,
      imported_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    created++;
    pending++;
    if (!DRY_RUN && pending >= batchLimit) {
      await batch.commit();
      pending = 0;
    }
  }

  if (!DRY_RUN && pending > 0) await batch.commit();

  console.log(`\nResult: created=${created} skipped(existing)=${skippedExisting} skipped(no-name)=${skippedNoName} skipped(no-coords)=${skippedNoCoords} dryRun=${DRY_RUN}`);
  if (unnamed.length) {
    console.log('\nSample unnamed elements (skipped):');
    unnamed.forEach((u) => console.log('  ' + u));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

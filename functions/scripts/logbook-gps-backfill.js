/**
 * One-off: backfill latitude/longitude on student_logbook_entries.
 *
 * Resolution cascade per entry without GPS (source != 'piscine'):
 *   1. club dive_locations (via location_id, or normalized name match) with lat/lng
 *   2. another entry (any member) with same normalized location_name that HAS GPS
 *   3. dive_sites_ref (OSM import) by normalized name / alias
 *
 * Usage: node scripts/logbook-gps-backfill.js [--dry-run] [--club=calypso]
 */
const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))),
});
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const clubArg = process.argv.find((a) => a.startsWith('--club='));
const CLUB = clubArg ? clubArg.split('=')[1] : 'calypso';

function normalizeName(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  console.log(`Backfill logbook GPS for club '${CLUB}' (dryRun=${DRY_RUN})`);

  // --- Load reference data ---
  const [entriesSnap, clubLocSnap, refSnap] = await Promise.all([
    db.collection('clubs').doc(CLUB).collection('student_logbook_entries').get(),
    db.collection('clubs').doc(CLUB).collection('dive_locations').get(),
    db.collection('dive_sites_ref').get(),
  ]);
  console.log(`entries=${entriesSnap.size} clubLocations=${clubLocSnap.size} refSites=${refSnap.size}`);

  // Club locations indexed by id and normalized name (only those with GPS)
  const clubLocById = new Map();
  const clubLocByName = new Map();
  for (const d of clubLocSnap.docs) {
    const l = d.data();
    if (typeof l.latitude !== 'number' || typeof l.longitude !== 'number') continue;
    clubLocById.set(d.id, { lat: l.latitude, lng: l.longitude, name: l.name, source: 'club_location' });
    const norm = normalizeName(l.name);
    if (norm && !clubLocByName.has(norm)) {
      clubLocByName.set(norm, { lat: l.latitude, lng: l.longitude, name: l.name, source: 'club_location' });
    }
  }

  // Ref sites (OSM) by normalized name + aliases + stripped site-prefixes
  const refByName = new Map();
  for (const d of refSnap.docs) {
    const r = d.data();
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    const candidate = { lat: r.lat, lng: r.lng, name: r.name, source: 'osm_ref' };
    const aliases = new Set([r.name, ...(r.aliases || [])]);
    // Also index without generic site-type prefixes so "Duikplaats Den Osse"
    // matches an entry named "Den Osse".
    for (const alias of [...aliases]) {
      aliases.add(alias.replace(/^(duikplaats|duikstek|duiksite|plongée|plongee|duiklocatie)\s+/i, ''));
    }
    for (const alias of aliases) {
      const norm = normalizeName(alias);
      if (norm && !refByName.has(norm)) refByName.set(norm, candidate);
    }
  }

  // Pass 1: collect entries without GPS + build member-GPS name index from entries WITH GPS
  const gpsByName = new Map(); // normalized location_name -> coords from any entry with GPS
  const needsGps = [];
  for (const d of entriesSnap.docs) {
    const e = d.data();
    if (e.source === 'piscine') continue;
    const hasGps = typeof e.latitude === 'number' && typeof e.longitude === 'number';
    const norm = normalizeName(e.location_name);
    if (hasGps) {
      if (norm && !gpsByName.has(norm)) {
        gpsByName.set(norm, { lat: e.latitude, lng: e.longitude, name: e.location_name, source: 'member_entry' });
      }
    } else {
      needsGps.push({ id: d.id, entry: e, norm });
    }
  }
  console.log(`entries needing GPS: ${needsGps.length}; member-GPS names available: ${gpsByName.size}`);

  // Pass 2: resolve
  const stats = { club_location: 0, member_entry: 0, osm_ref: 0, unresolved: 0 };
  const unresolvedNames = new Map();
  const updates = [];

  for (const { id, entry, norm } of needsGps) {
    let hit = null;
    // 1a. club location via location_id
    if (entry.location_id && clubLocById.has(entry.location_id)) {
      hit = clubLocById.get(entry.location_id);
    }
    // 1b. club location via name
    if (!hit && norm && clubLocByName.has(norm)) hit = clubLocByName.get(norm);
    // 2. member entries with GPS
    if (!hit && norm && gpsByName.has(norm)) hit = gpsByName.get(norm);
    // 3. OSM ref — exact
    if (!hit && norm && refByName.has(norm)) hit = refByName.get(norm);
    // 3b. OSM ref — fuzzy contains (both directions), only for distinctive names
    if (!hit && norm && norm.length >= 5) {
      let best = null;
      for (const [refNorm, candidate] of refByName) {
        if (refNorm.length < 5) continue;
        if (norm.includes(refNorm) || refNorm.includes(norm)) {
          // prefer the longest matching key (most specific)
          if (!best || refNorm.length > best[0].length) best = [refNorm, candidate];
        }
      }
      if (best) hit = best[1];
    }

    if (hit) {
      stats[hit.source] += 1;
      updates.push({
        id,
        data: {
          latitude: hit.lat,
          longitude: hit.lng,
          gps_backfill_source: hit.source,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    } else {
      stats.unresolved += 1;
      const name = entry.location_name || '(sans nom)';
      unresolvedNames.set(name, (unresolvedNames.get(name) || 0) + 1);
    }
  }

  console.log(`\nResolution: club_location=${stats.club_location} member_entry=${stats.member_entry} osm_ref=${stats.osm_ref} unresolved=${stats.unresolved}`);

  if (!DRY_RUN && updates.length > 0) {
    let batch = db.batch();
    let pending = 0;
    let written = 0;
    for (const u of updates) {
      const ref = db.collection('clubs').doc(CLUB).collection('student_logbook_entries').doc(u.id);
      batch.update(ref, u.data);
      pending++;
      if (pending >= 400) {
        await batch.commit();
        written += pending;
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) {
      await batch.commit();
      written += pending;
    }
    console.log(`Wrote ${written} entry updates.`);
  } else {
    console.log(`Dry run / nothing to write (${updates.length} updates prepared).`);
  }

  if (unresolvedNames.size > 0) {
    console.log('\nUnresolved location names (top 40):');
    [...unresolvedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
      .forEach(([n, c]) => console.log(`  ${c}x "${n}"`));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

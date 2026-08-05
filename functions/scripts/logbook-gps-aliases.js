/**
 * One-off: apply curated GPS aliases for unresolved logbook location names.
 * Coordinates: Nominatim geocoding + known dive-site positions (Zeeland/BE).
 * Aliases are upserted into dive_sites_ref (source='manual', verified=false)
 * AND applied to matching entries.
 * Usage: node scripts/logbook-gps-aliases.js [--dry-run] [--club=calypso]
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))) });
const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');
const clubArg = process.argv.find((a) => a.startsWith('--club='));
const CLUB = clubArg ? clubArg.split('=')[1] : 'calypso';

const norm = (v) => (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const ALIASES = {
  'oesterdam': { name: 'Oesterdam', lat: 51.5789, lng: 4.1310, country: 'NL', water_type: 'sea' },
  'den osse': { name: 'Den Osse', lat: 51.7397, lng: 3.8910, country: 'NL', water_type: 'sea' },
  'den osse haven': { name: 'Den Osse Haven', lat: 51.7405, lng: 3.8898, country: 'NL', water_type: 'sea' },
  'dreishor': { name: 'Dreishor', lat: 51.7185, lng: 3.8530, country: 'NL', water_type: 'sea' },
  'dreishor reefball': { name: 'Dreishor ReefBall', lat: 51.7185, lng: 3.8530, country: 'NL', water_type: 'sea' },
  'dreishor frans kok rif': { name: 'Dreishor Frans Kok Rif', lat: 51.7185, lng: 3.8530, country: 'NL', water_type: 'sea' },
  'gemaal van dreishor': { name: 'Gemaal van Dreishor', lat: 51.7185, lng: 3.8530, country: 'NL', water_type: 'sea' },
  'zeelanbrug': { name: 'Zeelandbrug', lat: 51.6123, lng: 3.8913, country: 'NL', water_type: 'sea' },
  'scharendijk': { name: 'Scharendijke', lat: 51.7337, lng: 3.8473, country: 'NL', water_type: 'sea' },
  'scharendijk epave serpent': { name: 'Scharendijke - Le Serpent', lat: 51.7360, lng: 3.8420, country: 'NL', water_type: 'sea' },
  'wemelding parking': { name: 'Wemeldinge Parking', lat: 51.5295, lng: 4.0030, country: 'NL', water_type: 'sea' },
  'wemelding tetjes': { name: 'Wemeldinge Tetjes', lat: 51.5295, lng: 4.0030, country: 'NL', water_type: 'sea' },
  'wemeldingen stellehoek': { name: 'Wemeldinge Stellehoek', lat: 51.5295, lng: 4.0030, country: 'NL', water_type: 'sea' },
  'zouterbout': { name: 'Zoetersbout', lat: 51.6597, lng: 3.9824, country: 'NL', water_type: 'sea' },
  'platte taille': { name: "Barrages de l'Eau d'Heure - Platte Taille", lat: 50.1886, lng: 4.3793, country: 'BE', water_type: 'fresh' },
  'villers 2 eglises': { name: 'Villers-Deux-Églises', lat: 50.1898, lng: 4.4825, country: 'BE', water_type: 'fresh' },
  'barrages de l eau d heure': { name: "Barrages de l'Eau d'Heure", lat: 50.1886, lng: 4.3793, country: 'BE', water_type: 'fresh' },
  'sprimont': { name: 'Sprimont', lat: 50.5055, lng: 5.6617, country: 'BE', water_type: 'fresh' },
  'opp rebais': { name: 'Opprebais', lat: 50.6818, lng: 4.7958, country: 'BE', water_type: 'fresh' },
  'han sur lesse': { name: 'Han-sur-Lesse', lat: 50.1255, lng: 5.1877, country: 'BE', water_type: 'fresh' },
  'gochenee': { name: 'Gochenée', lat: 50.1842, lng: 4.7597, country: 'BE', water_type: 'fresh' },
  'nekker': { name: 'De Nekker', lat: 51.0356, lng: 4.4832, country: 'BE', water_type: 'fresh' },
  'tossa de mar': { name: 'Tossa de Mar', lat: 41.7198, lng: 2.9312, country: 'ES', water_type: 'sea' },
  'cassis': { name: 'Cassis', lat: 43.2140, lng: 5.5396, country: 'FR', water_type: 'sea' },
  'radazul': { name: 'Radazul', lat: 28.4040, lng: -16.3240, country: 'ES', water_type: 'sea' },
  'esch sur sure': { name: 'Esch-sur-Sûre', lat: 49.9113, lng: 5.9351, country: 'LU', water_type: 'fresh' },
};

async function main() {
  console.log(`Applying ${Object.keys(ALIASES).length} curated aliases (dryRun=${DRY_RUN}, club=${CLUB})`);

  // 1. Upsert into dive_sites_ref (match on normalized name to avoid duplicates)
  const refSnap = await db.collection('dive_sites_ref').get();
  const refByNorm = new Map(refSnap.docs.map((d) => [norm(d.data().name), d.id]));
  let refCreated = 0, refExisting = 0;
  for (const a of Object.values(ALIASES)) {
    const n = norm(a.name);
    if (refByNorm.has(n)) { refExisting++; continue; }
    if (!DRY_RUN) {
      await db.collection('dive_sites_ref').add({
        name: a.name, aliases: [], lat: a.lat, lng: a.lng, country: a.country,
        water_type: a.water_type, source: 'manual', verified: false,
        imported_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    refCreated++;
  }
  console.log(`dive_sites_ref: created=${refCreated} already-existing=${refExisting}`);

  // 2. Apply to matching entries without GPS
  const entriesSnap = await db.collection('clubs').doc(CLUB).collection('student_logbook_entries').get();
  const updates = [];
  const missed = new Map();
  for (const d of entriesSnap.docs) {
    const e = d.data();
    if (e.source === 'piscine') continue;
    if (typeof e.latitude === 'number' && typeof e.longitude === 'number') continue;
    const n = norm(e.location_name);
    if (n && ALIASES[n]) {
      const a = ALIASES[n];
      updates.push({ id: d.id, data: { latitude: a.lat, longitude: a.lng, gps_backfill_source: 'manual_alias', updated_at: admin.firestore.FieldValue.serverTimestamp() } });
    } else {
      missed.set(e.location_name || '(sans nom)', (missed.get(e.location_name || '(sans nom)') || 0) + 1);
    }
  }
  console.log(`entries to update via aliases: ${updates.length}; still unresolved: ${missed.size} names`);

  if (!DRY_RUN && updates.length > 0) {
    let batch = db.batch(); let pending = 0; let written = 0;
    for (const u of updates) {
      batch.update(db.collection('clubs').doc(CLUB).collection('student_logbook_entries').doc(u.id), u.data);
      if (++pending >= 400) { await batch.commit(); written += pending; batch = db.batch(); pending = 0; }
    }
    if (pending > 0) { await batch.commit(); written += pending; }
    console.log(`Wrote ${written} entry updates.`);
  } else {
    console.log(`Dry run / nothing to write (${updates.length} prepared).`);
  }

  if (missed.size > 0) {
    console.log('\nStill unresolved (top 40):');
    [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([n, c]) => console.log(`  ${c}x "${n}"`));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

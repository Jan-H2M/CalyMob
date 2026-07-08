/**
 * WP-26 MS-A — tests des fonctions pures (hash + extraction de version).
 */
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: () => () => {} }));
jest.mock('firebase-functions/v2/https', () => ({ onCall: () => () => {}, HttpsError: class {} }));
jest.mock('firebase-admin', () => ({ firestore: () => ({}), storage: () => ({}) }));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'ts' } }));
jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../utils/emailDelivery', () => ({ sendEmailWithConfig: jest.fn() }));

const {
  sha256, extractVersion, segmentPage, classifyChange, diffSections, normalizeForCompare,
} = require('./milSync');

describe('WP-26 MS-A helpers', () => {
  test('sha256 déterministe et sensible au contenu', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
    expect(sha256('abc')).toHaveLength(64);
  });

  test('extractVersion trouve le marqueur v2026-7', () => {
    expect(extractVersion('... MIL v2026-7 ...')).toBe('v2026-7');
    expect(extractVersion('version v2025.3 ok')).toBe('v2025.3');
    expect(extractVersion('aucun marqueur')).toBeNull();
  });
});

describe('WP-26 MS-B — segmentation + diff', () => {
  const html = (screens) => screens
    .map((t) => `<div class="button home"></div><div>${t}</div>`)
    .join('');

  test('segmentPage découpe par écran (bouton home)', () => {
    const secs = segmentPage(html(['Standard 1 ★ Brevet 2 ★ total 5', 'Standard 2 ★ Brevet 3 ★ total 25']));
    expect(secs.length).toBe(2);
    expect(secs[0].title).toContain('Standard 1');
    expect(secs[0].hash).toHaveLength(64);
  });

  test('classifyChange : N0 cosmétique, N2 chiffres, N1 texte', () => {
    expect(classifyChange('total 25 plongees', 'total  25   plongees.')).toBe('N0');
    expect(classifyChange('total 25 plongees', 'total 30 plongees')).toBe('N2');
    expect(classifyChange('remontee assistee', 'remontee guidee')).toBe('N1');
  });

  test('diffSections : modif chiffre → N2 ; ajout → N3', () => {
    // Écran réaliste : l'identifiant (stable) est en tête, les chiffres qui
    // changent sont dans le corps (au-delà du titre) → clé stable.
    const screen = (id, total) =>
      `Epreuves en milieu naturel Epreuve en piscine ${id} — tableau des experiences 7.4.1 : total en milieu naturel ${total} plongees, a 20 m 10 plongees`;
    const prev = segmentPage(html([screen('Standard 2 Brevet 3', '25'), screen('Standard 3 Brevet 4', '75')]));
    const cur = segmentPage(html([screen('Standard 2 Brevet 3', '30'), screen('Standard 3 Brevet 4', '75'), screen('Standard 4 Brevet AM', '100')]));
    const props = diffSections(prev, cur);
    const n2 = props.find((p) => p.level === 'N2');
    const n3 = props.find((p) => p.level === 'N3');
    expect(n2).toBeTruthy();
    expect(n3).toBeTruthy();
    expect(normalizeForCompare('a b.')).toBe('ab');
  });
});

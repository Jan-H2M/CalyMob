/**
 * Group-key normalisation (WP-03, décision D1).
 *
 * Convention canonique = format Dart : "2star_groupe1", "AM_groupe2".
 * D'anciens clients web émettaient "2*-1" / "AM-2". Ce helper convertit l'ancien
 * format à la lecture ; tout ce qui n'est pas au format ancien est renvoyé tel
 * quel (donc un group_key déjà canonique passe inchangé).
 *
 * Spec exacte (CARNET_PLONGEE_SPEC.md §WP-03, rubrique 4) :
 *   entrée matchant /^(.+)-(\d+)$/ → `${cap1.replace('*','star')}_groupe${cap2}`
 *   sinon (y compris '' / null / undefined) → inchangé.
 */

function normalizeGroupKey(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return raw;
  const m = raw.match(/^(.+)-(\d+)$/);
  if (!m) return raw;
  const level = m[1].replace('*', 'star');
  return `${level}_groupe${m[2]}`;
}

module.exports = { normalizeGroupKey };

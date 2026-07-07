/**
 * WP-18 — Résolution du « chef d'école » (responsable pédagogique).
 *
 * Ordre : `settings/general.chef_ecole_member_id` si présent, sinon le premier
 * membre `app_role in ['admin','superadmin']` (fallback historique). Utilisé
 * pour assigner les preuves externes (D18) et l'escalade SLA (WP-17).
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} clubId
 * @returns {Promise<string>} member id du chef d'école (ou '' si introuvable)
 */
async function resolveChefEcole(db, clubId) {
  const clubRef = db.collection('clubs').doc(clubId);

  try {
    const settings = await clubRef.collection('settings').doc('general').get();
    if (settings.exists) {
      const id = settings.data().chef_ecole_member_id;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch (err) {
    console.warn(`[resolveChefEcole] settings/general read failed: ${err.message}`);
  }

  try {
    const admin = require('firebase-admin');
    const snap = await clubRef
      .collection('members')
      .where('app_role', 'in', ['admin', 'superadmin'])
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  } catch (err) {
    console.warn(`[resolveChefEcole] admin lookup failed: ${err.message}`);
  }

  return '';
}

module.exports = { resolveChefEcole };

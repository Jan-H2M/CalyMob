/**
 * COM-167 — Résolution du « chef d'école » (responsable pédagogique).
 *
 * Ordre :
 *  1. Premier membre dont `clubStatuten` contient "Chef d'école".
 *  2. Fallback : premier membre `app_role == 'admin'` (ordre doc-id).
 *
 * L'ancien champ `settings/general.chef_ecole_member_id` n'est plus utilisé.
 * La fonction en un seul titulaire ; la fiche membre fait respecter cette
 * contrainte (avertissement + transfert automatique via UserDetailView).
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} clubId
 * @returns {Promise<string>} member id du chef d'école (ou '' si introuvable)
 */
async function resolveChefEcole(db, clubId) {
  const membersRef = db.collection('clubs').doc(clubId).collection('members');

  // Primary: member with Chef d'école function
  try {
    const snap = await membersRef
      .where('clubStatuten', 'array-contains', "Chef d'école")
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  } catch (err) {
    console.warn(`[resolveChefEcole] clubStatuten lookup failed: ${err.message}`);
  }

  // Fallback: first admin (by document id)
  try {
    const admin = require('firebase-admin');
    const snap = await membersRef
      .where('app_role', '==', 'admin')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  } catch (err) {
    console.warn(`[resolveChefEcole] admin fallback failed: ${err.message}`);
  }

  return '';
}

module.exports = { resolveChefEcole };

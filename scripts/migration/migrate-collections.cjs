/**
 * Script de migration Firestore: Renommage collections
 *
 * CHANGEMENTS:
 * - members → users (Utilisateurs CalyCompta avec authentification)
 * - inventory_members → members (Membres du club pour inventaire)
 *
 * USAGE:
 *   node scripts/migrate-collections.cjs
 *
 * PREREQUIS:
 *   - serviceAccountKey.json dans le dossier scripts/
 *   - Backup Firestore effectué
 *
 * ATTENTION:
 *   - Ce script NE supprime PAS les anciennes collections
 *   - Vérifier les données migrées avant de supprimer manuellement
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialiser Firebase Admin
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('❌ Erreur: serviceAccountKey.json introuvable');
  console.error('   Placez votre clé de service dans:', serviceAccountPath);
  process.exit(1);
}

const db = admin.firestore();
const clubId = 'calypso'; // ID du club Calypso

/**
 * Migrer une collection vers un nouveau nom
 */
async function migrateCollection(sourceCollection, targetCollection, collectionName) {
  console.log(`\n📦 Migration: ${sourceCollection} → ${targetCollection}`);

  try {
    const sourceRef = db.collection(`clubs/${clubId}/${sourceCollection}`);
    const snapshot = await sourceRef.get();

    if (snapshot.empty) {
      console.log(`   ℹ️  Collection source vide (${snapshot.size} documents)`);
      return { migrated: 0, errors: [] };
    }

    console.log(`   📊 ${snapshot.size} documents à migrer`);

    const batchSize = 500; // Firestore batch limit
    let migrated = 0;
    let errors = [];

    // Migrer par batch de 500 documents
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = db.batch();
      const docsSlice = snapshot.docs.slice(i, i + batchSize);

      docsSlice.forEach(doc => {
        const targetRef = db.doc(`clubs/${clubId}/${targetCollection}/${doc.id}`);
        batch.set(targetRef, doc.data());
      });

      try {
        await batch.commit();
        migrated += docsSlice.length;
        console.log(`   ✓ Batch ${Math.floor(i / batchSize) + 1}: ${docsSlice.length} documents migrés (total: ${migrated}/${snapshot.size})`);
      } catch (error) {
        errors.push({
          batch: Math.floor(i / batchSize) + 1,
          error: error.message
        });
        console.error(`   ✗ Erreur batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      }
    }

    return { migrated, errors, total: snapshot.size };

  } catch (error) {
    console.error(`   ❌ Erreur migration ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Vérifier l'intégrité des données migrées
 */
async function verifyMigration(sourceCollection, targetCollection) {
  console.log(`\n🔍 Vérification: ${sourceCollection} ↔ ${targetCollection}`);

  const sourceSnapshot = await db.collection(`clubs/${clubId}/${sourceCollection}`).get();
  const targetSnapshot = await db.collection(`clubs/${clubId}/${targetCollection}`).get();

  const sourceCount = sourceSnapshot.size;
  const targetCount = targetSnapshot.size;

  console.log(`   Source (${sourceCollection}): ${sourceCount} documents`);
  console.log(`   Cible (${targetCollection}): ${targetCount} documents`);

  if (sourceCount === targetCount) {
    console.log(`   ✅ Nombre de documents identique`);
    return true;
  } else {
    console.log(`   ⚠️  Différence de ${Math.abs(sourceCount - targetCount)} documents`);
    return false;
  }
}

/**
 * Script principal
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔄 MIGRATION FIRESTORE: Renommage Collections              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nClub ID: ${clubId}`);
  console.log(`Date: ${new Date().toLocaleString()}`);

  const results = {
    members_to_users: null,
    inventory_members_to_members: null
  };

  try {
    // Migration 1: members → users
    console.log('\n' + '='.repeat(70));
    console.log('ÉTAPE 1/2: Utilisateurs CalyCompta');
    console.log('='.repeat(70));
    results.members_to_users = await migrateCollection('members', 'users', 'Utilisateurs');

    // Migration 2: inventory_members → members
    console.log('\n' + '='.repeat(70));
    console.log('ÉTAPE 2/2: Membres du club');
    console.log('='.repeat(70));
    results.inventory_members_to_members = await migrateCollection('inventory_members', 'members', 'Membres club');

    // Vérification
    console.log('\n' + '='.repeat(70));
    console.log('VÉRIFICATION DES DONNÉES');
    console.log('='.repeat(70));

    const verify1 = await verifyMigration('members', 'users');
    const verify2 = await verifyMigration('inventory_members', 'members');

    // Rapport final
    console.log('\n' + '╔══════════════════════════════════════════════════════════════╗');
    console.log('║  📊 RAPPORT FINAL                                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    console.log('\n✅ Migration terminée avec succès!');
    console.log('\n📈 Résumé:');
    console.log(`   • Utilisateurs (members → users): ${results.members_to_users.migrated}/${results.members_to_users.total} documents`);
    console.log(`   • Membres club (inventory_members → members): ${results.inventory_members_to_members.migrated}/${results.inventory_members_to_members.total} documents`);

    if (results.members_to_users.errors.length > 0 || results.inventory_members_to_members.errors.length > 0) {
      console.log('\n⚠️  Erreurs rencontrées:');
      results.members_to_users.errors.forEach(e => console.log(`   - Utilisateurs batch ${e.batch}: ${e.error}`));
      results.inventory_members_to_members.errors.forEach(e => console.log(`   - Membres batch ${e.batch}: ${e.error}`));
    }

    console.log('\n⚠️  IMPORTANT: Prochaines étapes');
    console.log('   1. Vérifier manuellement les données dans Firestore Console');
    console.log('   2. Tester l\'application avec les nouvelles collections');
    console.log('   3. Une fois validé, supprimer les anciennes collections:');
    console.log(`      - clubs/${clubId}/members (${results.members_to_users.total} docs)`);
    console.log(`      - clubs/${clubId}/inventory_members (${results.inventory_members_to_members.total} docs)`);
    console.log('   4. Déployer les nouvelles Firestore Rules');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error);
    console.log('\n⚠️  La migration a échoué. Les collections sources n\'ont pas été modifiées.');
    console.log('   Vérifiez les logs ci-dessus pour plus de détails.');
    process.exit(1);
  }
}

// Exécution
main();

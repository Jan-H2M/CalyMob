/**
 * Script pour supprimer toutes les dépenses avec description "À compléter"
 *
 * Usage:
 *   node scripts/delete-incomplete-expenses.js
 *
 * ATTENTION: Ce script supprime définitivement les dépenses de Firestore!
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Configuration
const CLUB_ID = 'calypso';
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

// Initialiser Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialisé');
  } catch (error) {
    console.error('❌ Erreur initialisation Firebase Admin:', error.message);
    console.error('💡 Assurez-vous que le fichier serviceAccountKey.json existe');
    process.exit(1);
  }
}

const db = admin.firestore();

/**
 * Demander confirmation à l'utilisateur
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'o');
    });
  });
}

/**
 * Supprimer toutes les dépenses avec description "À compléter"
 */
async function deleteIncompleteDemandes() {
  try {
    console.log('\n🔍 Recherche des dépenses à supprimer...\n');

    // Rechercher toutes les dépenses avec description "À compléter"
    const demandesRef = db.collection('clubs').doc(CLUB_ID).collection('demandes_remboursement');
    const snapshot = await demandesRef.where('description', '==', 'À compléter').get();

    if (snapshot.empty) {
      console.log('✅ Aucune dépense "À compléter" trouvée.');
      return;
    }

    console.log(`📋 ${snapshot.size} dépense(s) trouvée(s):\n`);

    // Afficher les dépenses qui seront supprimées
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. ID: ${doc.id}`);
      console.log(`   Description: ${data.description || 'N/A'}`);
      console.log(`   Titre: ${data.titre || 'N/A'}`);
      console.log(`   Montant: ${data.montant || 0}€`);
      console.log(`   Date: ${data.date_depense?.toDate?.()?.toLocaleDateString('fr-BE') || 'N/A'}`);
      console.log(`   Demandeur: ${data.demandeur_nom || data.demandeur_id || 'N/A'}`);
      console.log(`   Statut: ${data.statut || 'N/A'}`);
      console.log('');
    });

    // Demander confirmation
    console.log(`\n⚠️  ATTENTION: Cette action va supprimer ${snapshot.size} dépense(s) de Firestore!`);
    console.log('⚠️  Cette action est IRRÉVERSIBLE!\n');

    const confirmed = await askConfirmation('Voulez-vous continuer? (oui/non): ');

    if (!confirmed) {
      console.log('❌ Suppression annulée.');
      return;
    }

    // Deuxième confirmation
    const doubleConfirmed = await askConfirmation('Êtes-vous vraiment sûr? Tapez "oui" pour confirmer: ');

    if (!doubleConfirmed) {
      console.log('❌ Suppression annulée.');
      return;
    }

    console.log('\n🗑️  Suppression en cours...\n');

    // Supprimer les dépenses par batch (max 500 à la fois)
    const batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;

      // Firestore batch a une limite de 500 opérations
      if (count % 500 === 0) {
        await batch.commit();
        console.log(`✅ ${count} dépenses supprimées...`);
      }
    }

    // Commit du dernier batch
    if (count % 500 !== 0) {
      await batch.commit();
    }

    console.log(`\n✅ ${count} dépense(s) supprimée(s) avec succès!`);

    // Statistiques finales
    console.log('\n📊 Résumé:');
    console.log(`   Total supprimé: ${count}`);
    console.log(`   Club: ${CLUB_ID}`);
    console.log(`   Critère: description === "À compléter"`);

  } catch (error) {
    console.error('\n❌ Erreur lors de la suppression:', error);
    throw error;
  }
}

// Exécution du script
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Script de suppression des dépenses "À compléter"            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    await deleteIncompleteDemandes();
    console.log('\n✅ Script terminé avec succès!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (error) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

// Lancer le script
main();

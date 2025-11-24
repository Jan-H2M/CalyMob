/**
 * Script pour supprimer toutes les dépenses avec description "À compléter"
 *
 * USAGE:
 * 1. Ouvrir l'application CalyCompta dans le navigateur (https://calycompta.vercel.app)
 * 2. Se connecter avec un compte admin
 * 3. Ouvrir la console du navigateur (F12 → Console)
 * 4. Copier-coller ce script entier dans la console
 * 5. Appuyer sur Entrée
 * 6. Confirmer avec "oui" quand demandé
 *
 * ATTENTION: Ce script supprime définitivement les dépenses!
 */

(async function deleteIncompleteDemandes() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Script de suppression des dépenses "À compléter"            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Importer Firebase (déjà chargé dans l'app)
  const { collection, query, where, getDocs, writeBatch, doc } = window.firebase || {};

  if (!window.db) {
    console.error('❌ Erreur: Firestore non trouvé. Assurez-vous d\'être sur l\'application CalyCompta.');
    return;
  }

  const db = window.db;
  const CLUB_ID = 'calypso';

  try {
    console.log('\n🔍 Recherche des dépenses à supprimer...\n');

    // Rechercher toutes les dépenses avec description "À compléter"
    const demandesRef = collection(db, 'clubs', CLUB_ID, 'demandes_remboursement');
    const q = query(demandesRef, where('description', '==', 'À compléter'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('✅ Aucune dépense "À compléter" trouvée.');
      return;
    }

    console.log(`📋 ${snapshot.size} dépense(s) trouvée(s):\n`);

    // Afficher les dépenses qui seront supprimées
    snapshot.docs.forEach((document, index) => {
      const data = document.data();
      console.log(`${index + 1}. ID: ${document.id}`);
      console.log(`   Description: ${data.description || 'N/A'}`);
      console.log(`   Titre: ${data.titre || 'N/A'}`);
      console.log(`   Montant: ${data.montant || 0}€`);

      // Gérer la date
      let dateStr = 'N/A';
      if (data.date_depense) {
        if (typeof data.date_depense.toDate === 'function') {
          dateStr = data.date_depense.toDate().toLocaleDateString('fr-BE');
        } else if (data.date_depense instanceof Date) {
          dateStr = data.date_depense.toLocaleDateString('fr-BE');
        }
      }
      console.log(`   Date: ${dateStr}`);
      console.log(`   Demandeur: ${data.demandeur_nom || data.demandeur_id || 'N/A'}`);
      console.log(`   Statut: ${data.statut || 'N/A'}`);
      console.log('');
    });

    // Demander confirmation
    console.log(`\n⚠️  ATTENTION: Cette action va supprimer ${snapshot.size} dépense(s) de Firestore!`);
    console.log('⚠️  Cette action est IRRÉVERSIBLE!\n');

    const confirmed = confirm(`Voulez-vous supprimer ${snapshot.size} dépense(s) avec description "À compléter"?\n\nCette action est IRRÉVERSIBLE!`);

    if (!confirmed) {
      console.log('❌ Suppression annulée.');
      return;
    }

    console.log('\n🗑️  Suppression en cours...\n');

    // Supprimer les dépenses
    const batchSize = 500;
    let count = 0;
    let currentBatch = writeBatch(db);
    let batchCount = 0;

    for (const document of snapshot.docs) {
      currentBatch.delete(document.ref);
      batchCount++;
      count++;

      // Si on atteint 500 opérations, commiter et créer nouveau batch
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        console.log(`✅ ${count} dépenses supprimées...`);
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }

    // Commiter le dernier batch s'il reste des opérations
    if (batchCount > 0) {
      await currentBatch.commit();
    }

    console.log(`\n✅ ${count} dépense(s) supprimée(s) avec succès!`);

    // Statistiques finales
    console.log('\n📊 Résumé:');
    console.log(`   Total supprimé: ${count}`);
    console.log(`   Club: ${CLUB_ID}`);
    console.log(`   Critère: description === "À compléter"`);

    console.log('\n✅ Script terminé avec succès!\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de la suppression:', error);

    if (error.code === 'permission-denied') {
      console.error('💡 Assurez-vous d\'être connecté avec un compte admin.');
    }
  }
})();

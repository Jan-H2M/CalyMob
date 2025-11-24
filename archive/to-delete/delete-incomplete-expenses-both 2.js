/**
 * Script pour supprimer toutes les dépenses incomplètes
 * Recherche BOTH "À compléter" ET "A compléter"
 *
 * USAGE - BROWSER CONSOLE:
 * 1. Ouvrir l'application CalyCompta dans le navigateur (https://calycompta.vercel.app)
 * 2. Se connecter avec un compte admin
 * 3. Ouvrir la console du navigateur (F12 → Console)
 * 4. Copier-coller ce script entier dans la console
 * 5. Appuyer sur Entrée
 * 6. Confirmer avec OK quand demandé
 *
 * ATTENTION: Ce script supprime définitivement les dépenses!
 */

(async function deleteIncompleteDemandes() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Script de suppression des dépenses incomplètes              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Vérifier que nous sommes dans l'application
  if (!window.db) {
    console.error('❌ Erreur: Firestore non trouvé.');
    console.error('💡 Assurez-vous d\'être sur l\'application CalyCompta (https://calycompta.vercel.app)');
    console.error('💡 et d\'être connecté avec un compte admin.');
    return;
  }

  const db = window.db;
  const CLUB_ID = 'calypso';

  // Import des fonctions Firestore depuis le contexte global
  const { collection, query, where, getDocs, writeBatch, doc } = await import('firebase/firestore');

  try {
    console.log('\n🔍 Recherche des dépenses incomplètes...\n');

    const demandesRef = collection(db, 'clubs', CLUB_ID, 'demandes_remboursement');

    // Rechercher les deux variantes
    const variants = ['À compléter', 'A compléter'];
    let allDocs = [];

    for (const variant of variants) {
      console.log(`   Recherche: description === "${variant}"...`);
      const q = query(demandesRef, where('description', '==', variant));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        console.log(`   ✓ ${snapshot.size} trouvée(s) avec "${variant}"`);
        allDocs = [...allDocs, ...snapshot.docs];
      }
    }

    if (allDocs.length === 0) {
      console.log('\n✅ Aucune dépense incomplète trouvée.');
      return;
    }

    console.log(`\n📋 ${allDocs.length} dépense(s) incomplète(s) trouvée(s):\n`);

    // Afficher les dépenses qui seront supprimées
    allDocs.forEach((document, index) => {
      const data = document.data();
      console.log(`${index + 1}. ID: ${document.id}`);
      console.log(`   Description: "${data.description || 'N/A'}"`);
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
    console.log(`\n⚠️  ATTENTION: Cette action va supprimer ${allDocs.length} dépense(s) de Firestore!`);
    console.log('⚠️  Cette action est IRRÉVERSIBLE!\n');

    const confirmed = confirm(
      `SUPPRESSION DE ${allDocs.length} DÉPENSE(S)\n\n` +
      `Cette action va supprimer définitivement toutes les dépenses avec:\n` +
      `- description === "À compléter"\n` +
      `- description === "A compléter"\n\n` +
      `Cette action est IRRÉVERSIBLE!\n\n` +
      `Voulez-vous continuer?`
    );

    if (!confirmed) {
      console.log('❌ Suppression annulée.');
      return;
    }

    console.log('\n🗑️  Suppression en cours...\n');

    // Supprimer les dépenses par batch
    const batchSize = 500;
    let count = 0;
    let currentBatch = writeBatch(db);
    let batchCount = 0;

    for (const document of allDocs) {
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
    console.log(`   Critères: description === "À compléter" OU "A compléter"`);

    console.log('\n✅ Script terminé avec succès!');
    console.log('\n💡 Rechargez la page pour voir les changements.\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de la suppression:', error);

    if (error.code === 'permission-denied') {
      console.error('💡 Assurez-vous d\'être connecté avec un compte admin.');
    } else if (error.message?.includes('import')) {
      console.error('💡 Essayez de recharger la page et réessayez.');
    }
  }
})();

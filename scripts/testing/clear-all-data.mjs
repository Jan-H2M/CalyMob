/**
 * Script pour supprimer toutes les transactions, événements et dépenses
 * Usage: node scripts/clear-all-data.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

// Configuration Firebase (à partir de votre projet)
const firebaseConfig = {
  apiKey: "AIzaSyDNLELnHWEe9d4pLWiJ3KGbz-YIKBX6xdo",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "673830731193",
  appId: "1:673830731193:web:2e2a74d1285eb9ecb6f2bb"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ID du club (à adapter selon votre configuration)
const CLUB_ID = 'calypso-dc'; // Changez ceci si nécessaire

async function deleteCollection(collectionName) {
  console.log(`\n🗑️  Suppression de la collection: ${collectionName}`);

  try {
    const collectionRef = collection(db, 'clubs', CLUB_ID, collectionName);
    const snapshot = await getDocs(collectionRef);

    console.log(`   Trouvé ${snapshot.size} documents à supprimer...`);

    let deleted = 0;
    const deletePromises = [];

    snapshot.forEach((document) => {
      const docRef = doc(db, 'clubs', CLUB_ID, collectionName, document.id);
      deletePromises.push(
        deleteDoc(docRef).then(() => {
          deleted++;
          if (deleted % 10 === 0) {
            console.log(`   Supprimé ${deleted}/${snapshot.size} documents...`);
          }
        })
      );
    });

    await Promise.all(deletePromises);

    console.log(`   ✅ ${deleted} documents supprimés avec succès`);
    return deleted;
  } catch (error) {
    console.error(`   ❌ Erreur lors de la suppression:`, error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Démarrage du nettoyage de la base de données...');
  console.log(`   Club ID: ${CLUB_ID}\n`);

  try {
    // Supprimer les transactions bancaires
    const transactionsDeleted = await deleteCollection('transactions_bancaires');

    // Supprimer les événements
    const eventsDeleted = await deleteCollection('evenements');

    // Supprimer les dépenses
    const demandsDeleted = await deleteCollection('demandes_remboursement');

    // Résumé
    console.log('\n' + '='.repeat(50));
    console.log('📊 RÉSUMÉ DU NETTOYAGE');
    console.log('='.repeat(50));
    console.log(`Transactions supprimées:  ${transactionsDeleted}`);
    console.log(`Événements supprimés:     ${eventsDeleted}`);
    console.log(`Dépenses supprimées:      ${demandsDeleted}`);
    console.log(`TOTAL:                    ${transactionsDeleted + eventsDeleted + demandsDeleted}`);
    console.log('='.repeat(50));
    console.log('\n✅ Nettoyage terminé avec succès!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Afficher un avertissement
console.log('⚠️  ATTENTION: Ce script va supprimer TOUTES les données suivantes:');
console.log('   - Toutes les transactions bancaires');
console.log('   - Tous les événements');
console.log('   - Toutes les demandes de remboursement');
console.log(`   - Pour le club: ${CLUB_ID}\n`);

// Exécution directe
main();

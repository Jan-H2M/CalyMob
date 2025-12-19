/**
 * Script pour supprimer toutes les dépenses avec description "À compléter"
 * Version: Firebase Client SDK (pas besoin de service account)
 *
 * Usage:
 *   node scripts/delete-incomplete-expenses-client.mjs
 *
 * ATTENTION: Ce script supprime définitivement les dépenses de Firestore!
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, writeBatch, deleteDoc, doc } from 'firebase/firestore';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lire et parser le fichier .env manuellement
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};

  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return env;
}

const env = loadEnv();

// Configuration Firebase depuis .env
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const CLUB_ID = env.VITE_CLUB_ID || 'calypso';

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log('✅ Firebase initialisé avec projet:', firebaseConfig.projectId);

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

      // Gérer la date (peut être Timestamp ou Date)
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

    // Supprimer les dépenses
    // Note: Client SDK n'a pas de limite stricte de 500 comme Admin SDK batch
    // Mais on groupe quand même par batch de 500 pour la fiabilité
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
    console.log(`   Projet Firebase: ${firebaseConfig.projectId}`);
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

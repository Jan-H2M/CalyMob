/**
 * Script à exécuter dans la console du navigateur (F12)
 * pour identifier les transactions en double dans Firestore
 *
 * INSTRUCTIONS:
 * 1. Ouvrez le dashboard dans votre navigateur
 * 2. Ouvrez la console (F12)
 * 3. Copiez-collez ce script complet
 * 4. Appuyez sur Entrée
 */

(async function findDuplicatesInBrowser() {
  console.log('🔍 === RECHERCHE DE TRANSACTIONS EN DOUBLE ===\n');

  // Récupérer le clubId depuis l'URL ou le contexte
  const clubId = 'uvQWCNTmCGg7sZC5UvOa'; // Ajustez si nécessaire

  // Importer Firebase
  const { collection, query, where, getDocs, Timestamp } = await import('/src/lib/firebase.js').then(m => ({
    collection: window.firebase?.firestore?.collection,
    query: window.firebase?.firestore?.query,
    where: window.firebase?.firestore?.where,
    getDocs: window.firebase?.firestore?.getDocs,
    Timestamp: window.firebase?.firestore?.Timestamp,
  })).catch(() => {
    // Fallback: utiliser les imports dynamiques
    return import('firebase/firestore');
  });

  const { db } = await import('/src/lib/firebase.js');

  const startDate = new Date('2025-01-01');
  const endDate = new Date('2025-12-31');

  console.log('📅 Période: 01/01/2025 → 31/12/2025');
  console.log('🏦 Compte: BE26 2100 1607 0629\n');

  // Charger toutes les transactions
  const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
  const q = query(
    txRef,
    where('date_execution', '>=', Timestamp.fromDate(startDate)),
    where('date_execution', '<=', Timestamp.fromDate(endDate))
  );

  console.log('⏳ Chargement des transactions...');
  const snapshot = await getDocs(q);
  console.log(`✅ ${snapshot.size} transactions chargées\n`);

  const normalizedCurrentAccount = 'BE26210016070629';

  // Analyser les transactions
  const refMap = new Map(); // Grouper par référence bancaire
  const transactionsParents = [];
  const transactionsAutresComptes = [];
  const transactionsSansRef = [];
  let compteCourantCount = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';
    const reference = data.reference_banque?.replace(/\D/g, '') || null;
    const montant = data.montant || 0;
    const date = data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A';

    // Exclure les parents
    if (data.is_parent) {
      transactionsParents.push({
        id: doc.id,
        date,
        montant,
        contrepartie: data.nom_contrepartie,
        reference,
        child_count: data.child_count || 0
      });
      return;
    }

    // Filtrer par compte
    if (compte !== normalizedCurrentAccount) {
      transactionsAutresComptes.push({
        id: doc.id,
        compte: data.numero_compte,
        montant,
        reference
      });
      return;
    }

    compteCourantCount++;

    // Grouper par référence
    if (reference) {
      if (!refMap.has(reference)) {
        refMap.set(reference, []);
      }
      refMap.get(reference).push({
        id: doc.id,
        date,
        montant,
        contrepartie: data.nom_contrepartie,
        reference,
        compte: data.numero_compte
      });
    } else {
      transactionsSansRef.push({
        id: doc.id,
        date,
        montant,
        contrepartie: data.nom_contrepartie
      });
    }
  });

  // Afficher les statistiques
  console.log('=== STATISTIQUES ===\n');
  console.log(`📊 Total Firestore: ${snapshot.size}`);
  console.log(`📊 Transactions parents (ventilées): ${transactionsParents.length}`);
  console.log(`📊 Autres comptes (épargne, etc.): ${transactionsAutresComptes.length}`);
  console.log(`📊 Compte courant (non-parents): ${compteCourantCount}`);
  console.log(`📊 Sans référence bancaire: ${transactionsSansRef.length}\n`);

  // Trouver les doublons
  const doublons = [];
  refMap.forEach((txs, ref) => {
    if (txs.length > 1) {
      doublons.push({ reference: ref, transactions: txs });
    }
  });

  if (doublons.length > 0) {
    console.log(`⚠️  DOUBLONS TROUVÉS: ${doublons.length} références en double\n`);
    console.log('Détails des doublons:');
    console.log('-------------------\n');

    doublons.forEach(({ reference, transactions }) => {
      console.log(`📋 Référence: ${reference} (${transactions.length} fois)`);
      transactions.forEach((tx, i) => {
        console.log(`   ${i + 1}. ${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie}`);
        console.log(`      ID: ${tx.id}`);
      });
      console.log();
    });

    // Calculer l'impact
    let totalDoublons = 0;
    let impactRevenus = 0;
    let impactDepenses = 0;

    doublons.forEach(({ transactions }) => {
      // Garder le premier, compter les autres comme doublons
      for (let i = 1; i < transactions.length; i++) {
        totalDoublons++;
        const montant = transactions[i].montant;
        if (montant > 0) {
          impactRevenus += montant;
        } else {
          impactDepenses += Math.abs(montant);
        }
      }
    });

    console.log('=== IMPACT DES DOUBLONS ===\n');
    console.log(`Nombre de transactions à supprimer: ${totalDoublons}`);
    console.log(`Impact revenus: +${impactRevenus.toFixed(2)} € (à retirer)`);
    console.log(`Impact dépenses: +${impactDepenses.toFixed(2)} € (à ajouter)`);
    console.log(`Impact total: ${(impactRevenus - impactDepenses).toFixed(2)} €`);
    console.log();

    console.log('=== COMPARAISON AVEC CSV ===\n');
    console.log(`CSV: 955 transactions`);
    console.log(`Firestore (compte courant): ${compteCourantCount} transactions`);
    console.log(`Écart: ${compteCourantCount - 955} transactions`);
    console.log();

    console.log('CSV: Revenus 57291.66 € | Dépenses 68559.97 €');
    console.log(`Dashboard: Revenus 57998.66 € | Dépenses 66993.25 €`);
    console.log(`Écart attendu après nettoyage: ${impactRevenus.toFixed(2)} € revenus | ${impactDepenses.toFixed(2)} € dépenses`);
    console.log();

    // Générer les IDs à supprimer
    const idsToDelete = [];
    doublons.forEach(({ transactions }) => {
      // Garder le premier, supprimer les autres
      for (let i = 1; i < transactions.length; i++) {
        idsToDelete.push(transactions[i].id);
      }
    });

    console.log('=== IDS À SUPPRIMER ===\n');
    console.log(JSON.stringify(idsToDelete, null, 2));
    console.log();

    // Copier dans le presse-papier
    const idsText = idsToDelete.join('\n');
    navigator.clipboard.writeText(idsText).then(() => {
      console.log('✅ Liste des IDs copiée dans le presse-papier!');
    });

  } else {
    console.log('✅ Aucun doublon trouvé basé sur la référence bancaire');
  }

  // Afficher les transactions parents si présentes
  if (transactionsParents.length > 0) {
    console.log('\n=== TRANSACTIONS PARENTS (ventilées) ===\n');
    transactionsParents.slice(0, 10).forEach(tx => {
      console.log(`${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie}`);
      console.log(`  ID: ${tx.id} | Enfants: ${tx.child_count}`);
    });
    if (transactionsParents.length > 10) {
      console.log(`\n... et ${transactionsParents.length - 10} autres`);
    }
  }

  console.log('\n✅ Analyse terminée');
})();

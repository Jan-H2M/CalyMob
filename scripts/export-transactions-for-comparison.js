/**
 * Script à exécuter dans la Console Firebase (Firestore > Query)
 * pour exporter toutes les transactions de 2025 et les comparer au CSV
 *
 * INSTRUCTIONS:
 * 1. Allez dans Firebase Console > Firestore Database
 * 2. Ouvrez la collection: clubs/uvQWCNTmCGg7sZC5UvOa/transactions_bancaires
 * 3. Filtrez avec:
 *    - date_execution >= 2025-01-01
 *    - date_execution <= 2025-12-31
 * 4. Exportez en JSON
 */

// Ou utilisez ce code dans la console du navigateur (F12) sur le dashboard:

async function exportTransactionsForDebug() {
  const { collection, query, where, getDocs, Timestamp } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const clubId = 'uvQWCNTmCGg7sZC5UvOa'; // Remplacer si nécessaire
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2025-12-31');

  const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
  const q = query(
    txRef,
    where('date_execution', '>=', Timestamp.fromDate(startDate)),
    where('date_execution', '<=', Timestamp.fromDate(endDate))
  );

  const snapshot = await getDocs(q);

  console.log(`Total transactions: ${snapshot.size}`);

  // Créer un CSV des transactions
  const csvLines = ['Date,Montant,Contrepartie,Compte,Référence,is_parent,parent_id'];

  const transactions = [];
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A';
    const montant = data.montant || 0;
    const contrepartie = (data.nom_contrepartie || 'N/A').replace(/,/g, ' ');
    const compte = data.numero_compte || 'N/A';
    const ref = data.reference_banque || 'N/A';
    const is_parent = data.is_parent ? 'OUI' : 'NON';
    const parent_id = data.parent_transaction_id || '';

    csvLines.push(`${date},${montant},${contrepartie},${compte},${ref},${is_parent},${parent_id}`);

    transactions.push({
      id: doc.id,
      date,
      montant,
      contrepartie,
      compte: data.numero_compte,
      ref,
      is_parent: data.is_parent || false,
      parent_id: data.parent_transaction_id || null
    });
  });

  // Afficher le CSV
  const csv = csvLines.join('\n');
  console.log('\n=== CSV EXPORT ===\n');
  console.log(csv);

  // Trouver les doublons basés sur référence bancaire
  const refMap = {};
  transactions.forEach(tx => {
    if (!refMap[tx.ref]) {
      refMap[tx.ref] = [];
    }
    refMap[tx.ref].push(tx);
  });

  console.log('\n=== DOUBLONS PAR RÉFÉRENCE BANCAIRE ===\n');
  let duplicateCount = 0;
  Object.entries(refMap).forEach(([ref, txs]) => {
    if (txs.length > 1 && ref !== 'N/A') {
      duplicateCount++;
      console.log(`Référence: ${ref} - ${txs.length} transactions`);
      txs.forEach(tx => {
        console.log(`  ${tx.date} | ${tx.montant} € | ${tx.contrepartie} | Parent: ${tx.is_parent}`);
      });
    }
  });

  console.log(`\nTotal groupes de doublons: ${duplicateCount}`);

  // Télécharger le CSV
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'firestore-transactions-2025.csv';
  a.click();

  console.log('\n✅ CSV téléchargé!');
}

// Exécuter la fonction
exportTransactionsForDebug();

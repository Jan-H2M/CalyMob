/**
 * Afficher les enfants orphelins supprimés avec leurs parents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = JSON.parse(readFileSync(join(__dirname, 'fix-log-2025-11-16T19-53-05.json'), 'utf8'));

console.log('=== 20 ENFANTS ORPHELINS SUPPRIMÉS ===\n');
console.log('Total suppressions:', log.deletions.length);
console.log('');

// Grouper par parent
const byParent = {};
log.deletions.forEach(del => {
  const backup = log.backup.find(b => b.id === del.id);
  if (backup && backup.data.parent_transaction_id) {
    const parentId = backup.data.parent_transaction_id;
    if (!byParent[parentId]) {
      byParent[parentId] = {
        parentId,
        children: []
      };
    }
    byParent[parentId].children.push({
      sequence: backup.data.numero_sequence,
      montant: backup.data.montant,
      description: backup.data.communication || backup.data.contrepartie_nom || 'N/A',
      date: backup.data.date_execution
    });
  }
});

// Afficher par parent
console.log('GROUPÉ PAR PARENT:\n');
Object.values(byParent).forEach((parent, i) => {
  console.log(`${i + 1}. PARENT ID: ${parent.parentId}`);
  console.log(`   Nombre d'enfants: ${parent.children.length}`);

  let total = 0;
  parent.children.forEach(child => {
    console.log(`   - ${child.sequence}: ${child.montant} € - ${child.description}`);
    total += child.montant;
  });
  console.log(`   Total: ${total.toFixed(2)} €`);
  console.log('');
});

console.log('=== LISTE COMPLÈTE ===\n');
log.deletions.forEach((del, i) => {
  const backup = log.backup.find(b => b.id === del.id);
  console.log(`${i + 1}. ${del.sequence}`);
  console.log(`   Montant: ${del.montant} €`);
  console.log(`   Type: ${del.type}`);
  console.log(`   Parent ID: ${backup?.data.parent_transaction_id || 'N/A'}`);
  console.log(`   Description: ${backup?.data.communication || backup?.data.contrepartie_nom || 'N/A'}`);
  console.log('');
});

console.log('TOTAL GÉNÉRAL:', log.deletions.reduce((sum, d) => sum + d.montant, 0).toFixed(2), '€');

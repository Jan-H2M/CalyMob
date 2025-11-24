// TEMPORARY MIGRATION UTILITY
// Migrate fiscal_year_id for operations and demands
// This file can be deleted after migration is complete

import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { FiscalYear } from '@/types';

export async function migrateOperationsAndDemands(clubId: string): Promise<{
  operations: { updated: number; skipped: number; errors: number };
  demands: { updated: number; skipped: number; errors: number };
}> {
  console.log('🚀 Starting operations & demands migration...');

  // Load fiscal years
  const fyRef = collection(db, 'clubs', clubId, 'fiscal_years');
  const fySnapshot = await getDocs(query(fyRef, orderBy('year', 'desc')));
  const fiscalYears = fySnapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  })) as FiscalYear[];

  console.log(`📅 Found ${fiscalYears.length} fiscal years:`, fiscalYears.map(fy => `${fy.year} (${fy.id})`).join(', '));

  if (fiscalYears.length === 0) {
    throw new Error('No fiscal years found. Create fiscal years first.');
  }

  const findFiscalYearForDate = (date: Date): FiscalYear | null => {
    const year = date.getFullYear();
    return fiscalYears.find(fy => fy.year === year) || null;
  };

  // Migrate operations
  console.log('\n📊 Migrating OPERATIONS...');
  const operationsRef = collection(db, 'clubs', clubId, 'operations');
  const opsSnapshot = await getDocs(operationsRef);

  let opsUpdated = 0;
  let opsSkipped = 0;
  let opsErrors = 0;

  for (const opDoc of opsSnapshot.docs) {
    const data = opDoc.data();

    if (data.fiscal_year_id) {
      opsSkipped++;
      continue;
    }

    // Use date_debut for operations
    const opDate = data.date_debut?.toDate?.() || new Date(data.date_debut);
    const fiscalYear = findFiscalYearForDate(opDate);

    if (!fiscalYear) {
      console.warn(`⚠️ No fiscal year for operation ${data.nom || opDoc.id} (date: ${opDate.toLocaleDateString()})`);
      opsErrors++;
      continue;
    }

    try {
      await updateDoc(doc(db, 'clubs', clubId, 'operations', opDoc.id), {
        fiscal_year_id: fiscalYear.id
      });
      opsUpdated++;

      if (opsUpdated % 10 === 0) {
        console.log(`✅ Operations: ${opsUpdated} updated, ${opsSkipped} skipped, ${opsErrors} errors`);
      }
    } catch (err) {
      console.error(`❌ Error updating operation ${opDoc.id}:`, err);
      opsErrors++;
    }
  }

  console.log(`\n✅ Operations migration complete: ${opsUpdated} updated, ${opsSkipped} skipped, ${opsErrors} errors`);

  // Migrate demands
  console.log('\n📊 Migrating DEMANDS...');
  const demandsRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
  const demandsSnapshot = await getDocs(demandsRef);

  let demandsUpdated = 0;
  let demandsSkipped = 0;
  let demandsErrors = 0;

  for (const demandDoc of demandsSnapshot.docs) {
    const data = demandDoc.data();

    if (data.fiscal_year_id) {
      demandsSkipped++;
      continue;
    }

    // Use date_depense for demands
    const demandDate = data.date_depense?.toDate?.() || new Date(data.date_depense);
    const fiscalYear = findFiscalYearForDate(demandDate);

    if (!fiscalYear) {
      console.warn(`⚠️ No fiscal year for demand ${data.description || demandDoc.id} (date: ${demandDate.toLocaleDateString()})`);
      demandsErrors++;
      continue;
    }

    try {
      await updateDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', demandDoc.id), {
        fiscal_year_id: fiscalYear.id
      });
      demandsUpdated++;

      if (demandsUpdated % 10 === 0) {
        console.log(`✅ Demands: ${demandsUpdated} updated, ${demandsSkipped} skipped, ${demandsErrors} errors`);
      }
    } catch (err) {
      console.error(`❌ Error updating demand ${demandDoc.id}:`, err);
      demandsErrors++;
    }
  }

  console.log(`\n✅ Demands migration complete: ${demandsUpdated} updated, ${demandsSkipped} skipped, ${demandsErrors} errors`);

  console.log('\n🎉 ALL MIGRATIONS COMPLETE!');

  return {
    operations: { updated: opsUpdated, skipped: opsSkipped, errors: opsErrors },
    demands: { updated: demandsUpdated, skipped: demandsSkipped, errors: demandsErrors }
  };
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).migrateOperationsAndDemands = migrateOperationsAndDemands;
}

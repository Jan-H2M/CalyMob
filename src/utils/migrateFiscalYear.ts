import { logger } from '@/utils/logger';
// TEMPORARY MIGRATION UTILITY
// Add fiscal_year_id to all existing transactions
// This file can be deleted after migration is complete

import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { FiscalYear } from '@/types';

export async function migrateFiscalYearIds(clubId: string): Promise<{
  updated: number;
  skipped: number;
  errors: number;
}> {
  logger.debug('🚀 Starting fiscal_year_id migration...');

  // Load fiscal years
  const fyRef = collection(db, 'clubs', clubId, 'fiscal_years');
  const fySnapshot = await getDocs(query(fyRef, orderBy('year', 'desc')));
  const fiscalYears = fySnapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  })) as FiscalYear[];

  logger.debug(`📅 Found ${fiscalYears.length} fiscal years:`, fiscalYears.map(fy => `${fy.year} (${fy.id})`).join(', '));

  if (fiscalYears.length === 0) {
    throw new Error('No fiscal years found. Create fiscal years first.');
  }

  // Load transactions
  const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
  const txSnapshot = await getDocs(txRef);

  logger.debug(`📊 Found ${txSnapshot.size} transactions to process`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const txDoc of txSnapshot.docs) {
    const data = txDoc.data();

    // Skip if already has fiscal_year_id
    if (data.fiscal_year_id) {
      skipped++;
      continue;
    }

    // Get date
    const txDate = data.date_execution?.toDate?.() || new Date(data.date_execution);
    const year = txDate.getFullYear();

    // Find matching fiscal year
    const fiscalYear = fiscalYears.find(fy => fy.year === year);

    if (!fiscalYear) {
      logger.warn(`⚠️ No fiscal year found for transaction ${data.numero_sequence} (date: ${txDate.toLocaleDateString()}, year: ${year})`);
      errors++;
      continue;
    }

    // Update transaction
    try {
      await updateDoc(doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id), {
        fiscal_year_id: fiscalYear.id
      });
      updated++;

      if (updated % 50 === 0) {
        logger.debug(`✅ Progress: ${updated} updated, ${skipped} skipped, ${errors} errors`);
      }
    } catch (err) {
      logger.error(`❌ Error updating ${txDoc.id}:`, err);
      errors++;
    }
  }

  logger.debug('\n🎉 MIGRATION COMPLETE!');
  logger.debug(`✅ Updated: ${updated}`);
  logger.debug(`⏭️ Skipped (already had fiscal_year_id): ${skipped}`);
  logger.debug(`❌ Errors: ${errors}`);

  return { updated, skipped, errors };
}

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).migrateFiscalYearIds = migrateFiscalYearIds;
}

import { logger } from '@/utils/logger';
/**
 * Script om alle piscine sessie datums te fixen
 *
 * Probleem: Datums waren opgeslagen om middernacht lokale tijd,
 * waardoor ze bij UTC conversie 1 dag terugspringen.
 *
 * Oplossing: Zet de tijd van alle sessies op 12:00 (middag)
 * zodat timezone conversie geen dag-verschuiving veroorzaakt.
 *
 * Gebruik:
 * 1. Importeer en roep fixAllPiscineSessions(clubId) aan vanuit de browser console
 * 2. Of voeg een tijdelijke knop toe in de admin interface
 */

import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  Timestamp
} from 'firebase/firestore';

interface FixResult {
  total: number;
  fixed: number;
  skipped: number;
  errors: string[];
}

/**
 * Fix alle piscine sessie datums voor een club
 */
export async function fixAllPiscineSessions(clubId: string): Promise<FixResult> {
  const result: FixResult = {
    total: 0,
    fixed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const sessionsRef = collection(db, 'clubs', clubId, 'piscine_sessions');
    const snapshot = await getDocs(sessionsRef);

    result.total = snapshot.docs.length;
    logger.debug(`🔍 Gevonden: ${result.total} sessies`);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const currentTimestamp = data.date as Timestamp;

      if (!currentTimestamp) {
        result.skipped++;
        logger.debug(`⏭️ Sessie ${docSnap.id}: geen datum gevonden, overgeslagen`);
        continue;
      }

      const currentDate = currentTimestamp.toDate();
      const currentHours = currentDate.getHours();

      // Check of al gefixed (uur is 12)
      if (currentHours === 12) {
        result.skipped++;
        logger.debug(`✅ Sessie ${docSnap.id}: al correct (${currentDate.toISOString()})`);
        continue;
      }

      // Maak nieuwe datum met tijd 12:00
      const fixedDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        12, 0, 0, 0
      );

      try {
        await updateDoc(doc(sessionsRef, docSnap.id), {
          date: Timestamp.fromDate(fixedDate),
          updated_at: Timestamp.fromDate(new Date())
        });

        result.fixed++;
        logger.debug(`🔧 Sessie ${docSnap.id}: gefixed van ${currentDate.toISOString()} naar ${fixedDate.toISOString()}`);
      } catch (updateError) {
        const errorMsg = `Fout bij updaten sessie ${docSnap.id}: ${updateError}`;
        result.errors.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    logger.debug('\n📊 Resultaat:');
    logger.debug(`   Totaal: ${result.total}`);
    logger.debug(`   Gefixed: ${result.fixed}`);
    logger.debug(`   Overgeslagen: ${result.skipped}`);
    logger.debug(`   Fouten: ${result.errors.length}`);

  } catch (error) {
    const errorMsg = `Fout bij ophalen sessies: ${error}`;
    result.errors.push(errorMsg);
    logger.error(`❌ ${errorMsg}`);
  }

  return result;
}

/**
 * Preview welke sessies gefixed zouden worden (zonder wijzigingen)
 */
export async function previewPiscineSessionFixes(clubId: string): Promise<void> {
  logger.debug('🔍 Preview modus - geen wijzigingen worden gemaakt\n');

  const sessionsRef = collection(db, 'clubs', clubId, 'piscine_sessions');
  const snapshot = await getDocs(sessionsRef);

  let needsFix = 0;
  let alreadyCorrect = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const timestamp = data.date as Timestamp;

    if (!timestamp) {
      logger.debug(`⚠️ Sessie ${docSnap.id}: geen datum`);
      continue;
    }

    const date = timestamp.toDate();
    const hours = date.getHours();

    if (hours === 12) {
      alreadyCorrect++;
      logger.debug(`✅ ${formatDateNL(date)} - OK`);
    } else {
      needsFix++;
      const fixedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
      logger.debug(`🔧 ${formatDateNL(date)} → ${formatDateNL(fixedDate)} (uur ${hours} → 12)`);
    }
  }

  logger.debug('\n📊 Samenvatting:');
  logger.debug(`   Te fixen: ${needsFix}`);
  logger.debug(`   Al correct: ${alreadyCorrect}`);
}

function formatDateNL(date: Date): string {
  const weekdays = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  return `${weekdays[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Voor gebruik in browser console:
// import { fixAllPiscineSessions, previewPiscineSessionFixes } from '@/scripts/fixPiscineSessionDates';
// await previewPiscineSessionFixes('jouw-club-id');  // Preview eerst
// await fixAllPiscineSessions('jouw-club-id');       // Dan uitvoeren

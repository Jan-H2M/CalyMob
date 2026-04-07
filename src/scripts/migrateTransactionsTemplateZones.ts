import { logger } from '@/utils/logger';
/**
 * Migration Script: Add Zone Markers to Transactions Templates
 *
 * This script updates existing 'transactions' email templates in Firestore
 * to add editable zone markers for the hybrid template editing feature.
 *
 * Zone markers added:
 * - <!--ZONE:intro:Introduction--> around the greeting and intro paragraph
 * - <!--ZONE:request:Votre demande--> around the request section with bullet points
 *
 * Usage:
 * 1. Import and call migrateTransactionsTemplates(clubId) from browser console
 * 2. Or add a button in admin settings to trigger this migration
 */

import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface MigrationResult {
  success: boolean;
  templatesFound: number;
  templatesUpdated: number;
  templatesSkipped: number;
  errors: string[];
}

/**
 * Check if template already has zone markers
 */
function hasZoneMarkers(htmlContent: string): boolean {
  return htmlContent.includes('<!--ZONE:') && htmlContent.includes('<!--/ZONE:');
}

/**
 * Add zone markers to transactions template HTML
 * This function identifies the intro and request sections and wraps them with zone markers
 */
function addZoneMarkersToTemplate(htmlContent: string): string {
  let updated = htmlContent;

  // Pattern 1: Wrap intro section (greeting + first paragraph about transaction)
  // Look for: <p>Bonjour {{recipientName}},</p> followed by intro paragraph
  const introPattern = /(<p[^>]*>Bonjour\s+\{\{recipientName\}\},<\/p>\s*<p[^>]*>Nous avons identifié une transaction[^<]*<\/p>)/gi;

  if (introPattern.test(updated)) {
    updated = updated.replace(introPattern, '<!--ZONE:intro:Introduction-->\n            $1\n            <!--/ZONE:intro-->');
  } else {
    // Alternative pattern: just the greeting
    const greetingPattern = /(<p[^>]*>Bonjour\s+\{\{recipientName\}\},<\/p>)/gi;
    if (greetingPattern.test(updated)) {
      // Find the next paragraph too
      const greetingWithNextPara = /(<p[^>]*>Bonjour\s+\{\{recipientName\}\},<\/p>\s*<p[^>]*>[^<]+<\/p>)/gi;
      if (greetingWithNextPara.test(updated)) {
        updated = updated.replace(greetingWithNextPara, '<!--ZONE:intro:Introduction-->\n            $1\n            <!--/ZONE:intro-->');
      }
    }
  }

  // Pattern 2: Wrap request section (from "Afin de pouvoir" to end of bullet list + italic note)
  // This section typically includes:
  // - "Afin de pouvoir enregistrer..." paragraph
  // - "Nous recherchons les informations suivantes" paragraph
  // - <ul> with <li> items
  // - Italic note about non-response
  const requestPattern = /(<p[^>]*>Afin de pouvoir enregistrer[^<]*<\/p>\s*<p[^>]*><strong>Nous recherchons[^<]*<\/strong><\/p>\s*<ul[^>]*>[\s\S]*?<\/ul>\s*<p[^>]*>[^<]*non affectée[^<]*<\/p>)/gi;

  if (requestPattern.test(updated)) {
    updated = updated.replace(requestPattern, '<!--ZONE:request:Votre demande-->\n            $1\n            <!--/ZONE:request-->');
  } else {
    // Try a simpler pattern - just the "Afin de pouvoir" to end of ul
    const simpleRequestPattern = /(<p[^>]*>Afin de pouvoir[^<]*<\/p>[\s\S]*?<\/ul>[\s\S]*?<p[^>]*style="[^"]*font-style:\s*italic[^"]*"[^>]*>[^<]*<\/p>)/gi;
    if (simpleRequestPattern.test(updated)) {
      updated = updated.replace(simpleRequestPattern, '<!--ZONE:request:Votre demande-->\n            $1\n            <!--/ZONE:request-->');
    }
  }

  return updated;
}

/**
 * Migrate all transactions templates for a club
 */
export async function migrateTransactionsTemplates(clubId: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    templatesFound: 0,
    templatesUpdated: 0,
    templatesSkipped: 0,
    errors: [],
  };

  try {
    logger.debug(`🔄 [Migration] Starting zone markers migration for club: ${clubId}`);

    // Get all transactions templates
    const templatesRef = collection(db, 'clubs', clubId, 'email_templates');
    const q = query(templatesRef, where('emailType', '==', 'transactions'));
    const snapshot = await getDocs(q);

    result.templatesFound = snapshot.docs.length;
    logger.debug(`📋 [Migration] Found ${result.templatesFound} transactions template(s)`);

    if (result.templatesFound === 0) {
      logger.debug('ℹ️ [Migration] No transactions templates found to migrate');
      result.success = true;
      return result;
    }

    for (const templateDoc of snapshot.docs) {
      const templateId = templateDoc.id;
      const data = templateDoc.data();
      const htmlContent = data.htmlContent as string;

      logger.debug(`📧 [Migration] Processing template: ${data.name} (${templateId})`);

      // Check if already has zone markers
      if (hasZoneMarkers(htmlContent)) {
        logger.debug(`⏭️ [Migration] Template already has zone markers, skipping: ${data.name}`);
        result.templatesSkipped++;
        continue;
      }

      // Add zone markers
      const updatedHtml = addZoneMarkersToTemplate(htmlContent);

      // Check if any changes were made
      if (updatedHtml === htmlContent) {
        logger.debug(`⚠️ [Migration] Could not find sections to mark in template: ${data.name}`);
        result.errors.push(`Template "${data.name}" - could not identify sections to mark`);
        result.templatesSkipped++;
        continue;
      }

      // Update the template in Firestore
      try {
        const templateRef = doc(db, 'clubs', clubId, 'email_templates', templateId);
        await updateDoc(templateRef, {
          htmlContent: updatedHtml,
          updatedAt: new Date(),
        });
        logger.debug(`✅ [Migration] Updated template: ${data.name}`);
        result.templatesUpdated++;
      } catch (updateError) {
        const errorMsg = `Failed to update template "${data.name}": ${updateError}`;
        logger.error(`❌ [Migration] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    result.success = result.errors.length === 0;
    logger.debug(`🏁 [Migration] Complete. Updated: ${result.templatesUpdated}, Skipped: ${result.templatesSkipped}, Errors: ${result.errors.length}`);

  } catch (error) {
    const errorMsg = `Migration failed: ${error}`;
    logger.error(`❌ [Migration] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Preview what the migration would do without making changes
 */
export async function previewMigration(clubId: string): Promise<void> {
  logger.debug(`🔍 [Migration Preview] Checking templates for club: ${clubId}`);

  try {
    const templatesRef = collection(db, 'clubs', clubId, 'email_templates');
    const q = query(templatesRef, where('emailType', '==', 'transactions'));
    const snapshot = await getDocs(q);

    logger.debug(`📋 Found ${snapshot.docs.length} transactions template(s)`);

    for (const templateDoc of snapshot.docs) {
      const data = templateDoc.data();
      const htmlContent = data.htmlContent as string;

      logger.debug(`\n📧 Template: ${data.name}`);
      logger.debug(`   Has zone markers: ${hasZoneMarkers(htmlContent) ? 'Yes ✓' : 'No'}`);

      if (!hasZoneMarkers(htmlContent)) {
        const updated = addZoneMarkersToTemplate(htmlContent);
        const introZone = updated.includes('<!--ZONE:intro:');
        const requestZone = updated.includes('<!--ZONE:request:');

        logger.debug(`   Would add intro zone: ${introZone ? 'Yes ✓' : 'No ✗'}`);
        logger.debug(`   Would add request zone: ${requestZone ? 'Yes ✓' : 'No ✗'}`);
      }
    }
  } catch (error) {
    logger.error('Preview failed:', error);
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).migrateTransactionsTemplates = migrateTransactionsTemplates;
  (window as unknown as Record<string, unknown>).previewMigration = previewMigration;
}

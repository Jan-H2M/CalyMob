/**
 * AccountCodeService - Service centralise pour les codes comptables
 *
 * Ce service gere tous les codes comptables depuis Firebase comme unique source de verite.
 * Il remplace l'ancien systeme dual (codes statiques + personnalises).
 *
 * Architecture:
 * - Firebase: clubs/{clubId}/settings/accounting.accountCodes
 * - Cache: Map en memoire pour acces rapide
 * - Lazy loading: charge au premier acces ou au login
 *
 * Usage:
 *   // Au demarrage (dans AuthContext apres login)
 *   await AccountCodeService.loadCodes(clubId);
 *
 *   // Pour obtenir un code
 *   const code = AccountCodeService.getByCode('730-00-712');
 *
 *   // Pour lister les codes actifs
 *   const activeCodes = AccountCodeService.getActiveCodes();
 *
 * IMPORTANT - Restrictions Firebase:
 *   Les codes ne peuvent pas contenir: . $ [ ] # /
 *   Ces caracteres sont interdits dans les noms de champs Firebase.
 */

import { logger } from '@/utils/logger';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AccountCode } from '@/types';
import { calypsoAccountCodes } from '@/config/calypso-accounts';

/**
 * Extended AccountCode with migration fields
 */
export interface AccountCodeExtended extends AccountCode {
  isActive: boolean;
  isDefault: boolean;
  customized?: boolean;
  createdAt?: Date;
  createdBy?: string;
  updatedAt?: Date;
}

/**
 * Structure stored in Firebase
 */
interface AccountingSettings {
  accountCodes: Record<string, AccountCodeExtended>;
  version: number;
  migratedAt?: Date;
  // Legacy fields (kept for backward compatibility)
  customAccountCodes?: Record<string, Partial<AccountCode>>;
  selectedAccountCodes?: string[];
}

/**
 * Characters not allowed in Firebase field names
 * These would cause errors when using dot notation in updateDoc
 */
const INVALID_CODE_CHARS = /[.$[\]#/]/;

/**
 * Validate that an account code doesn't contain invalid Firebase characters
 */
function validateCodeFormat(code: string): void {
  if (!code || code.trim() === '') {
    throw new Error('Le code comptable ne peut pas être vide');
  }

  if (INVALID_CODE_CHARS.test(code)) {
    throw new Error(
      `Le code comptable "${code}" contient des caractères invalides. ` +
      `Les caractères suivants ne sont pas autorisés: . $ [ ] # /`
    );
  }
}

/**
 * Service centralise pour la gestion des codes comptables
 */
export class AccountCodeService {
  // Cache en memoire
  private static cache: Map<string, AccountCodeExtended> = new Map();
  private static initialized = false;
  private static currentClubId: string | null = null;

  /**
   * Charge tous les codes comptables depuis Firebase
   * A appeler au demarrage de l'application apres le login
   */
  static async loadCodes(clubId: string): Promise<void> {
    try {
      logger.debug('[AccountCodeService] Loading codes for club:', clubId);

      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as AccountingSettings;

        // Check if migrated (version 2+)
        if (data.accountCodes && data.version >= 2) {
          // New structure - use accountCodes directly
          this.cache.clear();
          for (const [code, codeData] of Object.entries(data.accountCodes)) {
            this.cache.set(code, codeData);
          }
          logger.debug(`[AccountCodeService] Loaded ${this.cache.size} codes from migrated structure`);
        } else {
          // Old structure - fall back to legacy loading with static codes
          logger.warn('[AccountCodeService] Old structure detected, using fallback mode');
          await this.loadLegacyMode(clubId, data);
        }
      } else {
        // No settings document - initialize with default codes
        logger.warn('[AccountCodeService] No accounting settings found, initializing with defaults');
        await this.initializeWithDefaults(clubId);
      }

      this.initialized = true;
      this.currentClubId = clubId;
      logger.debug(`[AccountCodeService] Initialized with ${this.cache.size} codes`);

    } catch (error) {
      logger.error('[AccountCodeService] Error loading codes:', error);
      // Fall back to static codes on error
      this.loadStaticCodesFallback();
      this.initialized = true;
    }
  }

  /**
   * Legacy mode: load from old structure (customAccountCodes + selectedAccountCodes)
   */
  private static async loadLegacyMode(clubId: string, data: AccountingSettings): Promise<void> {
    const customCodes = data.customAccountCodes || {};
    const selectedCodes = new Set(data.selectedAccountCodes || []);
    const hasSelectedCodes = selectedCodes.size > 0;

    this.cache.clear();

    // Load static codes with customizations
    for (const staticCode of calypsoAccountCodes) {
      const customOverride = customCodes[staticCode.code];
      const isActive = !hasSelectedCodes || selectedCodes.has(staticCode.code);

      const merged: AccountCodeExtended = {
        code: staticCode.code,
        label: customOverride?.label || staticCode.label,
        type: (customOverride?.type || staticCode.type) as AccountCode['type'],
        categories: customOverride?.categories || staticCode.categories || [],
        isActive,
        isDefault: true,
        customized: !!customOverride
      };

      this.cache.set(staticCode.code, merged);
    }

    // Add pure custom codes
    const staticCodesSet = new Set(calypsoAccountCodes.map(c => c.code));
    for (const [code, customCode] of Object.entries(customCodes)) {
      if (!staticCodesSet.has(code)) {
        const isActive = !hasSelectedCodes || selectedCodes.has(code);
        this.cache.set(code, {
          code,
          label: customCode.label || code,
          type: customCode.type || 'expense',
          categories: customCode.categories || [],
          isActive,
          isDefault: false
        });
      }
    }

    logger.debug(`[AccountCodeService] Legacy mode loaded ${this.cache.size} codes`);
  }

  /**
   * Initialize with default Calypso codes (for new clubs)
   */
  private static async initializeWithDefaults(clubId: string): Promise<void> {
    this.cache.clear();

    const accountCodes: Record<string, AccountCodeExtended> = {};

    for (const staticCode of calypsoAccountCodes) {
      const extended: AccountCodeExtended = {
        code: staticCode.code,
        label: staticCode.label,
        type: staticCode.type,
        categories: staticCode.categories || [],
        isActive: true,
        isDefault: true
      };
      accountCodes[staticCode.code] = extended;
      this.cache.set(staticCode.code, extended);
    }

    // Save to Firebase
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      await setDoc(settingsRef, {
        accountCodes,
        version: 2,
        createdAt: serverTimestamp()
      });
      logger.debug('[AccountCodeService] Initialized Firebase with default codes');
    } catch (error) {
      logger.error('[AccountCodeService] Error saving default codes:', error);
    }
  }

  /**
   * Fallback to static codes (when Firebase fails)
   */
  private static loadStaticCodesFallback(): void {
    this.cache.clear();

    for (const staticCode of calypsoAccountCodes) {
      this.cache.set(staticCode.code, {
        ...staticCode,
        isActive: true,
        isDefault: true
      });
    }

    logger.warn(`[AccountCodeService] Fallback mode: loaded ${this.cache.size} static codes`);
  }

  /**
   * Check if the service is initialized
   */
  static isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get a code by its identifier
   */
  static getByCode(code: string): AccountCodeExtended | undefined {
    if (!this.initialized) {
      logger.warn('[AccountCodeService] getByCode called before initialization');
      // Return from static codes as fallback
      const staticCode = calypsoAccountCodes.find(c => c.code === code);
      if (staticCode) {
        return {
          ...staticCode,
          isActive: true,
          isDefault: true
        };
      }
      return undefined;
    }
    return this.cache.get(code);
  }

  /**
   * Get all codes (active and inactive)
   */
  static getAllCodes(): AccountCodeExtended[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get only active codes
   */
  static getActiveCodes(): AccountCodeExtended[] {
    return Array.from(this.cache.values()).filter(code => code.isActive);
  }

  /**
   * Get codes by type (expense/revenue/asset/liability)
   */
  static getByType(type: AccountCode['type'], activeOnly = true): AccountCodeExtended[] {
    const codes = activeOnly ? this.getActiveCodes() : this.getAllCodes();
    return codes.filter(code => code.type === type).sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Get codes by category
   */
  static getByCategory(categoryId: string, activeOnly = true): AccountCodeExtended[] {
    const codes = activeOnly ? this.getActiveCodes() : this.getAllCodes();
    return codes.filter(code => code.categories?.includes(categoryId));
  }

  /**
   * Get expense codes (convenience method)
   */
  static getExpenseCodes(activeOnly = true): AccountCodeExtended[] {
    return this.getByType('expense', activeOnly);
  }

  /**
   * Get revenue codes (convenience method)
   */
  static getRevenueCodes(activeOnly = true): AccountCodeExtended[] {
    return this.getByType('revenue', activeOnly);
  }

  /**
   * Save or update a code
   */
  static async saveCode(clubId: string, code: AccountCodeExtended): Promise<void> {
    // Validate code format before saving to Firebase
    validateCodeFormat(code.code);

    try {
      // Bewaar oude label voor sync-detectie
      const oldLabel = this.cache.get(code.code)?.label;

      // Update cache
      this.cache.set(code.code, code);

      // Update Firebase
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      await updateDoc(settingsRef, {
        [`accountCodes.${code.code}`]: {
          ...code,
          updatedAt: serverTimestamp()
        }
      });

      logger.debug(`[AccountCodeService] Saved code: ${code.code}`);

      // Auto-sync: propageer label wijziging naar gedenormaliseerde documenten
      if (oldLabel !== undefined && oldLabel !== code.label) {
        try {
          const { DenormalizationSyncService } = await import('@/services/denormalizationSyncService');
          const result = await DenormalizationSyncService.syncCodeComptableLabel(clubId, code.code, code.label);
          logger.debug(`[AccountCodeService] Label sync: ${result.message}`);
        } catch (syncError) {
          logger.warn(`[AccountCodeService] Label sync failed (non-blocking):`, syncError);
        }
      }
    } catch (error) {
      logger.error(`[AccountCodeService] Error saving code ${code.code}:`, error);
      throw error;
    }
  }

  /**
   * Toggle code active status
   */
  static async toggleActive(clubId: string, code: string): Promise<boolean> {
    // Validate code format (should already be valid, but double-check)
    validateCodeFormat(code);

    const existing = this.cache.get(code);
    if (!existing) {
      throw new Error(`Code ${code} not found`);
    }

    const newActiveState = !existing.isActive;
    existing.isActive = newActiveState;
    this.cache.set(code, existing);

    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      await updateDoc(settingsRef, {
        [`accountCodes.${code}.isActive`]: newActiveState
      });

      logger.debug(`[AccountCodeService] Toggled code ${code} to ${newActiveState ? 'active' : 'inactive'}`);
      return newActiveState;
    } catch (error) {
      // Revert cache on error
      existing.isActive = !newActiveState;
      this.cache.set(code, existing);
      logger.error(`[AccountCodeService] Error toggling code ${code}:`, error);
      throw error;
    }
  }

  /**
   * Delete a code (only allowed for non-default codes)
   */
  static async deleteCode(clubId: string, code: string): Promise<void> {
    const existing = this.cache.get(code);
    if (!existing) {
      throw new Error(`Code ${code} not found`);
    }

    if (existing.isDefault) {
      throw new Error(`Cannot delete default code ${code}. Deactivate it instead.`);
    }

    try {
      // Remove from Firebase using FieldValue.delete()
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as AccountingSettings;
        const updatedCodes = { ...data.accountCodes };
        delete updatedCodes[code];

        await setDoc(settingsRef, {
          ...data,
          accountCodes: updatedCodes
        });
      }

      // Remove from cache
      this.cache.delete(code);

      logger.debug(`[AccountCodeService] Deleted code: ${code}`);
    } catch (error) {
      logger.error(`[AccountCodeService] Error deleting code ${code}:`, error);
      throw error;
    }
  }

  /**
   * Create a new custom code
   */
  static async createCode(
    clubId: string,
    codeData: Omit<AccountCodeExtended, 'isDefault' | 'code'> & { code: string }
  ): Promise<AccountCodeExtended> {
    // Validate code format before saving to Firebase
    validateCodeFormat(codeData.code);

    // Check if code already exists
    if (this.cache.has(codeData.code)) {
      throw new Error(`Code ${codeData.code} already exists`);
    }

    const newCode: AccountCodeExtended = {
      ...codeData,
      isDefault: false,
      createdAt: new Date()
    };

    await this.saveCode(clubId, newCode);
    return newCode;
  }

  /**
   * Refresh codes from Firebase (force reload)
   */
  static async refresh(clubId: string): Promise<void> {
    this.initialized = false;
    this.cache.clear();
    await this.loadCodes(clubId);
  }

  /**
   * Check if new default codes are available and add them
   * Call this after app updates to sync new default codes
   */
  static async syncNewDefaultCodes(clubId: string): Promise<string[]> {
    const newCodes: string[] = [];
    const existingCodes = new Set(this.cache.keys());

    for (const staticCode of calypsoAccountCodes) {
      if (!existingCodes.has(staticCode.code)) {
        // New default code found
        const extended: AccountCodeExtended = {
          ...staticCode,
          isActive: false, // New codes are inactive by default
          isDefault: true,
          createdAt: new Date()
        };

        await this.saveCode(clubId, extended);
        newCodes.push(staticCode.code);
      }
    }

    if (newCodes.length > 0) {
      logger.info(`[AccountCodeService] Added ${newCodes.length} new default codes`);
    }

    return newCodes;
  }

  /**
   * Get statistics about the codes
   */
  static getStats(): {
    total: number;
    active: number;
    inactive: number;
    default: number;
    custom: number;
    byType: Record<string, number>;
  } {
    const codes = this.getAllCodes();
    const byType: Record<string, number> = {};

    for (const code of codes) {
      byType[code.type] = (byType[code.type] || 0) + 1;
    }

    return {
      total: codes.length,
      active: codes.filter(c => c.isActive).length,
      inactive: codes.filter(c => !c.isActive).length,
      default: codes.filter(c => c.isDefault).length,
      custom: codes.filter(c => !c.isDefault).length,
      byType
    };
  }

  /**
   * Clear the cache (for testing or logout)
   */
  static clearCache(): void {
    this.cache.clear();
    this.initialized = false;
    this.currentClubId = null;
    logger.debug('[AccountCodeService] Cache cleared');
  }
}

// Export default instance for convenience
export default AccountCodeService;

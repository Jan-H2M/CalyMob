import { FirebaseSettingsService } from './firebaseSettingsService';

interface GeneralSettings {
  doubleApprovalThreshold: number;
  enableDoubleApproval: boolean;
  clubName: string;
  fiscalYear: number;
  currency: string;
}

/**
 * @deprecated Ce service utilise Firebase via FirebaseSettingsService.
 * Les méthodes synchrones restent pour compatibilité mais nécessitent un clubId.
 */
export class SettingsService {
  private static cachedSettings: GeneralSettings | null = null;

  /**
   * Récupère les paramètres généraux depuis Firebase
   * @deprecated Utilisez directement FirebaseSettingsService.loadGeneralSettings()
   */
  static async getGeneralSettingsAsync(clubId: string): Promise<GeneralSettings> {
    this.cachedSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);
    return this.cachedSettings;
  }

  /**
   * Récupère les paramètres généraux (version synchrone avec cache)
   * IMPORTANT: Appelez d'abord getGeneralSettingsAsync() pour charger les paramètres
   */
  static getGeneralSettings(): GeneralSettings {
    if (!this.cachedSettings) {
      console.warn('Paramètres généraux non chargés. Utilisation des valeurs par défaut.');
      return {
        doubleApprovalThreshold: 650,
        enableDoubleApproval: true,
        clubName: 'Calypso Diving Club',
        fiscalYear: new Date().getFullYear(),
        currency: 'EUR'
      };
    }
    return this.cachedSettings;
  }

  /**
   * Sauvegarde les paramètres généraux dans Firebase
   * @deprecated Utilisez directement FirebaseSettingsService.saveGeneralSettings()
   */
  static async saveGeneralSettingsAsync(clubId: string, settings: GeneralSettings): Promise<void> {
    await FirebaseSettingsService.saveGeneralSettings(clubId, settings);
    this.cachedSettings = settings;
  }

  /**
   * Vérifie si une demande nécessite une double approbation
   */
  static requiresDoubleApproval(amount: number): boolean {
    const settings = this.getGeneralSettings();

    if (!settings.enableDoubleApproval) {
      return false;
    }

    return Math.abs(amount) >= settings.doubleApprovalThreshold;
  }

  /**
   * Récupère le montant seuil pour la double approbation
   */
  static getDoubleApprovalThreshold(): number {
    const settings = this.getGeneralSettings();
    return settings.doubleApprovalThreshold;
  }

  /**
   * Vérifie si la double approbation est activée
   */
  static isDoubleApprovalEnabled(): boolean {
    const settings = this.getGeneralSettings();
    return settings.enableDoubleApproval;
  }

  /**
   * Récupère le nom du club
   */
  static getClubName(): string {
    const settings = this.getGeneralSettings();
    return settings.clubName;
  }

  /**
   * Récupère l'année fiscale courante
   */
  static getCurrentFiscalYear(): number {
    const settings = this.getGeneralSettings();
    return settings.fiscalYear;
  }

  /**
   * Récupère la devise
   */
  static getCurrency(): string {
    const settings = this.getGeneralSettings();
    return settings.currency;
  }
}
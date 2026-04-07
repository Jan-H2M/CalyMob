import { logger } from '@/utils/logger';
/**
 * BankSettingsPage Component
 *
 * Configuration de la banque du club pour les paiements EPC QR.
 * Permet de configurer l'IBAN, le nom du bénéficiaire et le BIC.
 */

import React, { useState, useEffect } from 'react';
import { Banknote, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SettingsHeader } from './SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/utils/utils';

// Types
export interface BankSettings {
  iban: string;
  beneficiaryName: string;
  bic?: string;
  updatedAt?: Date;
  updatedBy?: string;
}

const DEFAULT_BANK_SETTINGS: BankSettings = {
  iban: '',
  beneficiaryName: '',
  bic: '',
};

// IBAN validation helper
function validateIban(iban: string): { valid: boolean; error?: string } {
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();

  if (!cleanIban) {
    return { valid: false, error: 'IBAN requis' };
  }

  if (cleanIban.length < 15 || cleanIban.length > 34) {
    return { valid: false, error: 'IBAN invalide (15-34 caractères)' };
  }

  // Basic format check: 2 letters (country) + 2 digits (check) + rest
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban)) {
    return { valid: false, error: 'Format IBAN invalide' };
  }

  return { valid: true };
}

// Format IBAN for display (groups of 4)
function formatIbanDisplay(iban: string): string {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

// BIC validation helper
function validateBic(bic: string): { valid: boolean; error?: string } {
  if (!bic) {
    return { valid: true }; // BIC is optional
  }

  const cleanBic = bic.replace(/\s/g, '').toUpperCase();

  // BIC format: 4 letters (bank) + 2 letters (country) + 2 alphanumeric (location) + optional 3 alphanumeric (branch)
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBic)) {
    return { valid: false, error: 'Format BIC invalide (ex: GKCCBEBB)' };
  }

  return { valid: true };
}

export function BankSettingsPage() {
  const { appUser, clubId, loading: authLoading } = useAuth();

  const [settings, setSettings] = useState<BankSettings>(DEFAULT_BANK_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [ibanError, setIbanError] = useState<string | undefined>();
  const [bicError, setBicError] = useState<string | undefined>();

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      // Wait for auth to finish loading
      if (authLoading) return;

      if (!clubId) {
        setIsLoading(false);
        return;
      }
      try {
        const settingsRef = doc(db, 'clubs', clubId, 'settings', 'bank');
        const settingsDoc = await getDoc(settingsRef);

        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setSettings({
            iban: data.iban || '',
            beneficiaryName: data.beneficiaryName || '',
            bic: data.bic || '',
            updatedAt: data.updatedAt?.toDate?.() || undefined,
            updatedBy: data.updatedBy,
          });
        }
      } catch (error) {
        logger.error('Erreur lors du chargement des paramètres bancaires:', error);
        toast.error('Erreur lors du chargement des paramètres');
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [clubId, authLoading]);

  // Validate on change
  const handleIbanChange = (value: string) => {
    setSettings(prev => ({ ...prev, iban: value }));
    const validation = validateIban(value);
    setIbanError(validation.error);
  };

  const handleBicChange = (value: string) => {
    setSettings(prev => ({ ...prev, bic: value }));
    const validation = validateBic(value);
    setBicError(validation.error);
  };

  const saveSettings = async () => {
    if (!clubId || !appUser?.id) {
      logger.error('❌ Missing clubId or appUser.id', { clubId, userId: appUser?.id });
      toast.error('Erreur: utilisateur non connecté');
      return;
    }

    // Validate before saving
    const ibanValidation = validateIban(settings.iban);
    const bicValidation = validateBic(settings.bic || '');

    if (!ibanValidation.valid) {
      setIbanError(ibanValidation.error);
      toast.error('IBAN invalide');
      return;
    }

    if (!bicValidation.valid) {
      setBicError(bicValidation.error);
      toast.error('BIC invalide');
      return;
    }

    if (!settings.beneficiaryName.trim()) {
      toast.error('Nom du bénéficiaire requis');
      return;
    }

    setIsSaving(true);
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'bank');
      await setDoc(settingsRef, {
        iban: settings.iban.replace(/\s/g, '').toUpperCase(),
        beneficiaryName: settings.beneficiaryName.trim(),
        bic: settings.bic?.replace(/\s/g, '').toUpperCase() || '',
        updatedAt: serverTimestamp(),
        updatedBy: appUser.id,
      });
      toast.success('Paramètres bancaires sauvegardés');
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-3xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Banque / IBAN']}
            title="Banque / IBAN"
            description="Configuration bancaire pour les paiements"
          />
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isConfigured = settings.iban && settings.beneficiaryName;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-3xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Banque / IBAN']}
          title="Banque / IBAN"
          description="Configuration du compte bancaire du club pour les paiements EPC QR"
        />

        <div className="space-y-6">
          {/* Main Settings Card */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Banknote className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Compte Bancaire du Club
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Ces informations seront utilisées pour générer les QR codes de paiement EPC
                </p>
              </div>
              {/* Status indicator */}
              {isConfigured ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Configuré</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Non configuré</span>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {/* IBAN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  IBAN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formatIbanDisplay(settings.iban)}
                  onChange={(e) => handleIbanChange(e.target.value)}
                  placeholder="BE68 0688 9376 3453"
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg font-mono text-sm",
                    "dark:bg-dark-bg-tertiary dark:text-dark-text-primary",
                    "focus:ring-2 focus:ring-calypso-blue focus:border-transparent",
                    ibanError
                      ? "border-red-500 dark:border-red-500"
                      : "border-gray-300 dark:border-dark-border"
                  )}
                />
                {ibanError && (
                  <p className="mt-1 text-sm text-red-500">{ibanError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                  Numéro de compte bancaire international (15-34 caractères)
                </p>
              </div>

              {/* Beneficiary Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Nom du Bénéficiaire <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={settings.beneficiaryName}
                  onChange={(e) => setSettings(prev => ({ ...prev, beneficiaryName: e.target.value }))}
                  placeholder="Calypso Diving Club"
                  maxLength={70}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                  Nom qui apparaîtra sur les virements (max 70 caractères)
                </p>
              </div>

              {/* BIC */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  BIC / SWIFT <span className="text-gray-400 dark:text-dark-text-muted">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={settings.bic || ''}
                  onChange={(e) => handleBicChange(e.target.value)}
                  placeholder="GKCCBEBB"
                  maxLength={11}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg font-mono text-sm uppercase",
                    "dark:bg-dark-bg-tertiary dark:text-dark-text-primary",
                    "focus:ring-2 focus:ring-calypso-blue focus:border-transparent",
                    bicError
                      ? "border-red-500 dark:border-red-500"
                      : "border-gray-300 dark:border-dark-border"
                  )}
                />
                {bicError && (
                  <p className="mt-1 text-sm text-red-500">{bicError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                  Code d'identification bancaire (optionnel pour les paiements SEPA en zone EEE)
                </p>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={saveSettings}
                  disabled={isSaving || !!ibanError || !!bicError}
                  className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
              À propos des paiements EPC QR
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Les QR codes EPC (European Payments Council) permettent aux membres de payer
              directement depuis leur application bancaire en scannant un code. Le paiement
              est pré-rempli avec le montant, l'IBAN et la communication structurée.
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-2">
              Ces paramètres sont utilisés par l'application mobile CalyMob pour générer
              les QR codes de paiement lors de l'inscription aux événements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

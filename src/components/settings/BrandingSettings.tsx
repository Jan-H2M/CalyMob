import React, { useState, useEffect, useRef } from 'react';
import { logger } from '@/utils/logger';
import { toast } from 'react-hot-toast';
import {
  Upload,
  Trash2,
  Palette,
  Globe,
  Image as ImageIcon,
  Save,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import { ClubBranding, DEFAULT_BRANDING, generateGradient } from '@/types/branding';
import { SettingsHeader } from './SettingsHeader';
import { cn } from '@/utils/utils';

export default function BrandingSettings() {
  const { clubId, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<ClubBranding>(DEFAULT_BRANDING);
  const [originalBranding, setOriginalBranding] = useState<ClubBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Check if there are unsaved changes
  const hasChanges = JSON.stringify(branding) !== JSON.stringify(originalBranding);

  // Load branding on mount
  useEffect(() => {
    if (clubId) {
      loadBranding();
    }
  }, [clubId]);

  const loadBranding = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const loaded = await BrandingService.loadBranding(clubId);
      setBranding(loaded);
      setOriginalBranding(loaded);
    } catch (error) {
      logger.error('Error loading branding:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof ClubBranding, value: string) => {
    setBranding(prev => {
      const updated = { ...prev, [field]: value };

      // Auto-update gradient when colors change
      if (field === 'primaryColor' || field === 'secondaryColor') {
        updated.headerGradient = generateGradient(
          field === 'primaryColor' ? value : prev.primaryColor,
          field === 'secondaryColor' ? value : prev.secondaryColor
        );
      }

      return updated;
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clubId) return;

    try {
      setUploading(true);
      const logoUrl = await BrandingService.uploadLogo(clubId, file);
      setBranding(prev => ({ ...prev, logoUrl }));
      setOriginalBranding(prev => ({ ...prev, logoUrl }));
      toast.success('Logo uploadé avec succès');
    } catch (error) {
      logger.error('Error uploading logo:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async () => {
    if (!clubId || !branding.logoUrl) return;

    const confirmed = window.confirm('Êtes-vous sûr de vouloir supprimer le logo ?');
    if (!confirmed) return;

    try {
      setUploading(true);
      await BrandingService.deleteLogo(clubId, branding.logoUrl);
      setBranding(prev => ({ ...prev, logoUrl: undefined }));
      setOriginalBranding(prev => ({ ...prev, logoUrl: undefined }));
      toast.success('Logo supprimé');
    } catch (error) {
      logger.error('Error deleting logo:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!clubId) return;

    // Validate
    const validation = BrandingService.validateBranding(branding);
    if (!validation.valid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    try {
      setSaving(true);
      await BrandingService.saveBranding(clubId, branding, user?.uid);
      setOriginalBranding(branding);
      toast.success('Branding sauvegardé avec succès');
    } catch (error) {
      logger.error('Error saving branding:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setBranding(originalBranding);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-4xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Communication', 'Branding']}
          title="Branding du Club"
          description="Configurez le logo et les couleurs pour toutes les communications"
        />

        <div className="space-y-6">
          {/* Section 1: Logo */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-dark-text-primary">
              <ImageIcon className="h-5 w-5" />
              Logo du Club
            </h3>

            <div className="flex items-center gap-6 mb-4">
              {/* Logo Preview */}
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.logoAlt || 'Club logo'}
                  className="h-20 w-20 object-contain rounded-lg border border-gray-200 dark:border-dark-border"
                />
              ) : (
                <div className="h-20 w-20 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg flex items-center justify-center border border-dashed border-gray-300 dark:border-dark-border">
                  <ImageIcon className="h-8 w-8 text-gray-400 dark:text-dark-text-muted" />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                      'px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors',
                      'bg-calypso-blue text-white hover:bg-calypso-blue-dark',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading ? 'Upload...' : branding.logoUrl ? 'Changer' : 'Uploader'}
                  </button>

                  {branding.logoUrl && (
                    <button
                      onClick={handleDeleteLogo}
                      disabled={uploading}
                      className="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                  PNG ou JPG, max 2MB. Recommandé: 200x200px
                </p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
            </div>

            {/* Logo Alt Text */}
            <div>
              <label htmlFor="brandingsettings-logoAlt-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Texte alternatif (accessibilité)
              </label>
              <input
                id="brandingsettings-logoAlt-input"
                type="text"
                value={branding.logoAlt || ''}
                onChange={(e) => handleChange('logoAlt', e.target.value)}
                placeholder="Logo Calypso Diving Club"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
              />
            </div>
          </div>

          {/* Section 2: Couleurs */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-dark-text-primary">
              <Palette className="h-5 w-5" />
              Couleurs
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Couleur principale */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Couleur principale
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="h-10 w-14 rounded cursor-pointer border border-gray-300 dark:border-dark-border"
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    placeholder="#006994"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary font-mono text-sm"
                  />
                </div>
              </div>

              {/* Couleur secondaire */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Couleur secondaire
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.secondaryColor || '#004A6B'}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="h-10 w-14 rounded cursor-pointer border border-gray-300 dark:border-dark-border"
                  />
                  <input
                    type="text"
                    value={branding.secondaryColor || ''}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    placeholder="#004A6B"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary font-mono text-sm"
                  />
                </div>
              </div>

              {/* Couleur accent */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Couleur accent (boutons)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.accentColor || '#00A5CF'}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className="h-10 w-14 rounded cursor-pointer border border-gray-300 dark:border-dark-border"
                  />
                  <input
                    type="text"
                    value={branding.accentColor || ''}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    placeholder="#00A5CF"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Gradient Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Aperçu du gradient (en-tête emails)
              </label>
              <div
                className="h-16 rounded-lg shadow-inner"
                style={{ background: branding.headerGradient || generateGradient(branding.primaryColor, branding.secondaryColor) }}
              />
            </div>
          </div>

          {/* Section 3: Informations du Club */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-dark-text-primary">
              <Globe className="h-5 w-5" />
              Informations du Club
            </h3>

            <div className="space-y-4">
              <div>
                <label htmlFor="brandingsettings-clubName-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Nom du club *
                </label>
                <input
                  id="brandingsettings-clubName-input"
                  type="text"
                  value={branding.clubName}
                  onChange={(e) => handleChange('clubName', e.target.value)}
                  placeholder="Calypso Diving Club"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                />
              </div>

              <div>
                <label htmlFor="brandingsettings-websiteUrl-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Site web
                </label>
                <input
                  id="brandingsettings-websiteUrl-input"
                  type="url"
                  value={branding.websiteUrl || ''}
                  onChange={(e) => handleChange('websiteUrl', e.target.value)}
                  placeholder="https://www.calypso-diving.be"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                />
              </div>

              <div>
                <label htmlFor="brandingsettings-footerText-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Texte de pied de page
                </label>
                <textarea
                  id="brandingsettings-footerText-input"
                  value={branding.footerText || ''}
                  onChange={(e) => handleChange('footerText', e.target.value)}
                  placeholder="© 2025 Calypso Diving Club. Tous droits réservés."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Preview */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-dark-text-primary">
              Aperçu Email
            </h3>
            <EmailPreview branding={branding} />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              disabled={!hasChanges || saving}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors',
                'text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <RefreshCw className="h-4 w-4" />
              Annuler les modifications
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={cn(
                'px-6 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors',
                'bg-calypso-blue text-white hover:bg-calypso-blue-dark',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Email Preview Component
 */
function EmailPreview({ branding }: { branding: ClubBranding }) {
  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden max-w-md mx-auto shadow-lg">
      {/* Header */}
      <div
        className="p-6 text-center"
        style={{ background: branding.headerGradient }}
      >
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.logoAlt || 'Logo'}
            className="h-14 mx-auto"
          />
        ) : (
          <h2 className="text-xl font-bold text-white">{branding.clubName}</h2>
        )}
      </div>

      {/* Body */}
      <div className="p-6 bg-white">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
          Bienvenue chez {branding.clubName}
        </h3>
        <p className="text-gray-600 dark:text-dark-text-secondary text-sm mb-4">
          Ceci est un aperçu de l'apparence de vos emails avec votre branding personnalisé.
          Les couleurs et le logo seront appliqués à toutes les communications.
        </p>
        <button
          className="px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: branding.accentColor || branding.primaryColor }}
        >
          Bouton d'action
        </button>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-100 dark:bg-dark-bg-tertiary text-center">
        <p className="text-sm text-gray-500 dark:text-dark-text-muted">
          {branding.footerText || `© ${new Date().getFullYear()} ${branding.clubName}`}
        </p>
        {branding.websiteUrl && (
          <p className="mt-1">
            <a
              href={branding.websiteUrl}
              className="text-sm hover:underline"
              style={{ color: branding.primaryColor }}
            >
              {branding.websiteUrl}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

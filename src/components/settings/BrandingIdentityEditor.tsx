/**
 * BrandingIdentityEditor - Modal pour modifier l'identite du club
 */

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import { BrandingLibrary, FONT_OPTIONS } from '@/types/branding';

interface BrandingIdentityEditorProps {
  library: BrandingLibrary;
  onClose: () => void;
  onSave: () => void;
}

export default function BrandingIdentityEditor({ library, onClose, onSave }: BrandingIdentityEditorProps) {
  const { clubId, user } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    clubName: library.identity.clubName,
    slogan: library.identity.slogan || '',
    description: library.identity.description || '',
    fontFamily: library.typography.fontFamily,
    titleFontSize: library.typography.titleFontSize,
    bodyFontSize: library.typography.bodyFontSize,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clubId) return;

    if (!formData.clubName.trim()) {
      toast.error('Le nom du club est requis');
      return;
    }

    try {
      setSaving(true);

      await BrandingService.saveBrandingLibrary(
        clubId,
        {
          identity: {
            clubName: formData.clubName,
            slogan: formData.slogan || undefined,
            description: formData.description || undefined,
          },
          typography: {
            fontFamily: formData.fontFamily,
            titleFontSize: formData.titleFontSize,
            bodyFontSize: formData.bodyFontSize,
          },
        },
        user?.uid
      );

      toast.success('Identite mise a jour');
      onSave();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Identite du Club
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Club Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Nom du club *
            </label>
            <input
              type="text"
              value={formData.clubName}
              onChange={e => setFormData({ ...formData, clubName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="Calypso Diving Club"
            />
          </div>

          {/* Slogan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Slogan
            </label>
            <input
              type="text"
              value={formData.slogan}
              onChange={e => setFormData({ ...formData, slogan: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="Plongez dans l'aventure"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary resize-none"
              placeholder="Breve description du club..."
            />
          </div>

          <hr className="border-gray-200 dark:border-dark-border" />

          {/* Typography */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
              Typographie
            </h3>

            {/* Font Family */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Police
              </label>
              <select
                value={formData.fontFamily}
                onChange={e => setFormData({ ...formData, fontFamily: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              >
                {FONT_OPTIONS.map(font => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Title Font Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Taille titres: {formData.titleFontSize}px
                </label>
                <input
                  type="range"
                  min="16"
                  max="36"
                  value={formData.titleFontSize}
                  onChange={e => setFormData({ ...formData, titleFontSize: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Body Font Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Taille texte: {formData.bodyFontSize}px
                </label>
                <input
                  type="range"
                  min="12"
                  max="20"
                  value={formData.bodyFontSize}
                  onChange={e => setFormData({ ...formData, bodyFontSize: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Apercu
            </label>
            <div
              className="p-4 border border-gray-200 dark:border-dark-border rounded-lg"
              style={{ fontFamily: formData.fontFamily }}
            >
              <h3
                className="font-semibold mb-2 text-calypso-blue"
                style={{ fontSize: `${formData.titleFontSize}px` }}
              >
                {formData.clubName || 'Nom du club'}
              </h3>
              {formData.slogan && (
                <p
                  className="text-gray-500 dark:text-dark-text-muted italic mb-2"
                  style={{ fontSize: `${formData.bodyFontSize}px` }}
                >
                  "{formData.slogan}"
                </p>
              )}
              <p
                className="text-gray-700 dark:text-dark-text-primary"
                style={{ fontSize: `${formData.bodyFontSize}px` }}
              >
                Ceci est un exemple de texte pour visualiser la typographie choisie.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

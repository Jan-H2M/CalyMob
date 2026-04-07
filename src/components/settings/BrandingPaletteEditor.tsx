/**
 * BrandingPaletteEditor - Modal pour ajouter/modifier une palette de couleurs
 */

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { X, Loader2, Palette } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import {
  ColorPalette,
  DEFAULT_PALETTE,
  PRESET_PALETTES,
  generateGradient,
} from '@/types/branding';
import ColorPicker from '@/components/ui/ColorPicker';
import { cn } from '@/utils/utils';

interface BrandingPaletteEditorProps {
  palette: ColorPalette | null;
  onClose: () => void;
  onSave: () => void;
}

export default function BrandingPaletteEditor({ palette, onClose, onSave }: BrandingPaletteEditorProps) {
  const { clubId } = useAuth();
  const isEditing = !!palette;

  // Form state
  const [formData, setFormData] = useState({
    name: palette?.name || DEFAULT_PALETTE.name,
    primary: palette?.primary || DEFAULT_PALETTE.primary,
    secondary: palette?.secondary || DEFAULT_PALETTE.secondary,
    accent: palette?.accent || DEFAULT_PALETTE.accent,
    text: palette?.text || DEFAULT_PALETTE.text,
    background: palette?.background || DEFAULT_PALETTE.background,
    contentBackground: palette?.contentBackground || DEFAULT_PALETTE.contentBackground,
  });
  const [saving, setSaving] = useState(false);

  const handlePresetSelect = (preset: typeof PRESET_PALETTES[0]) => {
    setFormData({
      ...formData,
      name: preset.name,
      primary: preset.primary,
      secondary: preset.secondary,
      accent: preset.accent,
      text: preset.text,
      background: preset.background,
      contentBackground: preset.contentBackground,
    });
  };

  const handleSave = async () => {
    if (!clubId) return;

    if (!formData.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      setSaving(true);

      if (isEditing && palette) {
        await BrandingService.updatePalette(clubId, palette.id, formData);
        toast.success('Palette mise a jour');
      } else {
        await BrandingService.createPalette(clubId, formData);
        toast.success('Palette creee');
      }

      onSave();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const gradient = generateGradient(formData.primary, formData.secondary);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {isEditing ? 'Modifier la palette' : 'Ajouter une palette'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Presets */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Palettes predefinies
            </label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {PRESET_PALETTES.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={cn(
                    'p-2 border rounded-lg hover:border-calypso-blue transition-colors text-center',
                    formData.name === preset.name
                      ? 'border-calypso-blue bg-calypso-blue/5'
                      : 'border-gray-200 dark:border-dark-border'
                  )}
                >
                  <div className="flex justify-center gap-0.5 mb-1">
                    <div className="h-4 w-4 rounded-l" style={{ backgroundColor: preset.primary }} />
                    <div className="h-4 w-4" style={{ backgroundColor: preset.secondary }} />
                    <div className="h-4 w-4 rounded-r" style={{ backgroundColor: preset.accent }} />
                  </div>
                  <span className="text-xs text-gray-600 dark:text-dark-text-secondary">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Form */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Nom
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  placeholder="Ma palette"
                />
              </div>

              {/* Colors */}
              <ColorPicker
                label="Couleur principale"
                value={formData.primary}
                onChange={color => setFormData({ ...formData, primary: color })}
              />

              <ColorPicker
                label="Couleur secondaire"
                value={formData.secondary}
                onChange={color => setFormData({ ...formData, secondary: color })}
              />

              <ColorPicker
                label="Couleur accent (boutons)"
                value={formData.accent}
                onChange={color => setFormData({ ...formData, accent: color })}
              />

              <ColorPicker
                label="Couleur du texte"
                value={formData.text}
                onChange={color => setFormData({ ...formData, text: color })}
              />

              <ColorPicker
                label="Fond de l'email"
                value={formData.background}
                onChange={color => setFormData({ ...formData, background: color })}
              />

              <ColorPicker
                label="Fond du contenu"
                value={formData.contentBackground}
                onChange={color => setFormData({ ...formData, contentBackground: color })}
              />
            </div>

            {/* Right: Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Apercu
              </label>

              {/* Email preview */}
              <div
                className="rounded-lg overflow-hidden border border-gray-200 dark:border-dark-border"
                style={{ backgroundColor: formData.background }}
              >
                {/* Header */}
                <div
                  className="h-16 flex items-center justify-center"
                  style={{ background: gradient }}
                >
                  <span className="text-white font-semibold">Header</span>
                </div>

                {/* Content */}
                <div className="p-4">
                  <div
                    className="rounded-lg p-4"
                    style={{ backgroundColor: formData.contentBackground }}
                  >
                    <h3
                      className="font-semibold mb-2"
                      style={{ color: formData.primary }}
                    >
                      Titre de l'email
                    </h3>
                    <p
                      className="text-sm mb-4"
                      style={{ color: formData.text }}
                    >
                      Ceci est un exemple de texte pour visualiser la palette de couleurs dans un email.
                    </p>
                    <button
                      className="px-4 py-2 rounded text-white text-sm font-medium"
                      style={{ backgroundColor: formData.accent }}
                    >
                      Bouton d'action
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div
                  className="px-4 py-3 text-center text-xs"
                  style={{
                    backgroundColor: formData.secondary,
                    color: '#FFFFFF',
                  }}
                >
                  Footer de l'email
                </div>
              </div>

              {/* Color swatches */}
              <div className="mt-4 flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full shadow border-2 border-white"
                  style={{ backgroundColor: formData.primary }}
                  title="Primary"
                />
                <div
                  className="w-8 h-8 rounded-full shadow border-2 border-white"
                  style={{ backgroundColor: formData.secondary }}
                  title="Secondary"
                />
                <div
                  className="w-8 h-8 rounded-full shadow border-2 border-white"
                  style={{ backgroundColor: formData.accent }}
                  title="Accent"
                />
                <div
                  className="w-8 h-8 rounded-full shadow border-2 border-white"
                  style={{ backgroundColor: formData.text }}
                  title="Text"
                />
                <div
                  className="w-8 h-8 rounded-full shadow border"
                  style={{ backgroundColor: formData.background }}
                  title="Background"
                />
                <div
                  className="w-8 h-8 rounded-full shadow border"
                  style={{ backgroundColor: formData.contentBackground }}
                  title="Content"
                />
              </div>
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

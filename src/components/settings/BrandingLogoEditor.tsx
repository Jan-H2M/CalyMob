/**
 * BrandingLogoEditor - Modal pour ajouter/modifier un logo
 */

import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import {
  BrandingLogo,
  LogoType,
  LogoStyle,
  DEFAULT_LOGO,
  generateLogoStyles,
} from '@/types/branding';
import ColorPicker from '@/components/ui/ColorPicker';
import { cn } from '@/utils/utils';

interface BrandingLogoEditorProps {
  logo: BrandingLogo | null;
  onClose: () => void;
  onSave: () => void;
}

const LOGO_TYPES: { value: LogoType; label: string }[] = [
  { value: 'primary', label: 'Principal' },
  { value: 'secondary', label: 'Secondaire' },
  { value: 'icon', label: 'Icone' },
  { value: 'monochrome', label: 'Monochrome' },
];

const LOGO_STYLES: { value: LogoStyle; label: string; description: string }[] = [
  { value: 'transparent', label: 'Transparent', description: 'Sans fond' },
  { value: 'contained', label: 'Conteneur', description: 'Avec fond et bordures arrondies' },
  { value: 'circle', label: 'Cercle', description: 'Dans un cercle' },
];

export default function BrandingLogoEditor({ logo, onClose, onSave }: BrandingLogoEditorProps) {
  const { clubId, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!logo;

  // Form state
  const [formData, setFormData] = useState({
    name: logo?.name || DEFAULT_LOGO.name,
    type: logo?.type || DEFAULT_LOGO.type,
    style: logo?.style || DEFAULT_LOGO.style,
    backgroundColor: logo?.backgroundColor || DEFAULT_LOGO.backgroundColor || '#FFFFFF',
    padding: logo?.padding ?? DEFAULT_LOGO.padding ?? 8,
    borderRadius: logo?.borderRadius ?? DEFAULT_LOGO.borderRadius ?? 8,
  });
  const [imageUrl, setImageUrl] = useState(logo?.url || '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
      toast.error('Seuls les fichiers image sont autorises');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La taille maximum est de 2MB');
      return;
    }

    setImageFile(file);
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setImageUrl(previewUrl);
  };

  const handleSave = async () => {
    if (!clubId) return;

    if (!formData.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      setSaving(true);

      if (isEditing && logo) {
        // Update existing logo
        await BrandingService.updateLogo(clubId, logo.id, {
          name: formData.name,
          type: formData.type,
          style: formData.style,
          backgroundColor: formData.backgroundColor,
          padding: formData.padding,
          borderRadius: formData.borderRadius,
        });

        // Upload new image if selected
        if (imageFile) {
          setUploading(true);
          await BrandingService.uploadLogoFile(clubId, logo.id, imageFile);
        }

        toast.success('Logo mis a jour');
      } else {
        // Create new logo
        const logoId = await BrandingService.createLogo(clubId, {
          name: formData.name,
          url: '', // Will be updated after upload
          type: formData.type,
          style: formData.style,
          backgroundColor: formData.backgroundColor,
          padding: formData.padding,
          borderRadius: formData.borderRadius,
        });

        // Upload image if selected
        if (imageFile) {
          setUploading(true);
          await BrandingService.uploadLogoFile(clubId, logoId, imageFile);
        }

        toast.success('Logo cree');
      }

      onSave();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Create preview logo object
  const previewLogo: BrandingLogo = {
    id: 'preview',
    name: formData.name,
    url: imageUrl,
    type: formData.type,
    style: formData.style,
    backgroundColor: formData.backgroundColor,
    padding: formData.padding,
    borderRadius: formData.borderRadius,
    createdAt: new Date(),
  };

  const previewStyles = generateLogoStyles(previewLogo);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {isEditing ? 'Modifier le logo' : 'Ajouter un logo'}
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
                  placeholder="Logo principal"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as LogoType })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                >
                  {LOGO_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {/* Style */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Style d'affichage
                </label>
                <div className="space-y-2">
                  {LOGO_STYLES.map(style => (
                    <label
                      key={style.value}
                      className={cn(
                        'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                        formData.style === style.value
                          ? 'border-calypso-blue bg-calypso-blue/5'
                          : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                      )}
                    >
                      <input
                        type="radio"
                        name="logoStyle"
                        value={style.value}
                        checked={formData.style === style.value}
                        onChange={e => setFormData({ ...formData, style: e.target.value as LogoStyle })}
                        className="text-calypso-blue"
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">{style.label}</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">{style.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Style options (only for contained/circle) */}
              {formData.style !== 'transparent' && (
                <>
                  <ColorPicker
                    label="Couleur de fond"
                    value={formData.backgroundColor}
                    onChange={color => setFormData({ ...formData, backgroundColor: color })}
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Padding: {formData.padding}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={formData.padding}
                      onChange={e => setFormData({ ...formData, padding: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  {formData.style === 'contained' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        Border radius: {formData.borderRadius}px
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="24"
                        value={formData.borderRadius}
                        onChange={e => setFormData({ ...formData, borderRadius: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right: Preview & Upload */}
            <div className="space-y-4">
              {/* Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg hover:border-calypso-blue transition-colors flex items-center justify-center gap-2 text-gray-600 dark:text-dark-text-secondary"
                >
                  <Upload className="h-5 w-5" />
                  {imageUrl ? 'Changer l\'image' : 'Uploader une image'}
                </button>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">PNG, JPG ou SVG. Max 2MB.</p>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Apercu
                </label>
                <div className="border border-gray-200 dark:border-dark-border rounded-lg p-6 bg-gray-100 dark:bg-dark-bg-tertiary flex items-center justify-center min-h-[150px]">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="max-h-24 max-w-full object-contain"
                      style={previewStyles}
                    />
                  ) : (
                    <div className="text-center text-gray-400 dark:text-dark-text-muted">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                      <p className="text-sm">Aucune image</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview on gradient */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Apercu sur fond colore
                </label>
                <div
                  className="border border-gray-200 dark:border-dark-border rounded-lg p-6 flex items-center justify-center min-h-[100px]"
                  style={{ background: 'linear-gradient(135deg, #004A6B 0%, #006994 100%)' }}
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="max-h-16 max-w-full object-contain"
                      style={previewStyles}
                    />
                  ) : (
                    <span className="text-white/50 text-sm">Aucune image</span>
                  )}
                </div>
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
            disabled={saving || uploading}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {(saving || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? 'Upload...' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

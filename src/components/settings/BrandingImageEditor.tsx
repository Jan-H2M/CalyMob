/**
 * BrandingImageEditor - Modal pour ajouter/modifier une image de branding
 */

import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import {
  BrandingImage,
  ImageType,
  DEFAULT_IMAGE,
} from '@/types/branding';
import { cn } from '@/utils/utils';

interface BrandingImageEditorProps {
  image: BrandingImage | null;
  onClose: () => void;
  onSave: () => void;
}

const IMAGE_TYPES: { value: ImageType; label: string; description: string }[] = [
  { value: 'header', label: 'Header', description: 'Image d\'en-tete pour emails' },
  { value: 'footer', label: 'Footer', description: 'Image de pied de page (sponsors, partenaires)' },
  { value: 'background', label: 'Fond', description: 'Image de fond pour emails' },
  { value: 'decoration', label: 'Decoration', description: 'Element decoratif (vagues, motifs)' },
];

export default function BrandingImageEditor({ image, onClose, onSave }: BrandingImageEditorProps) {
  const { clubId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!image;

  // Form state
  const [formData, setFormData] = useState({
    name: image?.name || DEFAULT_IMAGE.name,
    type: image?.type || DEFAULT_IMAGE.type,
    description: image?.description || DEFAULT_IMAGE.description || '',
  });
  const [imageUrl, setImageUrl] = useState(image?.url || '');
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
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La taille maximum est de 5MB');
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

      if (isEditing && image) {
        // Update existing image
        await BrandingService.updateImage(clubId, image.id, {
          name: formData.name,
          type: formData.type,
          description: formData.description,
        });

        // Upload new image if selected
        if (imageFile) {
          setUploading(true);
          await BrandingService.uploadImageFile(clubId, image.id, imageFile);
        }

        toast.success('Image mise a jour');
      } else {
        // Create new image
        const imageId = await BrandingService.createImage(clubId, {
          name: formData.name,
          url: '', // Will be updated after upload
          type: formData.type,
          description: formData.description,
        });

        // Upload image if selected
        if (imageFile) {
          setUploading(true);
          await BrandingService.uploadImageFile(clubId, imageId, imageFile);
        }

        toast.success('Image creee');
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {isEditing ? 'Modifier l\'image' : 'Ajouter une image'}
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
                  placeholder="Header vagues"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Type
                </label>
                <div className="space-y-2">
                  {IMAGE_TYPES.map(type => (
                    <label
                      key={type.value}
                      className={cn(
                        'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                        formData.type === type.value
                          ? 'border-calypso-blue bg-calypso-blue/5'
                          : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                      )}
                    >
                      <input
                        type="radio"
                        name="imageType"
                        value={type.value}
                        checked={formData.type === type.value}
                        onChange={e => setFormData({ ...formData, type: e.target.value as ImageType })}
                        className="text-calypso-blue"
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">{type.label}</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">{type.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Description (optionnel)
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary resize-none"
                  placeholder="Description de l'image..."
                />
              </div>
            </div>

            {/* Right: Upload & Preview */}
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
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">PNG, JPG ou SVG. Max 5MB.</p>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Apercu
                </label>
                <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-bg-tertiary">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="w-full h-48 object-contain"
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center text-gray-400 dark:text-dark-text-muted">
                      <div className="text-center">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                        <p className="text-sm">Aucune image</p>
                      </div>
                    </div>
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

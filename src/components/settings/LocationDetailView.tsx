/**
 * Location Detail View
 * 800px slide-out panel for viewing/editing dive locations
 * Includes embedded TariffConfigEditor
 */

import { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { DiveLocation, Tariff, COUNTRY_OPTIONS } from '@/types/tariff.types';
import { TariffConfigEditor } from './TariffConfigEditor';
import toast from 'react-hot-toast';

interface LocationDetailViewProps {
  location: DiveLocation | null;
  isCreateMode: boolean;
  onClose: () => void;
  onUpdate?: (locationId: string, updates: Partial<DiveLocation>) => Promise<void>;
  onCreate?: (data: Omit<DiveLocation, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<void>;
  onDelete?: (locationId: string) => Promise<void>;
}

export function LocationDetailView({
  location,
  isCreateMode,
  onClose,
  onUpdate,
  onCreate,
  onDelete
}: LocationDetailViewProps) {
  const [editedData, setEditedData] = useState({
    name: location?.name || '',
    description: location?.description || '',
    country: location?.country || 'BE',
    address: location?.address || '',
    phone: location?.phone || '',
    email: location?.email || '',
    website: location?.website || '',
    notes: location?.notes || '',
    tariffs: location?.tariffs || [] as Tariff[]
  });

  const [isSaving, setIsSaving] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea function
  const autoResize = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  };

  // Update editedData when location changes
  useEffect(() => {
    if (location) {
      setEditedData({
        name: location.name,
        description: location.description || '',
        country: location.country,
        address: location.address || '',
        phone: location.phone || '',
        email: location.email || '',
        website: location.website || '',
        notes: location.notes || '',
        tariffs: location.tariffs || []
      });
    }
  }, [location]);

  // Auto-resize textareas when content changes
  useEffect(() => {
    autoResize(descriptionRef.current);
    autoResize(notesRef.current);
  }, [editedData.description, editedData.notes]);

  // ESC key handler (REQUIRED by LAYOUT_STANDARDS)
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose]);

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: keyof typeof editedData, value: any) => {
    if (isCreateMode || !onUpdate || !location) return;

    try {
      // Validation
      if (field === 'name' && (!value || !value.trim())) {
        toast.error('Le nom est obligatoire');
        return;
      }

      // Save to Firestore
      await onUpdate(location.id, { [field]: value });

      // Success feedback
      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Handle create
  const handleCreate = async () => {
    if (!onCreate) return;

    // Validation
    if (!editedData.name || !editedData.name.trim()) {
      toast.error('Le nom du lieu est obligatoire');
      return;
    }

    if (editedData.tariffs.length === 0) {
      toast.error('Veuillez ajouter au moins un tarif');
      return;
    }

    // Check if all tariffs have labels
    const invalidTariffs = editedData.tariffs.filter(t => !t.label || !t.label.trim());
    if (invalidTariffs.length > 0) {
      toast.error('Tous les tarifs doivent avoir un label');
      return;
    }

    setIsSaving(true);
    try {
      // Build data object, excluding undefined fields (Firestore doesn't accept undefined)
      const locationData: any = {
        name: editedData.name.trim(),
        country: editedData.country,
        tariffs: editedData.tariffs
      };

      // Only add optional fields if they have values
      if (editedData.description?.trim()) {
        locationData.description = editedData.description.trim();
      }
      if (editedData.address?.trim()) {
        locationData.address = editedData.address.trim();
      }
      if (editedData.phone?.trim()) {
        locationData.phone = editedData.phone.trim();
      }
      if (editedData.email?.trim()) {
        locationData.email = editedData.email.trim();
      }
      if (editedData.website?.trim()) {
        locationData.website = editedData.website.trim();
      }
      if (editedData.notes?.trim()) {
        locationData.notes = editedData.notes.trim();
      }

      await onCreate(locationData);

      toast.success('Lieu créé avec succès');
      onClose();
    } catch (error) {
      console.error('Error creating location:', error);
      toast.error('Erreur lors de la création');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!onDelete || !location) return;

    // Double confirmation
    const confirmMessage = `Êtes-vous sûr de vouloir supprimer le lieu "${editedData.name}" ?\n\nCette action est irréversible.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      await onDelete(location.id);
      toast.success('Lieu supprimé avec succès');
      onClose();
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 flex items-end justify-end z-[100]"
        onClick={onClose}
      >
        {/* Panel */}
        <div
          className="bg-white dark:bg-dark-bg-primary h-full w-full md:w-[800px] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Compact */}
          <div className="flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                {isCreateMode ? 'Nouveau lieu de plongée' : editedData.name}
              </h2>
              <div className="flex items-center gap-2">
                {/* Delete button (only for edit mode) */}
                {!isCreateMode && onDelete && (
                  <button
                    onClick={handleDelete}
                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    title="Supprimer ce lieu"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-primary rounded-md transition-colors"
                  title="Fermer (ESC)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Content (scrollable) */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {/* Compact Form */}
              <div className="grid grid-cols-2 gap-3">
                {/* Name - full width */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Nom du lieu *
                  </label>
                  <input
                    type="text"
                    value={editedData.name}
                    onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                    onBlur={() => handleFieldSave('name', editedData.name)}
                    placeholder="Grevelingen"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Address - full width */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={editedData.address}
                    onChange={(e) => setEditedData({ ...editedData, address: e.target.value })}
                    onBlur={() => handleFieldSave('address', editedData.address)}
                    placeholder="123 Rue Example, Ville, Code Postal"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Country */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Pays
                  </label>
                  <select
                    value={editedData.country}
                    onChange={(e) => {
                      setEditedData({ ...editedData, country: e.target.value });
                      if (!isCreateMode) handleFieldSave('country', e.target.value);
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                  >
                    {COUNTRY_OPTIONS.map(country => (
                      <option key={country.value} value={country.value}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={editedData.phone}
                    onChange={(e) => setEditedData({ ...editedData, phone: e.target.value })}
                    onBlur={() => handleFieldSave('phone', editedData.phone)}
                    placeholder="+32 123 45 67 89"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editedData.email}
                    onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                    onBlur={() => handleFieldSave('email', editedData.email)}
                    placeholder="contact@example.com"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Site web
                  </label>
                  <input
                    type="url"
                    value={editedData.website}
                    onChange={(e) => setEditedData({ ...editedData, website: e.target.value })}
                    onBlur={() => handleFieldSave('website', editedData.website)}
                    placeholder="https://example.com"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Description - full width, auto-expandable */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Description
                  </label>
                  <textarea
                    ref={descriptionRef}
                    value={editedData.description}
                    onChange={(e) => {
                      setEditedData({ ...editedData, description: e.target.value });
                      autoResize(e.target);
                    }}
                    onBlur={() => handleFieldSave('description', editedData.description)}
                    placeholder="Plongée épave + herbiers"
                    rows={1}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent resize-none overflow-hidden"
                  />
                </div>

                {/* Notes - full width, auto-expandable */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Commentaires
                  </label>
                  <textarea
                    ref={notesRef}
                    value={editedData.notes}
                    onChange={(e) => {
                      setEditedData({ ...editedData, notes: e.target.value });
                      autoResize(e.target);
                    }}
                    onBlur={() => handleFieldSave('notes', editedData.notes)}
                    placeholder="Notes additionnelles..."
                    rows={1}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent resize-none overflow-hidden"
                  />
                </div>
              </div>

              {/* Tarifs (Embedded Editor) */}
              <div className="border-t border-gray-200 dark:border-dark-border pt-3">
                <TariffConfigEditor
                  tariffs={editedData.tariffs}
                  onChange={(newTariffs) => {
                    setEditedData({ ...editedData, tariffs: newTariffs });
                    if (!isCreateMode && location) {
                      handleFieldSave('tariffs', newTariffs);
                    }
                  }}
                  disabled={false}
                />
              </div>
            </div>
          </div>

          {/* Footer (only for create mode) */}
          {isCreateMode && (
            <div className="border-t border-gray-200 dark:border-dark-border p-4 bg-gray-50 dark:bg-dark-bg-tertiary flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Création...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Créer
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

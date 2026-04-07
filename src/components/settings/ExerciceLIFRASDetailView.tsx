import { logger } from '@/utils/logger';
/**
 * Exercice LIFRAS Detail View
 * Panel for creating/editing LIFRAS exercises
 */

import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { ExerciceLIFRAS, NiveauLIFRAS, NIVEAU_LABELS, NIVEAU_ORDER } from '@/types/lifras.types';
import toast from 'react-hot-toast';

interface ExerciceLIFRASDetailViewProps {
  exercice: ExerciceLIFRAS | null;
  isCreateMode: boolean;
  onClose: () => void;
  onSave: (exercice: Omit<ExerciceLIFRAS, 'id'>) => Promise<void>;
  onUpdate: (exerciceId: string, updates: Partial<ExerciceLIFRAS>) => Promise<void>;
  existingSpecialites?: string[];
}

export function ExerciceLIFRASDetailView({
  exercice,
  isCreateMode,
  onClose,
  onSave,
  onUpdate,
  existingSpecialites = []
}: ExerciceLIFRASDetailViewProps) {
  const [formData, setFormData] = useState<Omit<ExerciceLIFRAS, 'id'>>({
    code: '',
    niveau: 'NB',
    description: '',
    specialite: ''
  });
  const [saving, setSaving] = useState(false);

  // Initialize form when exercice changes
  useEffect(() => {
    if (exercice) {
      setFormData({
        code: exercice.code,
        niveau: exercice.niveau,
        description: exercice.description,
        specialite: exercice.specialite || ''
      });
    } else if (isCreateMode) {
      setFormData({
        code: '',
        niveau: 'NB',
        description: '',
        specialite: ''
      });
    }
  }, [exercice, isCreateMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.code.trim()) {
      toast.error('Le code est requis');
      return;
    }
    if (!formData.description.trim()) {
      toast.error('La description est requise');
      return;
    }

    setSaving(true);
    try {
      // Clean up data before saving
      const dataToSave = {
        ...formData,
        // Only include specialite if niveau is TN and it has a value
        specialite: formData.niveau === 'TN' && formData.specialite?.trim()
          ? formData.specialite.trim()
          : undefined
      };

      if (isCreateMode) {
        await onSave(dataToSave);
        toast.success('Exercice créé avec succès');
      } else if (exercice) {
        await onUpdate(exercice.id, dataToSave);
        toast.success('Exercice mis à jour');
      }
      onClose();
    } catch (error) {
      logger.error('Error saving exercice:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-dark-bg-secondary shadow-xl overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {isCreateMode ? 'Nouvel exercice LIFRAS' : 'Modifier l\'exercice'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Code *
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="Ex: P2.RA"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              Format: [Niveau].[Type][Numéro] (ex: P2.RA, AM.OP)
            </p>
          </div>

          {/* Niveau */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Niveau *
            </label>
            <select
              value={formData.niveau}
              onChange={(e) => {
                const newNiveau = e.target.value as NiveauLIFRAS;
                setFormData({
                  ...formData,
                  niveau: newNiveau,
                  // Clear specialite when changing from TN to another level
                  specialite: newNiveau === 'TN' ? formData.specialite : ''
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
              required
            >
              {NIVEAU_ORDER.map(niveau => (
                <option key={niveau} value={niveau}>
                  {NIVEAU_LABELS[niveau]}
                </option>
              ))}
            </select>
          </div>

          {/* Spécialité - Only shown for TN niveau */}
          {formData.niveau === 'TN' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Spécialité
              </label>
              <input
                type="text"
                value={formData.specialite || ''}
                onChange={(e) => setFormData({ ...formData, specialite: e.target.value })}
                list="specialites-list"
                placeholder="Ex: Nitrox, Combi Étanche..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
              />
              <datalist id="specialites-list">
                {existingSpecialites.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                Tapez le nom de la spécialité pour regrouper les exercices similaires.
                Les suggestions sont basées sur les spécialités déjà utilisées.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description de l'exercice..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary resize-none"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              Incluez les détails importants (profondeur, distance, durée, etc.)
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {isCreateMode ? 'Créer' : 'Enregistrer'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

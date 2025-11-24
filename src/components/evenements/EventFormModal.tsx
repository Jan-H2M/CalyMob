import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Users, Euro, FileText, User } from 'lucide-react';
import { Evenement } from '@/types';
import { cn } from '@/utils/utils';

interface EventFormModalProps {
  event: Evenement | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Partial<Evenement>) => Promise<void>;
}

export function EventFormModal({ event, isOpen, onClose, onSave }: EventFormModalProps) {
  const [formData, setFormData] = useState<Partial<Evenement>>({
    titre: '',
    description: '',
    date_debut: new Date(),
    date_fin: null,
    organisateur_nom: '',
    statut: 'brouillon'
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setFormData({
        ...event,
        date_debut: event.date_debut || new Date(),
        date_fin: event.date_fin || null
      });
    } else {
      setFormData({
        titre: '',
        description: '',
        date_debut: new Date(),
        date_fin: null,
        organisateur_nom: '',
        statut: 'brouillon'
      });
    }
  }, [event, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Evenement, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  const isNewEvent = !event?.id;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel latéral */}
      <div className={cn(
        "fixed right-0 top-0 h-full bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        "w-full max-w-3xl"
      )}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-calypso-blue to-calypso-blue-dark">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {isNewEvent ? 'Nouvel événement' : 'Modifier l\'événement'}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white dark:bg-dark-bg-secondary/10 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {/* Titre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <FileText className="inline h-4 w-4 mr-1" />
                  Titre de l'événement *
                </label>
                <input
                  type="text"
                  required
                  value={formData.titre || ''}
                  onChange={(e) => updateField('titre', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="Ex: Plongée Zélande Avril 2025"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="Description de l'événement..."
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Date de début *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date_debut && !isNaN(new Date(formData.date_debut).getTime()) ? new Date(formData.date_debut).toISOString().split('T')[0] : ''}
                    onChange={(e) => updateField('date_debut', new Date(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Date de fin
                  </label>
                  <input
                    type="date"
                    value={formData.date_fin && !isNaN(new Date(formData.date_fin).getTime()) ? new Date(formData.date_fin).toISOString().split('T')[0] : ''}
                    onChange={(e) => updateField('date_fin', e.target.value ? new Date(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  />
                </div>
              </div>

              {/* Organisateur */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <User className="inline h-4 w-4 mr-1" />
                  Organisateur
                </label>
                <input
                  type="text"
                  value={formData.organisateur_nom || ''}
                  onChange={(e) => updateField('organisateur_nom', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="Nom de l'organisateur"
                />
              </div>

              {/* Lieu */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <MapPin className="inline h-4 w-4 mr-1" />
                  Lieu
                </label>
                <input
                  type="text"
                  value={formData.lieu || ''}
                  onChange={(e) => updateField('lieu', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="Lieu de l'événement"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !formData.titre}
              className={cn(
                "px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors",
                (saving || !formData.titre) && "opacity-50 cursor-not-allowed"
              )}
            >
              {saving ? 'Enregistrement...' : (isNewEvent ? 'Créer l\'événement' : 'Enregistrer')}
            </button>
          </div>
      </div>
    </>
  );
}

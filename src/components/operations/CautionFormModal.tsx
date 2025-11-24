import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Operation } from '@/types';
import toast from 'react-hot-toast';

interface CautionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Operation>) => Promise<void>;
  caution?: Operation | null;
}

export function CautionFormModal({ isOpen, onClose, onSave, caution }: CautionFormModalProps) {
  const [formData, setFormData] = useState({
    titre: caution?.titre || '',
    description: caution?.description || '',
    montant_prevu: caution?.montant_prevu || 0,
    date_caution: caution?.date_debut ? new Date(caution.date_debut).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    statut: caution?.statut || 'brouillon'
  });

  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titre.trim()) {
      toast.error("Le nom de l'emprunteur est obligatoire");
      return;
    }

    if (formData.montant_prevu <= 0) {
      toast.error('Le montant doit être supérieur à 0');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        type: 'caution',
        titre: formData.titre,
        description: formData.description,
        montant_prevu: formData.montant_prevu,
        date_debut: new Date(formData.date_caution),
        statut: formData.statut as any
      });
      onClose();
    } catch (error) {
      console.error('Error saving caution:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            {caution?.id ? 'Modifier la caution' : 'Nouvelle caution'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Nom de l'emprunteur */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Nom de l'emprunteur *
            </label>
            <input
              type="text"
              value={formData.titre}
              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Ex: Jean Dupont"
              required
            />
          </div>

          {/* Montant de la caution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Montant de la caution (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.montant_prevu}
              onChange={(e) => setFormData({ ...formData, montant_prevu: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              required
            />
          </div>

          {/* Date de la caution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Date de la caution *
            </label>
            <input
              type="date"
              value={formData.date_caution}
              onChange={(e) => setFormData({ ...formData, date_caution: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              required
            />
          </div>

          {/* Description (matériel prêté) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description du matériel
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Détails sur le matériel prêté..."
            />
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Statut
            </label>
            <select
              value={formData.statut}
              onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            >
              <option value="brouillon">Brouillon</option>
              <option value="ouvert">En cours (matériel prêté)</option>
              <option value="ferme">Clôturé (matériel rendu)</option>
              <option value="annule">Annulé</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : caution?.id ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * SeasonFormModal
 * Modal for creating/editing a membership season with tariffs and footnotes
 */

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MembershipSeason, MembershipTariff, MembershipFootnote } from '@/types/cotisations.types';

interface SeasonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<MembershipSeason, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<void>;
  season?: MembershipSeason | null; // null = create mode
}

const EMPTY_TARIFF: Omit<MembershipTariff, 'id'> = {
  label: '',
  code: '',
  price_jan_dec: null,
  price_sept_dec: null,
  footnote_ref: '',
  display_order: 0,
};

const EMPTY_FOOTNOTE: MembershipFootnote = {
  ref: '',
  text: '',
};

export function SeasonFormModal({ isOpen, onClose, onSave, season }: SeasonFormModalProps) {
  const [label, setLabel] = useState('');
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [isActive, setIsActive] = useState(false);
  const [tariffs, setTariffs] = useState<MembershipTariff[]>([]);
  const [footnotes, setFootnotes] = useState<MembershipFootnote[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Initialize form with season data or defaults
  useEffect(() => {
    if (season) {
      setLabel(season.label);
      setStartYear(season.start_year);
      setIsActive(season.is_active);
      setTariffs([...season.tariffs]);
      setFootnotes([...season.footnotes]);
    } else {
      setLabel('');
      setStartYear(new Date().getFullYear());
      setIsActive(false);
      setTariffs([]);
      setFootnotes([]);
    }
    setErrors([]);
  }, [season, isOpen]);

  // Auto-generate code from label
  const generateCode = (lbl: string): string => {
    return lbl
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  // Add new tariff row
  const addTariff = () => {
    const newId = `tar_${Date.now()}`;
    setTariffs([
      ...tariffs,
      { ...EMPTY_TARIFF, id: newId, display_order: tariffs.length },
    ]);
  };

  // Update a tariff field
  const updateTariff = (index: number, field: keyof MembershipTariff, value: unknown) => {
    const updated = [...tariffs];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[index] as any)[field] = value;

    // Auto-generate code when label changes
    if (field === 'label' && typeof value === 'string') {
      updated[index].code = generateCode(value);
    }

    setTariffs(updated);
  };

  // Remove a tariff row
  const removeTariff = (index: number) => {
    setTariffs(tariffs.filter((_, i) => i !== index));
  };

  // Add new footnote
  const addFootnote = () => {
    const nextRef = `*${footnotes.length + 1}`;
    setFootnotes([...footnotes, { ...EMPTY_FOOTNOTE, ref: nextRef }]);
  };

  // Update a footnote
  const updateFootnote = (index: number, field: keyof MembershipFootnote, value: string) => {
    const updated = [...footnotes];
    updated[index] = { ...updated[index], [field]: value };
    setFootnotes(updated);
  };

  // Remove a footnote
  const removeFootnote = (index: number) => {
    setFootnotes(footnotes.filter((_, i) => i !== index));
  };

  // Parse price input (allow empty = null)
  const parsePrice = (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    const num = parseFloat(value.replace(',', '.'));
    return isNaN(num) ? null : num;
  };

  // Validate form
  const validate = (): string[] => {
    const errs: string[] = [];
    if (!label.trim()) errs.push('Le libellé du tarif est requis.');
    if (tariffs.length === 0) errs.push('Au moins un tarif est requis.');

    const codes = tariffs.map(t => t.code);
    const uniqueCodes = new Set(codes);
    if (codes.length !== uniqueCodes.size) errs.push('Les codes de tarif doivent être uniques.');

    for (const tariff of tariffs) {
      if (!tariff.label.trim()) errs.push(`Tarif "${tariff.code || '?'}": le libellé est requis.`);
      if (tariff.price_jan_dec === null && tariff.price_sept_dec === null) {
        errs.push(`Tarif "${tariff.label || '?'}": au moins un prix est requis.`);
      }
    }

    return errs;
  };

  // Handle save
  const handleSave = async () => {
    const validationErrors = validate();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      await onSave({
        label,
        start_year: startYear,
        is_active: isActive,
        tariffs: tariffs.map((t, i) => ({ ...t, display_order: i })),
        footnotes,
      });
      onClose();
    } catch (error) {
      setErrors([(error as Error).message || 'Erreur lors de la sauvegarde.']);
    } finally {
      setSaving(false);
    }
  };

  // Year options (current year -1 to +5)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={season ? `Modifier: ${season.label}` : 'Nouveau tarif de cotisation'}
      size="xl"
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
        {/* Errors */}
        {errors.length > 0 && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-red-600 dark:text-red-400">{err}</p>
            ))}
          </div>
        )}

        {/* Season Info */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-muted mb-1">
              Libellé
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Sept 2025"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-muted mb-1">
              Année
            </label>
            <select
              value={startYear}
              onChange={(e) => setStartYear(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {yearOptions.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-dark-text-muted">
            Tarif actif (un seul tarif peut être actif à la fois)
          </span>
        </label>

        {/* Tariffs Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
              Tarifs ({tariffs.length})
            </h4>
            <button
              onClick={addTariff}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>

          {tariffs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-dark-text-muted italic py-4 text-center">
              Aucun tarif. Cliquez sur "Ajouter" pour commencer.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-dark-text-muted px-1">
                <div className="col-span-7">Libellé</div>
                <div className="col-span-2 text-right">Jan→Déc (€)</div>
                <div className="col-span-2 text-right">Sept→Déc+1 (€)</div>
                <div className="col-span-1"></div>
              </div>

              {tariffs.map((tariff, index) => (
                <div key={tariff.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <input
                      type="text"
                      value={tariff.label}
                      onChange={(e) => updateTariff(index, 'label', e.target.value)}
                      placeholder="Membre en 1ère app."
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={tariff.price_jan_dec !== null ? tariff.price_jan_dec.toString() : ''}
                      onChange={(e) => updateTariff(index, 'price_jan_dec', parsePrice(e.target.value))}
                      placeholder="–"
                      className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={tariff.price_sept_dec !== null ? tariff.price_sept_dec.toString() : ''}
                      onChange={(e) => updateTariff(index, 'price_sept_dec', parsePrice(e.target.value))}
                      placeholder="–"
                      className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => removeTariff(index)}
                      className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Footer with Save button */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-muted bg-white dark:bg-dark-bg-tertiary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-secondary transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>
    </Modal>
  );
}

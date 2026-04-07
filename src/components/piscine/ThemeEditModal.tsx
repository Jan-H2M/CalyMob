import React, { useState, useEffect } from 'react';
import { X, BookOpen } from 'lucide-react';
import { PiscineLevel } from '@/types';
import { SessionThemeService } from '@/services/sessionThemeService';
import { SessionTheme, THEME_CATEGORIES } from '@/types/sessionTheme.types';
import { logger } from '@/utils/logger';

interface ThemeEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  level: string;
  currentTheme: string;
  onSave: (theme: string) => Promise<void>;
  isNote?: boolean;  // true for comments (accueil, baptêmes, gonflage), false for themes
  clubId?: string;   // needed to load theme catalog
}

/** Human-readable label for a note/comment key */
const getNoteLabel = (key: string): string => {
  if (key === 'accueil') return 'Accueil';
  if (key === 'baptemes') return 'Baptêmes';
  if (key.startsWith('gonflage_')) return `Gonflage ${key.replace('gonflage_', '')}`;
  return key;
};

/** Extract the piscine niveau (e.g. "2*") from the editing key (e.g. "2*_1ere_heure") */
function extractNiveau(levelKey: string): string | null {
  // Keys: "1*_1ere_heure", "2*_2eme_heure", "AM_1ere_heure", "theorie_20h00", etc.
  const heureMatch = levelKey.match(/^(.+)_(1ere_heure|2eme_heure)$/);
  if (heureMatch) return heureMatch[1];
  // Could be a plain level like "1*"
  if (PiscineLevel.all.includes(levelKey as any)) return levelKey;
  return null;
}

export const ThemeEditModal: React.FC<ThemeEditModalProps> = ({
  isOpen,
  onClose,
  level,
  currentTheme,
  onSave,
  isNote = false,
  clubId
}) => {
  const [theme, setTheme] = useState(currentTheme);
  const [isSaving, setIsSaving] = useState(false);
  const [catalogThemes, setCatalogThemes] = useState<SessionTheme[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [niveauFilter, setNiveauFilter] = useState<string | null>(null);

  useEffect(() => {
    setTheme(currentTheme);
    // Pre-select the niveau filter based on the level being edited
    const n = extractNiveau(level);
    setNiveauFilter(n);
  }, [currentTheme, isOpen, level]);

  // Load theme catalog when modal opens (only for themes, not notes)
  useEffect(() => {
    if (!isOpen || isNote || !clubId) {
      setCatalogThemes([]);
      return;
    }

    setLoadingThemes(true);

    const loadThemes = async () => {
      try {
        // Always load all themes — filtering by niveau requires a composite index
        // and targetNiveaux format may differ from piscine level keys.
        // We show all themes and let the user pick.
        const themes = await SessionThemeService.getThemes(clubId);
        setCatalogThemes(themes);
      } catch (err) {
        logger.error('Error loading theme catalog:', err);
        setCatalogThemes([]);
      } finally {
        setLoadingThemes(false);
      }
    };

    loadThemes();
  }, [isOpen, isNote, clubId, level]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(theme.trim());
      onClose();
    } catch (error) {
      logger.error('Error saving theme:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCatalogTheme = (t: SessionTheme) => {
    setTheme(t.title);
  };

  if (!isOpen) return null;

  // Parse the display label for the modal title
  const niveau = extractNiveau(level);
  const heureMatch = level.match(/(1ere_heure|2eme_heure)$/);
  const heureSuffix = heureMatch
    ? heureMatch[1] === '1ere_heure' ? ' — 1ère heure' : ' — 2ème heure'
    : '';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
              {isNote
                ? `Commentaire — ${getNoteLabel(level)}`
                : `Thème — ${niveau ? PiscineLevel.displayName(niveau) : level}${heureSuffix}`
              }
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Theme catalog dropdown (only for themes, not notes) */}
            {!isNote && catalogThemes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <BookOpen className="w-4 h-4 inline mr-1" />
                  Choisir un thème du catalogue
                </label>

                {/* Niveau filter buttons */}
                <div className="flex flex-wrap gap-1 mb-2">
                  <button
                    type="button"
                    onClick={() => setNiveauFilter(null)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      niveauFilter === null
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Tous
                  </button>
                  {PiscineLevel.all.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNiveauFilter(n)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        niveauFilter === n
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {/* Filtered dropdown */}
                {(() => {
                  const filtered = niveauFilter
                    ? catalogThemes.filter(t => t.targetNiveaux?.includes(niveauFilter))
                    : catalogThemes;
                  return (
                    <select
                      value=""
                      onChange={(e) => {
                        const selected = catalogThemes.find(t => t.id === e.target.value);
                        if (selected) handleSelectCatalogTheme(selected);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="">
                        — Sélectionner un thème{niveauFilter ? ` (${niveauFilter})` : ''} —
                      </option>
                      {filtered.length === 0 && (
                        <option disabled>Aucun thème pour ce niveau</option>
                      )}
                      {THEME_CATEGORIES.map(cat => {
                        const themesInCat = filtered.filter(t => t.category === cat.value);
                        if (themesInCat.length === 0) return null;
                        return (
                          <optgroup key={cat.value} label={cat.label}>
                            {themesInCat.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.title}{!niveauFilter && t.targetNiveaux?.length > 0 ? ` (${t.targetNiveaux.join(', ')})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  );
                })()}
                {loadingThemes && (
                  <p className="text-xs text-gray-400 mt-1">Chargement des thèmes...</p>
                )}
              </div>
            )}

            {!isNote && catalogThemes.length === 0 && !loadingThemes && clubId && (
              <p className="text-xs text-gray-400">
                Aucun thème dans le catalogue{niveau ? ` pour ${PiscineLevel.displayName(niveau)}` : ''}. Ajoutez des thèmes via Formation → Thèmes.
              </p>
            )}

            {/* Free text field */}
            <div>
              {!isNote && catalogThemes.length > 0 && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ou saisir librement
                </label>
              )}
              <textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder={isNote ? "Ajoutez un commentaire..." : "Décrivez le thème de la séance..."}
                className={`w-full ${isNote ? 'h-20' : 'h-24'} px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white
                           placeholder-gray-400 dark:placeholder-gray-500
                           focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           resize-none text-sm`}
                autoFocus={isNote || catalogThemes.length === 0}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300
                         bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                         rounded-lg transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white
                         bg-blue-600 hover:bg-blue-700 rounded-lg
                         transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeEditModal;

import React from 'react';
import { X, Edit2, FileText, ExternalLink, BookOpen, Target } from 'lucide-react';
import { SessionTheme, THEME_CATEGORIES } from '@/types/sessionTheme.types';

interface ThemeDetailModalProps {
  theme: SessionTheme;
  onClose: () => void;
  onEdit: () => void;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
};

export const ThemeDetailModal: React.FC<ThemeDetailModalProps> = ({ theme, onClose, onEdit }) => {
  const categoryLabel = THEME_CATEGORIES.find(c => c.value === theme.category)?.label ?? theme.category;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{theme.title}</h2>          <div className="flex gap-2">
            <button onClick={onEdit}
              className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover">
              <Edit2 className="h-5 w-5" />
            </button>
            <button onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Meta badges */}
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-sm font-medium">
              {categoryLabel}
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-full text-sm">
              {DIFFICULTY_LABELS[theme.difficulty] ?? theme.difficulty}
            </span>
            {theme.targetNiveaux.map((n) => (
              <span key={n} className="px-3 py-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-full text-sm">
                {n}
              </span>
            ))}
          </div>
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Description
            </h3>
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{theme.description}</p>
          </div>

          {/* Instructor Notes */}
          {theme.instructorNotes && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> Notes pour le moniteur
              </h3>
              <p className="text-amber-900 dark:text-amber-200 text-sm whitespace-pre-wrap">
                {theme.instructorNotes}
              </p>
            </div>
          )}

          {/* Related LIFRAS Exercises */}
          {theme.relatedExercices.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" /> Exercices LIFRAS liés
              </h3>
              <div className="space-y-1">
                {theme.relatedExercices.map((ex, i) => (                  <div key={i} className="flex items-center gap-2 text-sm">
                    <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs">
                      {ex.code}
                    </code>
                    <span className="text-gray-700 dark:text-gray-300">{ex.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {theme.documents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents pédagogiques
              </h3>
              <div className="space-y-2">
                {theme.documents.map((doc, i) => (
                  <a
                    key={i}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover text-sm"
                  >
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-blue-600 dark:text-blue-400 flex-1">{doc.name}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400" />                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-dark-border">
            Créé par {theme.createdByName} · Utilisé {theme.timesUsed} fois
            {theme.lastUsedDate && ` · Dernière utilisation: ${theme.lastUsedDate.toLocaleDateString('fr-BE')}`}
          </div>
        </div>
      </div>
    </div>
  );
};
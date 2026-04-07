import React from 'react';
import { Edit2, Trash2, FileText, Clock } from 'lucide-react';
import { SessionTheme, THEME_CATEGORIES } from '@/types/sessionTheme.types';

interface ThemeCardProps {
  theme: SessionTheme;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  debutant: { label: 'Débutant', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  intermediaire: { label: 'Intermédiaire', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  avance: { label: 'Avancé', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

export const ThemeCard: React.FC<ThemeCardProps> = ({ theme, onClick, onEdit, onDelete }) => {
  const categoryLabel = THEME_CATEGORIES.find(c => c.value === theme.category)?.label ?? theme.category;
  const difficultyInfo = DIFFICULTY_LABELS[theme.difficulty] ?? DIFFICULTY_LABELS.intermediaire;

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border
        rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer group"
    >      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 flex-1">
          {theme.title}
        </h3>
        <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
            title="Modifier"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
        {theme.description}
      </p>
      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
          bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          {categoryLabel}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${difficultyInfo.color}`}>
          {difficultyInfo.label}
        </span>
        {theme.targetNiveaux.map((n) => (
          <span key={n} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
            bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {n}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{theme.timesUsed}× utilisé</span>
        </div>
        {theme.documents.length > 0 && (
          <div className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            <span>{theme.documents.length} doc{theme.documents.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
};
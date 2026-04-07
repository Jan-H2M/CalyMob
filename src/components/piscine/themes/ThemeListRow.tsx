import React from 'react';
import { Edit2, Trash2, FileText, Clock, ChevronRight } from 'lucide-react';
import { SessionTheme, THEME_CATEGORIES } from '@/types/sessionTheme.types';

interface ThemeListRowProps {
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
export const ThemeListRow: React.FC<ThemeListRowProps> = ({ theme, onClick, onEdit, onDelete }) => {
  const categoryLabel = THEME_CATEGORIES.find(c => c.value === theme.category)?.label ?? theme.category;
  const difficultyInfo = DIFFICULTY_LABELS[theme.difficulty] ?? DIFFICULTY_LABELS.intermediaire;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-dark-card
        border-b border-gray-100 dark:border-dark-border
        hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer group transition-colors"
    >
      {/* Title & description */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 dark:text-white truncate">
          {theme.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {theme.description}
        </p>
      </div>
      {/* Tags */}
      <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
          bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          {categoryLabel}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${difficultyInfo.color}`}>
          {difficultyInfo.label}
        </span>
        {theme.targetNiveaux.map((n) => (
          <span key={n} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium
            bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {n}
          </span>
        ))}
      </div>

      {/* Meta info */}
      <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 w-24 justify-end">
        {theme.documents.length > 0 && (
          <div className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            <span>{theme.documents.length}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{theme.timesUsed}×</span>
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { SessionThemeService } from '@/services/sessionThemeService';
import { SessionTheme } from '@/types/sessionTheme.types';

interface ThemeSelectorProps {
  clubId: string;
  niveau: string;
  value?: string;         // themeId
  themeTitle?: string;     // for display when no themeId
  onChange: (themeId: string | undefined, themeTitle: string) => void;
  className?: string;
}

/**
 * Dropdown om een thema te selecteren uit de catalogus, gefilterd op niveau.
 * Verschijnt in SessionTimelineCard wanneer feature flag actief is.
 */
export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  clubId, niveau, value, themeTitle, onChange, className,
}) => {
  const [themes, setThemes] = useState<SessionTheme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clubId || !niveau) { setLoading(false); return; }
    SessionThemeService.getThemesForNiveau(clubId, niveau)      .then(setThemes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clubId, niveau]);

  if (loading) {
    return <span className="text-sm text-gray-400">Chargement...</span>;
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <BookOpen className="h-4 w-4 text-gray-400 flex-shrink-0" />
      <select
        value={value ?? ''}
        onChange={(e) => {
          const themeId = e.target.value || undefined;
          const selected = themes.find(t => t.id === themeId);
          onChange(themeId, selected?.title ?? '');
        }}
        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg
          dark:bg-dark-card dark:border-dark-border dark:text-white
          focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">— Choisir un thème —</option>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
    </div>
  );
};
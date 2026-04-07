import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, GraduationCap, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SessionThemeService } from '@/services/sessionThemeService';
import { SessionTheme, ThemeCategory, THEME_CATEGORIES } from '@/types/sessionTheme.types';
import { ThemeCard } from './ThemeCard';
import { ThemeListRow } from './ThemeListRow';
import { ThemeForm } from './ThemeForm';
import { ThemeDetailModal } from './ThemeDetailModal';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

export const ThemeCatalogPage: React.FC = () => {
  const { clubId, user, appUser } = useAuth();
  const [themes, setThemes] = useState<SessionTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ThemeCategory | 'all'>('all');
  const [niveauFilter, setNiveauFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingTheme, setEditingTheme] = useState<SessionTheme | null>(null);
  const [detailTheme, setDetailTheme] = useState<SessionTheme | null>(null);
  const NIVEAUX = ['1*', '2*', '3*', '4*', 'AM', 'MC'];

  // ─── Data Loading ─────────────────────────────────────────────────

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) return;
    const unsubscribe = SessionThemeService.subscribeToThemes(clubId, (data) => {
      setThemes(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      logger.error('[ThemeCatalogPage] Firestore subscription error:', err);
      setError(err.message);
      setLoading(false);
    });
    return unsubscribe;
  }, [clubId]);

  // ─── Filtering ────────────────────────────────────────────────────

  const filteredThemes = themes.filter((theme) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!theme.title.toLowerCase().includes(q) &&
          !theme.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (categoryFilter !== 'all' && theme.category !== categoryFilter) return false;
    if (niveauFilter !== 'all' && !theme.targetNiveaux.includes(niveauFilter)) return false;
    return true;
  });
  // ─── Handlers ─────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    setEditingTheme(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((theme: SessionTheme) => {
    setEditingTheme(theme);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (themeId: string) => {
    if (!confirm('Supprimer ce thème ? Cette action est irréversible.')) return;
    try {
      await SessionThemeService.deleteTheme(clubId, themeId);
      toast.success('Thème supprimé');
    } catch (err) {
      logger.error('[ThemeCatalogPage] Delete error:', err);
      toast.error('Erreur lors de la suppression');
    }
  }, [clubId]);

  const handleFormSave = useCallback(async (data: Omit<SessionTheme, 'id'>) => {
    try {
      if (editingTheme) {
        await SessionThemeService.updateTheme(clubId, editingTheme.id, data);
        toast.success('Thème mis à jour');
      } else {        await SessionThemeService.createTheme(clubId, data);
        toast.success('Thème créé');
      }
      setShowForm(false);
      setEditingTheme(null);
    } catch (err) {
      logger.error('[ThemeCatalogPage] Save error:', err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }, [clubId, editingTheme]);

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-2">
        <p className="font-medium">Erreur de chargement des thèmes</p>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Thèmes de formation          </h1>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouveau thème
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un thème..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg
              dark:bg-dark-card dark:border-dark-border dark:text-white
              focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ThemeCategory | 'all')}          className="px-3 py-2 border border-gray-300 rounded-lg
            dark:bg-dark-card dark:border-dark-border dark:text-white"
        >
          <option value="all">Toutes catégories</option>
          {THEME_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        <select
          value={niveauFilter}
          onChange={(e) => setNiveauFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg
            dark:bg-dark-card dark:border-dark-border dark:text-white"
        >
          <option value="all">Tous niveaux</option>
          {NIVEAUX.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* View toggle + count */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredThemes.length} thème{filteredThemes.length !== 1 ? 's' : ''}
          {(categoryFilter !== 'all' || niveauFilter !== 'all' || searchQuery) && ` (sur ${themes.length})`}
        </span>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-dark-card rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-white dark:bg-dark-hover text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            title="Vue liste"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-dark-hover text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            title="Vue grille"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Theme List / Grid */}
      {filteredThemes.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {themes.length === 0
            ? 'Aucun thème créé. Commencez par ajouter un thème !'
            : 'Aucun thème ne correspond aux filtres.'}
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
          {filteredThemes.map((theme) => (
            <ThemeListRow
              key={theme.id}
              theme={theme}
              onClick={() => setDetailTheme(theme)}
              onEdit={() => handleEdit(theme)}
              onDelete={() => handleDelete(theme.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onClick={() => setDetailTheme(theme)}
              onEdit={() => handleEdit(theme)}
              onDelete={() => handleDelete(theme.id)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ThemeForm
          theme={editingTheme}
          onSave={handleFormSave}
          onClose={() => { setShowForm(false); setEditingTheme(null); }}
        />
      )}

      {/* Detail Modal */}
      {detailTheme && (
        <ThemeDetailModal
          theme={detailTheme}
          onClose={() => setDetailTheme(null)}
          onEdit={() => { setDetailTheme(null); handleEdit(detailTheme); }}
        />
      )}
    </div>
  );
};
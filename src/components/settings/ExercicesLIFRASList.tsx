import { logger } from '@/utils/logger';
/**
 * Exercices LIFRAS List
 * Simple list of LIFRAS exercises filtered by level
 */

import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Upload, Edit2 } from 'lucide-react';
import { ExerciceLIFRAS, NiveauLIFRAS, NIVEAU_LABELS, NIVEAU_ORDER } from '@/types/lifras.types';
import { lifrasService } from '@/services/lifrasService';
import { ExerciceLIFRASDetailView } from './ExerciceLIFRASDetailView';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export function ExercicesLIFRASList() {
  const { clubId } = useAuth();
  const [exercices, setExercices] = useState<ExerciceLIFRAS[]>([]);
  const [selectedNiveau, setSelectedNiveau] = useState<NiveauLIFRAS | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedExercice, setSelectedExercice] = useState<ExerciceLIFRAS | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load exercices
  useEffect(() => {
    const loadExercices = async () => {
      if (!clubId) {
        logger.debug('[ExercicesLIFRAS] No clubId, skipping load');
        return;
      }

      try {
        setLoading(true);
        logger.debug('[ExercicesLIFRAS] Loading exercices for club:', clubId);
        const data = await lifrasService.getAllExercices(clubId);
        logger.debug('[ExercicesLIFRAS] Loaded exercices:', data.length, data);
        setExercices(data);
      } catch (error) {
        logger.error('Error loading exercices:', error);
        toast.error('Erreur lors du chargement des exercices');
      } finally {
        setLoading(false);
      }
    };

    loadExercices();
  }, [clubId]);

  // Filter exercices
  const filteredExercices = exercices.filter(exercice => {
    // Filter by niveau
    if (selectedNiveau !== 'all' && exercice.niveau !== selectedNiveau) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        exercice.code.toLowerCase().includes(query) ||
        exercice.description.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Group exercices by niveau for display
  const groupedExercices = NIVEAU_ORDER.reduce((acc, niveau) => {
    const niveauExercices = filteredExercices.filter(ex => ex.niveau === niveau);
    if (niveauExercices.length > 0) {
      acc[niveau] = niveauExercices;
    }
    return acc;
  }, {} as Record<NiveauLIFRAS, ExerciceLIFRAS[]>);

  // Get badge color for niveau
  const getNiveauColor = (niveau: NiveauLIFRAS) => {
    switch (niveau) {
      case 'TN': return 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300';
      case 'NB': return 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-gray-800 dark:text-gray-300';
      case 'P2': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'P3': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'P4': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      case 'AM': return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
      case 'MC': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary';
    }
  };

  // Group TN exercises by specialite and sort: theory first, then dives in order
  const groupBySpecialite = (exercices: ExerciceLIFRAS[]) => {
    const grouped = exercices.reduce((acc, ex) => {
      const key = ex.specialite || 'Autres';
      if (!acc[key]) acc[key] = [];
      acc[key].push(ex);
      return acc;
    }, {} as Record<string, ExerciceLIFRAS[]>);

    // Sort exercises: theory (T, Theorie) first, then by code
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => {
        const descA = a.description.toLowerCase();
        const descB = b.description.toLowerCase();
        const codeA = a.code.toLowerCase();
        const codeB = b.code.toLowerCase();

        // Check if it's theory (T suffix or contains "theorie/théorie")
        const isTheoryA = codeA.endsWith('.t') || descA.includes('theorie') || descA.includes('théorie');
        const isTheoryB = codeB.endsWith('.t') || descB.includes('theorie') || descB.includes('théorie');

        // Theory comes first
        if (isTheoryA && !isTheoryB) return -1;
        if (!isTheoryA && isTheoryB) return 1;

        // Then sort by code
        return a.code.localeCompare(b.code);
      });
    });

    return grouped;
  };

  // Get existing specialites for autocomplete
  const existingSpecialites = [...new Set(
    exercices
      .filter(ex => ex.niveau === 'TN' && ex.specialite)
      .map(ex => ex.specialite as string)
  )].sort();

  const handleDelete = async (exerciceId: string) => {
    if (!clubId) return;

    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet exercice ?')) {
      try {
        await lifrasService.deleteExercice(clubId, exerciceId);
        setExercices(exercices.filter(ex => ex.id !== exerciceId));
        toast.success('Exercice supprimé');
      } catch (error) {
        logger.error('Error deleting exercice:', error);
        toast.error('Erreur lors de la suppression');
      }
    }
  };

  // Create new exercice
  const handleCreate = async (data: Omit<ExerciceLIFRAS, 'id'>) => {
    if (!clubId) return;

    try {
      const id = await lifrasService.saveExercice(clubId, data);
      // Reload exercices
      const updatedExercices = await lifrasService.getAllExercices(clubId);
      setExercices(updatedExercices);
      setIsCreating(false);
    } catch (error) {
      logger.error('Error creating exercice:', error);
      throw error;
    }
  };

  // Update exercice
  const handleUpdate = async (exerciceId: string, updates: Partial<ExerciceLIFRAS>) => {
    if (!clubId) return;

    try {
      await lifrasService.saveExercice(clubId, updates as Omit<ExerciceLIFRAS, 'id'>, exerciceId);
      // Update local state
      setExercices(exercices.map(ex =>
        ex.id === exerciceId ? { ...ex, ...updates } : ex
      ));
      setSelectedExercice(null);
    } catch (error) {
      logger.error('Error updating exercice:', error);
      throw error;
    }
  };

  // Import default LIFRAS exercises
  const handleImportDefault = async () => {
    if (!clubId) return;

    if (exercices.length > 0) {
      if (!window.confirm('Cette action va remplacer tous les exercices existants. Continuer ?')) {
        return;
      }
    }

    const LIFRAS_EXERCISES = [
      // NB - Non Breveté
      { code: 'P1.PL2', niveau: 'NB' as NiveauLIFRAS, description: 'Vidage de masque + passage d\'embout' },
      { code: 'P1.PL3', niveau: 'NB' as NiveauLIFRAS, description: 'Flottabilité + 50 m palmage + largage du lest' },
      { code: 'P1.PL4', niveau: 'NB' as NiveauLIFRAS, description: 'Orientation' },
      { code: 'P1.PL5', niveau: 'NB' as NiveauLIFRAS, description: 'Plongée d\'expérience' },

      // Plongeur 2★
      { code: 'P2.SU1', niveau: 'P2' as NiveauLIFRAS, description: '500 m tuba, tout équipé' },
      { code: 'P2.SU2', niveau: 'P2' as NiveauLIFRAS, description: '100 m dos équipé + 3 cycles sans masque' },
      { code: 'P2.RA', niveau: 'P2' as NiveauLIFRAS, description: 'Remontée assistée 20 m' },
      { code: 'P2.RT', niveau: 'P2' as NiveauLIFRAS, description: 'Remontée technique 20 m → 15 m' },
      { code: 'P2.RS', niveau: 'P2' as NiveauLIFRAS, description: 'Sauvetage 5 m + remorquage 50 m' },
      { code: 'P2.REA', niveau: 'P2' as NiveauLIFRAS, description: 'Réanimation d\'un plongeur' },

      // Plongeur 3★
      { code: 'P3.SU', niveau: 'P3' as NiveauLIFRAS, description: '1000 m tuba' },
      { code: 'P3.DP1', niveau: 'P3' as NiveauLIFRAS, description: 'Direction de palanquée' },
      { code: 'P3.DP2', niveau: 'P3' as NiveauLIFRAS, description: 'Direction de palanquée' },
      { code: 'P3.DP3', niveau: 'P3' as NiveauLIFRAS, description: 'Direction de palanquée' },
      { code: 'P3.RA', niveau: 'P3' as NiveauLIFRAS, description: 'Remontée assistée 30 m' },
      { code: 'P3.PL', niveau: 'P3' as NiveauLIFRAS, description: 'Plongée profonde 30 m' },

      // Plongeur 4★
      { code: 'P4.RA', niveau: 'P4' as NiveauLIFRAS, description: 'Remontée assistée 40 m' },
      { code: 'P4.RT', niveau: 'P4' as NiveauLIFRAS, description: 'Remontée technique 40 m → 15 m' },
      { code: 'P4.RS', niveau: 'P4' as NiveauLIFRAS, description: 'Sauvetage profond 15 m + remorquage 150 m' },
      { code: 'P4.PE40', niveau: 'P4' as NiveauLIFRAS, description: 'Première plongée 40 m avec élève' },
      { code: 'P4.PM1', niveau: 'P4' as NiveauLIFRAS, description: 'Plongée planifiée (déco + parachute)' },
      { code: 'P4.PM2', niveau: 'P4' as NiveauLIFRAS, description: 'Plongée planifiée (déco + parachute)' },
      { code: 'P4.PM3', niveau: 'P4' as NiveauLIFRAS, description: 'Plongée planifiée (déco + parachute)' },

      // Assistant Moniteur
      { code: 'AM.OP', niveau: 'AM' as NiveauLIFRAS, description: 'Organisation plongée club ≥ 8 plongeurs' },
      { code: 'AM.DB1', niveau: 'AM' as NiveauLIFRAS, description: 'Deux directions de baptême' },
      { code: 'AM.SAU', niveau: 'AM' as NiveauLIFRAS, description: 'Sauvetage d\'un noyé' },

      // Moniteur Club
      { code: 'MC.OP', niveau: 'MC' as NiveauLIFRAS, description: 'Organisation sortie club ≥ 6 palanquées' },
      { code: 'MC.RP', niveau: 'MC' as NiveauLIFRAS, description: 'Sauvetage profond' }
    ];

    try {
      toast.loading('Import des exercices LIFRAS...');
      await lifrasService.importExercices(clubId, LIFRAS_EXERCISES);

      // Reload exercices
      const data = await lifrasService.getAllExercices(clubId);
      setExercices(data);

      toast.dismiss();
      toast.success(`${LIFRAS_EXERCISES.length} exercices LIFRAS importés !`);
    } catch (error) {
      logger.error('Error importing exercices:', error);
      toast.dismiss();
      toast.error('Erreur lors de l\'import');
    }
  };

  if (!clubId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleImportDefault}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
        >
          <Upload className="h-4 w-4" />
          Importer les exercices LIFRAS
        </button>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
        >
          <Plus className="h-4 w-4" />
          Nouvel exercice
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4 space-y-4">

        {/* Niveau Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
            Filtrer par niveau
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedNiveau('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedNiveau === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-primary'
              }`}
            >
              Tous
            </button>
            {NIVEAU_ORDER.map(niveau => (
              <button
                key={niveau}
                onClick={() => setSelectedNiveau(niveau)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedNiveau === niveau
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-primary'
                }`}
              >
                {NIVEAU_LABELS[niveau]}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
          <input
            type="text"
            placeholder="Rechercher par code ou description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted"
          />
        </div>
      </div>

      {/* Exercices List */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              <p className="text-gray-500 dark:text-dark-text-muted mt-2">
                Chargement...
              </p>
            </div>
          </div>
        ) : filteredExercices.length === 0 ? (
          <div className="text-center py-12">
            <Search className="mx-auto h-12 w-12 text-gray-400 dark:text-dark-text-muted mb-4" />
            <p className="text-gray-500 dark:text-dark-text-muted">
              {searchQuery || selectedNiveau !== 'all'
                ? 'Aucun exercice trouvé avec ces critères'
                : 'Aucun exercice pour le moment'}
            </p>
            <p className="text-gray-400 dark:text-dark-text-muted text-sm mt-1">
              Les exercices doivent être importés depuis le fichier LIFRAS
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {Object.entries(groupedExercices).map(([niveau, niveauExercices], index) => (
              <div key={niveau}>
                {/* Niveau Header */}
                <div className="px-6 py-3 bg-gray-50 dark:bg-dark-bg-tertiary">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getNiveauColor(niveau as NiveauLIFRAS)}`}>
                      {niveau}
                    </span>
                    <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                      {NIVEAU_LABELS[niveau as NiveauLIFRAS]}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-dark-text-muted">
                      ({niveauExercices.length} exercices)
                    </span>
                  </div>
                  {/* Info text for TN section */}
                  {niveau === 'TN' && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-dark-text-muted">
                      Ces exercices sont accessibles à tous les niveaux. Ils sont regroupés par spécialité.
                    </p>
                  )}
                </div>

                {/* For TN: Group by specialite */}
                {niveau === 'TN' ? (
                  <div className="divide-y divide-gray-100 dark:divide-dark-border/50">
                    {Object.entries(groupBySpecialite(niveauExercices))
                      .sort(([a], [b]) => a === 'Autres' ? 1 : b === 'Autres' ? -1 : a.localeCompare(b))
                      .map(([specialite, specExercices]) => (
                      <div key={specialite}>
                        {/* Specialite Sub-header */}
                        <div className="px-6 py-2 bg-teal-50/50 dark:bg-teal-900/10 border-l-4 border-teal-400 dark:border-teal-600">
                          <span className="text-sm font-medium text-teal-700 dark:text-teal-300">
                            {specialite}
                          </span>
                          <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">
                            ({specExercices.length})
                          </span>
                        </div>
                        {/* Exercices for this specialite */}
                        <table className="w-full">
                          <tbody className="divide-y divide-gray-100 dark:divide-dark-border/50">
                            {specExercices.map(exercice => (
                              <tr key={exercice.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary/30 transition-colors">
                                <td className="px-6 py-3 text-sm font-mono text-gray-900 dark:text-dark-text-primary w-32">
                                  {exercice.code}
                                </td>
                                <td className="px-6 py-3 text-sm text-gray-700 dark:text-dark-text-primary">
                                  {exercice.description}
                                </td>
                                <td className="px-6 py-3 text-right w-24">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setSelectedExercice(exercice)}
                                      className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                      title="Modifier"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(exercice.id)}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                      title="Supprimer"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Standard table for other niveaux */
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-dark-bg-tertiary/50">
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                          Code
                        </th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                          Description
                        </th>
                        <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border/50">
                      {niveauExercices.map(exercice => (
                        <tr key={exercice.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary/30 transition-colors">
                          <td className="px-6 py-3 text-sm font-mono text-gray-900 dark:text-dark-text-primary">
                            {exercice.code}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700 dark:text-dark-text-primary">
                            {exercice.description}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setSelectedExercice(exercice)}
                                className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                title="Modifier"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(exercice.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Visual separator after TN section */}
                {niveau === 'TN' && Object.keys(groupedExercices).length > 1 && (
                  <div className="border-t-2 border-dashed border-gray-300 dark:border-dark-border dark:border-gray-600 my-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {(selectedExercice || isCreating) && (
        <ExerciceLIFRASDetailView
          exercice={selectedExercice}
          isCreateMode={isCreating}
          onClose={() => {
            setSelectedExercice(null);
            setIsCreating(false);
          }}
          onSave={handleCreate}
          onUpdate={handleUpdate}
          existingSpecialites={existingSpecialites}
        />
      )}
    </div>
  );
}

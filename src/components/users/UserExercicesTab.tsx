import { logger } from '@/utils/logger';
/**
 * Onglet Exercices pour UserDetailView
 * Affiche la liste des exercices LIFRAS validés par un membre
 */

import { useState, useEffect } from 'react';
import { Calendar, MapPin, User as UserIcon, Award, Info } from 'lucide-react';
import { ExerciceValide } from '@/types/exerciceValide.types';
import { exerciceValideService } from '@/services/exerciceValideService';
import { NIVEAU_LABELS } from '@/types/lifras.types';
import { formatDate } from '@/utils/utils';

interface UserExercicesTabProps {
  clubId: string;
  memberId: string;
}

export function UserExercicesTab({ clubId, memberId }: UserExercicesTabProps) {
  const [exercices, setExercices] = useState<ExerciceValide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadExercices = async () => {
      if (!clubId || !memberId) return;

      setLoading(true);
      setError(null);
      try {
        const data = await exerciceValideService.getExercicesValides(clubId, memberId);
        setExercices(data);
      } catch (err) {
        logger.error('Error loading exercices:', err);
        setError('Impossible de charger les exercices');
      } finally {
        setLoading(false);
      }
    };

    loadExercices();
  }, [clubId, memberId]);

  // Obtenir la couleur du badge pour le niveau
  const getNiveauColor = (niveau: string) => {
    switch (niveau) {
      case 'TN': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300';
      case 'NB': return 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-gray-800 dark:text-gray-300';
      case 'P2': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'P3': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'P4': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'AM': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'MC': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      default: return 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-gray-800 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
          <Award className="h-5 w-5 text-purple-500" />
          Exercices validés
        </h3>
        <span className="text-sm text-gray-500 dark:text-dark-text-muted">
          {exercices.length} exercice{exercices.length !== 1 ? 's' : ''}
        </span>
      </div>

      {exercices.length === 0 ? (
        <div className="text-center py-8">
          <Award className="h-12 w-12 text-gray-300 dark:text-dark-text-secondary mx-auto mb-3" />
          <p className="text-gray-500 dark:text-dark-text-muted">
            Aucun exercice validé pour le moment
          </p>
          <p className="text-sm text-gray-400 dark:text-dark-text-muted mt-2">
            Les exercices sont enregistrés via l'application mobile
          </p>
        </div>
      ) : (
        <>
          {/* Liste des exercices */}
          <div className="space-y-3">
            {exercices.map((exercice) => (
              <div
                key={exercice.id}
                className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 border border-gray-200 dark:border-dark-border"
              >
                {/* Ligne 1: Code et description */}
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getNiveauColor(exercice.exercice_niveau)}`}>
                    {exercice.exercice_niveau}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {exercice.exercice_code}
                      </span>
                      {exercice.exercice_specialite && (
                        <span className="text-xs text-teal-600 dark:text-teal-400">
                          ({exercice.exercice_specialite})
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-dark-text-primary mt-0.5">
                      {exercice.exercice_description}
                    </p>
                  </div>
                </div>

                {/* Ligne 2: Date et moniteur */}
                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 dark:text-dark-text-muted">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(exercice.date_validation)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-4 w-4" />
                    <span>{exercice.moniteur_nom}</span>
                  </div>
                  {exercice.lieu && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      <span>{exercice.lieu}</span>
                    </div>
                  )}
                </div>

                {/* Notes si présentes */}
                {exercice.notes && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary italic">
                    {exercice.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-dark-text-muted bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
            <p>Les exercices sont enregistrés et modifiés via l'application mobile par les moniteurs.</p>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  BarChart3, Users, CheckCircle2, Clock, AlertCircle,
  TrendingDown, TrendingUp, Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MemberObservationService } from '@/services/memberObservationService';
import { MemberObservation, ObservationResult, ObservationCategory } from '@/types/memberObservation.types';
import { useCarnetFormationGuard } from '@/hooks/useFeatureFlags';

function getCurrentSeason(): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 7, 1); // Sep 1 of current year
  const end = new Date();
  return { start, end };
}

function getSeasonLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() < 8
    ? `${year - 1}-${year}`
    : `${year}-${year + 1}`;
}

interface EncadrantStats {
  observerId: string;
  observerName: string;
  total: number;
  acquis: number;
  enProgres: number;
  aRevoir: number;
  membersEvaluated: Set<string>;
  lastObservationDate: Date;
}

interface ExerciseStats {
  code: string;
  description: string;
  total: number;
  acquis: number;
  enProgres: number;
  aRevoir: number;
  pourcentageReussi: number;
  pourcentageDifficile: number;
}

interface CategoryStats {
  category: ObservationCategory;
  total: number;
  acquis: number;
  enProgres: number;
  aRevoir: number;
}

export function StatistiquesPage() {
  const { clubId } = useAuth();
  const { visible } = useCarnetFormationGuard(clubId);
  const [activeTab, setActiveTab] = useState<'encadrants' | 'global'>('encadrants');
  const [observations, setObservations] = useState<MemberObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'count' | 'recent'>('count');

  // Load observations
  useEffect(() => {
    setLoading(true);
    const { start, end } = getCurrentSeason();

    // Firestore has no easy way to query without a niveau,
    // so we'll load all and filter locally
    // For now, use a collection group query approach if available
    // Otherwise, load from multiple niveaux
    const loadAllObservations = async () => {
      try {
        // Try to load a broad set - we can't query across all without a field constraint
        // So we'll fetch from different niveaux and combine
        const niveaux = ['NB', '1*', '2*', '3*', '4*', 'AM', 'MC'];
        const allObs: MemberObservation[] = [];

        for (const niveau of niveaux) {
          try {
            const obs = await MemberObservationService.getObservationsForNiveau(
              clubId, niveau, start, end
            );
            allObs.push(...obs);
          } catch (err) {
            // Niveau might not have observations
            console.warn(`[Stats] Failed to load niveau ${niveau}:`, err);
          }
        }

        // Deduplicate by id
        const deduped = Array.from(
          new Map(allObs.map(o => [o.id, o])).values()
        );
        setObservations(deduped);
      } catch (err) {
        console.error('[Stats] Failed to load observations:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAllObservations();
  }, [clubId]);

  // Compute encadrant stats
  const encadrantStatsMap = new Map<string, EncadrantStats>();
  for (const obs of observations) {
    const key = obs.observerId;
    const existing = encadrantStatsMap.get(key) || {
      observerId: key,
      observerName: obs.observerName,
      total: 0,
      acquis: 0,
      enProgres: 0,
      aRevoir: 0,
      membersEvaluated: new Set<string>(),
      lastObservationDate: new Date(0),
    };

    existing.total++;
    if (obs.result === 'acquis') existing.acquis++;
    else if (obs.result === 'en_progres') existing.enProgres++;
    else if (obs.result === 'a_revoir') existing.aRevoir++;

    existing.membersEvaluated.add(obs.memberId);

    if (obs.contextDate > existing.lastObservationDate) {
      existing.lastObservationDate = obs.contextDate;
    }

    encadrantStatsMap.set(key, existing);
  }

  const encadrantStats = Array.from(encadrantStatsMap.values()).sort((a, b) => {
    if (sortBy === 'count') {
      return b.total - a.total;
    } else {
      return b.lastObservationDate.getTime() - a.lastObservationDate.getTime();
    }
  });

  // Compute exercise stats
  const exerciseStatsMap = new Map<string, ExerciseStats>();
  for (const obs of observations) {
    if (obs.category !== 'exercice_lifras' || !obs.exerciceCode) continue;

    const key = obs.exerciceCode;
    const existing = exerciseStatsMap.get(key) || {
      code: key,
      description: obs.exerciceDescription || key,
      total: 0,
      acquis: 0,
      enProgres: 0,
      aRevoir: 0,
      pourcentageReussi: 0,
      pourcentageDifficile: 0,
    };

    existing.total++;
    if (obs.result === 'acquis') existing.acquis++;
    else if (obs.result === 'en_progres') existing.enProgres++;
    else if (obs.result === 'a_revoir') existing.aRevoir++;

    existing.pourcentageReussi = (existing.acquis / existing.total) * 100;
    existing.pourcentageDifficile = (existing.aRevoir / existing.total) * 100;

    exerciseStatsMap.set(key, existing);
  }

  const exerciseStats = Array.from(exerciseStatsMap.values());
  const hardestExercises = exerciseStats
    .sort((a, b) => b.pourcentageDifficile - a.pourcentageDifficile)
    .slice(0, 5);

  const easiestExercises = exerciseStats
    .sort((a, b) => b.pourcentageReussi - a.pourcentageReussi)
    .slice(0, 5);

  // Compute category stats
  const categoryStatsMap = new Map<ObservationCategory, CategoryStats>();
  for (const obs of observations) {
    const category = obs.category;
    const existing = categoryStatsMap.get(category) || {
      category,
      total: 0,
      acquis: 0,
      enProgres: 0,
      aRevoir: 0,
    };

    existing.total++;
    if (obs.result === 'acquis') existing.acquis++;
    else if (obs.result === 'en_progres') existing.enProgres++;
    else if (obs.result === 'a_revoir') existing.aRevoir++;

    categoryStatsMap.set(category, existing);
  }

  const categoryStats = Array.from(categoryStatsMap.values())
    .sort((a, b) => b.total - a.total);

  // Global totals
  const totalObs = observations.length;
  const totalAcquis = observations.filter(o => o.result === 'acquis').length;
  const totalEnProgres = observations.filter(o => o.result === 'en_progres').length;
  const totalARevoir = observations.filter(o => o.result === 'a_revoir').length;
  const uniqueMembers = new Set(observations.map(o => o.memberId)).size;

  if (!visible) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Statistiques de formation
          </h1>
        </div>
        <span className="text-sm text-gray-500">Saison {getSeasonLabel()}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('encadrants')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'encadrants'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Par encadrant
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'global'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4 inline mr-2" />
          Vue globale
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <BarChart3 className="w-5 h-5 mr-2 animate-pulse" /> Chargement des statistiques...
        </div>
      ) : activeTab === 'encadrants' ? (
        <div className="space-y-6">
          {/* Sort controls */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('count')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === 'count'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              Trier par nombre
            </button>
            <button
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === 'recent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              Trier par récent
            </button>
          </div>

          {/* Encadrants table */}
          {encadrantStats.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              Aucune observation
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Encadrant</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Observations</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Membres évalués</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Acquis</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">En progrès</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">À revoir</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Dernière obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {encadrantStats.map(stats => (
                    <tr key={stats.observerId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white">
                        {stats.observerName || 'Inconnu'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-600 dark:text-gray-400">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          {stats.total}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-600 dark:text-gray-400">
                        {stats.membersEvaluated.size}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          {stats.acquis}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                          {stats.enProgres}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          {stats.aRevoir}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-600 dark:text-gray-400">
                        {stats.lastObservationDate.toLocaleDateString('fr-BE')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Global stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{totalObs}</div>
              <div className="text-sm text-blue-600 dark:text-blue-300">Observations totales</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="text-3xl font-bold text-green-700 dark:text-green-400">{totalAcquis}</div>
              <div className="text-sm text-green-600 dark:text-green-300">Acquis</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
              <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-400">{totalEnProgres}</div>
              <div className="text-sm text-yellow-600 dark:text-yellow-300">En progrès</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <div className="text-3xl font-bold text-red-700 dark:text-red-400">{totalARevoir}</div>
              <div className="text-sm text-red-600 dark:text-red-300">À revoir</div>
            </div>
          </div>

          {/* Result distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Distribution des résultats</h3>
            {totalObs === 0 ? (
              <div className="text-gray-400 text-sm">Aucune observation</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Acquis</span>
                    <span className="font-medium text-gray-800 dark:text-white">
                      {totalAcquis} ({((totalAcquis / totalObs) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${(totalAcquis / totalObs) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">En progrès</span>
                    <span className="font-medium text-gray-800 dark:text-white">
                      {totalEnProgres} ({((totalEnProgres / totalObs) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400"
                      style={{ width: `${(totalEnProgres / totalObs) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">À revoir</span>
                    <span className="font-medium text-gray-800 dark:text-white">
                      {totalARevoir} ({((totalARevoir / totalObs) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-400"
                      style={{ width: `${(totalARevoir / totalObs) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Exercices les plus difficiles */}
          {hardestExercises.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  Exercices les plus difficiles
                </h3>
              </div>
              <div className="space-y-3">
                {hardestExercises.map(ex => (
                  <div key={ex.code} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white">{ex.description}</div>
                        <div className="text-xs text-gray-500">{ex.total} observations</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                          {ex.pourcentageDifficile.toFixed(1)}% à revoir
                        </div>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400"
                        style={{ width: `${ex.pourcentageDifficile}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercices les plus réussis */}
          {easiestExercises.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  Exercices les plus réussis
                </h3>
              </div>
              <div className="space-y-3">
                {easiestExercises.map(ex => (
                  <div key={ex.code} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white">{ex.description}</div>
                        <div className="text-xs text-gray-500">{ex.total} observations</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                          {ex.pourcentageReussi.toFixed(1)}% acquis
                        </div>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400"
                        style={{ width: `${ex.pourcentageReussi}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category distribution */}
          {categoryStats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Distribution par catégorie</h3>
              <div className="space-y-4">
                {categoryStats.map(cat => (
                  <div key={cat.category}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400 font-medium capitalize">
                        {cat.category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">{cat.total} obs.</span>
                    </div>
                    <div className="flex gap-0.5 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="bg-green-400"
                        style={{ width: `${(cat.acquis / cat.total) * 100}%` }}
                      />
                      <div
                        className="bg-yellow-400"
                        style={{ width: `${(cat.enProgres / cat.total) * 100}%` }}
                      />
                      <div
                        className="bg-red-400"
                        style={{ width: `${(cat.aRevoir / cat.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

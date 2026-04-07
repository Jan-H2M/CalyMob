/**
 * CotisationsSettingsPage
 * Admin page for managing membership tariff seasons
 * Layout: slider to go back in time + full-width multi-season table
 * Accessible via /parametres/cotisations
 */
import { logger } from '@/utils/logger';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, CheckCircle, ArrowLeft, CreditCard } from 'lucide-react';
import { MembershipSeason } from '@/types/cotisations.types';
import { MembershipSeasonService } from '@/services/membershipSeasonService';
import { SeasonTariffTable } from './SeasonTariffTable';
import { SeasonFormModal } from './SeasonFormModal';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { seedSept2025Tariffs, seed2024Tariffs } from '@/utils/seedMembershipData';

export function CotisationsSettingsPage() {
  const { clubId, user } = useAuth();
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<MembershipSeason[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<MembershipSeason | null>(null);
  const [loading, setLoading] = useState(true);

  // Slider: how many seasons to show (1 = only newest, max = all)
  const [visibleCount, setVisibleCount] = useState(1);

  // Load seasons — guard inside effect, NOT an early return before hooks
  useEffect(() => {
    const loadSeasons = async () => {
      if (!clubId) return;
      try {
        setLoading(true);
        const data = await MembershipSeasonService.getAllSeasons(clubId);
        setSeasons(data);
        setVisibleCount(data.length);
      } catch (error) {
        logger.error('Error loading seasons:', error);
        toast.error('Erreur lors du chargement des cotisations');
      } finally {
        setLoading(false);
      }
    };
    loadSeasons();
  }, [clubId]);

  // Seasons sorted newest first, sliced by visible count
  const sortedSeasons = useMemo(() => {
    return [...seasons].sort((a, b) => b.start_year - a.start_year);
  }, [seasons]);

  const visibleSeasons = useMemo(() => {
    return sortedSeasons.slice(0, visibleCount);
  }, [sortedSeasons, visibleCount]);

  // Slider labels (years from newest to oldest)
  const sliderYears = sortedSeasons.map(s => s.label);

  // Handle create/update
  const handleSave = async (data: Omit<MembershipSeason, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    if (!clubId || !user) return;

    if (editingSeason) {
      await MembershipSeasonService.updateSeason(clubId, editingSeason.id, data);
      toast.success('Tarif mis à jour');
    } else {
      await MembershipSeasonService.createSeason(clubId, user.uid, data);
      toast.success('Nouveau tarif créé');
    }
    const updated = await MembershipSeasonService.getAllSeasons(clubId);
    setSeasons(updated);
    setVisibleCount(prev => Math.min(updated.length, prev + (editingSeason ? 0 : 1)));
  };

  // Handle delete
  const handleDelete = async (season: MembershipSeason) => {
    if (!clubId) return;
    if (season.is_active) {
      toast.error('Impossible de supprimer un tarif actif');
      return;
    }
    if (!confirm(`Supprimer le tarif "${season.label}" ?`)) return;

    try {
      await MembershipSeasonService.deleteSeason(clubId, season.id);
      toast.success('Tarif supprimé');
      const updated = await MembershipSeasonService.getAllSeasons(clubId);
      setSeasons(updated);
      setVisibleCount(prev => Math.min(updated.length, prev));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // Handle set active
  const handleSetActive = async (season: MembershipSeason) => {
    if (!clubId) return;
    try {
      await MembershipSeasonService.setActiveSeason(clubId, season.id);
      toast.success(`"${season.label}" est maintenant le tarif actif`);
      const updated = await MembershipSeasonService.getAllSeasons(clubId);
      setSeasons(updated);
    } catch (error) {
      toast.error('Erreur lors de l\'activation');
    }
  };

  // Open modal for create/edit
  const openCreate = () => {
    setEditingSeason(null);
    setIsModalOpen(true);
  };

  const openEdit = (season: MembershipSeason) => {
    setEditingSeason(season);
    setIsModalOpen(true);
  };

  // Safety check — placed after all hooks to respect Rules of Hooks
  if (!clubId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/parametres')}
          className="p-2 text-gray-400 hover:text-gray-600 dark:text-dark-text-muted dark:hover:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CreditCard className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                Cotisations
              </h1>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">
                Gestion des tarifs de cotisation par saison
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {seasons.length > 0 && !seasons.some(s => s.start_year === 2024) && (
            <button
              onClick={async () => {
                if (!clubId || !user) return;
                try {
                  const id = await seed2024Tariffs(clubId, user.uid);
                  if (id) {
                    toast.success('Tarifs 2024 créés !');
                    const data = await MembershipSeasonService.getAllSeasons(clubId);
                    setSeasons(data);
                    setVisibleCount(data.length);
                  }
                } catch (error) {
                  toast.error('Erreur lors de la création');
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter 2024
            </button>
          )}
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouveau tarif
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : seasons.length === 0 ? (
        /* Empty state */
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 text-gray-300 dark:text-dark-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
            Aucun tarif de cotisation
          </h3>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-4">
            Créez votre premier tarif de cotisation pour commencer.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={async () => {
                if (!clubId || !user) return;
                try {
                  const id = await seedSept2025Tariffs(clubId, user.uid);
                  await seed2024Tariffs(clubId, user.uid);
                  if (id) {
                    toast.success('Tarifs Sept 2025 + 2024 créés !');
                    const data = await MembershipSeasonService.getAllSeasons(clubId);
                    setSeasons(data);
                    setVisibleCount(data.length);
                  } else {
                    toast('Des tarifs existent déjà');
                  }
                } catch (error) {
                  toast.error('Erreur lors de la création des tarifs');
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors"
            >
              Charger tarifs Sept 2025 + 2024
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Plus className="h-4 w-4" />
              Créer un tarif
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Time slider + season action chips */}
          {seasons.length > 1 && (
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 dark:text-dark-text-muted whitespace-nowrap">
                  Historique
                </label>
                <input
                  type="range"
                  min={1}
                  max={seasons.length}
                  value={visibleCount}
                  onChange={(e) => setVisibleCount(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-dark-bg-tertiary rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm text-gray-500 dark:text-dark-text-muted whitespace-nowrap min-w-[120px] text-right">
                  {visibleCount === 1
                    ? sliderYears[0]
                    : `${sliderYears[visibleCount - 1]} → ${sliderYears[0]}`
                  }
                </span>
              </div>
            </div>
          )}

          {/* Season action chips (edit / activate / delete per visible season) */}
          <div className="flex flex-wrap gap-2">
            {visibleSeasons.map((season) => (
              <div
                key={season.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg text-sm"
              >
                <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                  {season.label}
                </span>
                {season.is_active && (
                  <span className="w-2 h-2 bg-green-500 rounded-full" title="Actif" />
                )}
                <button
                  onClick={() => openEdit(season)}
                  className="p-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="Modifier"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                {!season.is_active && (
                  <>
                    <button
                      onClick={() => handleSetActive(season)}
                      className="p-0.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                      title="Activer"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(season)}
                      className="p-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Full-width tariff table with all visible seasons */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl border border-gray-200 dark:border-dark-border p-4">
            <SeasonTariffTable seasons={visibleSeasons} />
          </div>
        </div>
      )}

      {/* Form Modal */}
      <SeasonFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSeason(null);
        }}
        onSave={handleSave}
        season={editingSeason}
      />
    </div>
  );
}

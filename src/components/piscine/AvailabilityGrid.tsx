import React, { useEffect, useState } from 'react';
import { Check, X, Minus, Users, UserCheck, Wind, BookOpen } from 'lucide-react';
import { AvailabilityService } from '@/services/availabilityService';
import { AvailabilitySummary, AvailabilityDetail, AvailabilityByDate, SessionAssignment } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import { getSlotLabel } from '@/types/piscineSlots';

interface AvailabilityGridProps {
  year: number;
  month: number;
}

export const AvailabilityGrid: React.FC<AvailabilityGridProps> = ({
  year,
  month
}) => {
  const { clubId } = useAuth();
  const [summary, setSummary] = useState<AvailabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'accueil' | 'encadrant' | 'gonflage' | 'theorie'>('all');

  useEffect(() => {
    const loadData = async () => {
      if (!clubId) return;

      setLoading(true);
      setError(null);

      try {
        const data = await AvailabilityService.getAvailabilitySummary(clubId, year, month);
        setSummary(data);
      } catch (err) {
        logger.error('Error loading availability summary:', err);
        setError('Erreur lors du chargement des disponibilités');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [clubId, year, month]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  /**
   * Render een beschikbaarheidscel voor accueil (simpele ✓/✗/-)
   */
  const renderSimpleStatusCell = (
    status: 'available' | 'unavailable' | 'notIndicated'
  ) => {
    const statusConfig = {
      available: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        icon: <Check className="w-4 h-4 text-green-600 dark:text-green-400" />,
        title: 'Disponible'
      },
      unavailable: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        icon: <X className="w-4 h-4 text-red-600 dark:text-red-400" />,
        title: 'Non disponible'
      },
      notIndicated: {
        bg: 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700',
        icon: <Minus className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />,
        title: 'Pas encore indiqué'
      }
    };

    const config = statusConfig[status];

    return (
      <div
        className={`flex items-center justify-center p-2 rounded ${config.bg}`}
        title={config.title}
      >
        {config.icon}
      </div>
    );
  };

  /**
   * Render een beschikbaarheidscel met time slots (voor encadrant/gonflage)
   * Toont ✓ met slot-chips, of ✗, of -
   */
  const renderSlotStatusCell = (
    status: 'available' | 'unavailable' | 'notIndicated',
    role: 'encadrant' | 'gonflage' | 'theorie',
    timeSlots?: string[]
  ) => {
    if (status === 'unavailable') {
      return (
        <div
          className="flex items-center justify-center p-1.5 rounded bg-red-100 dark:bg-red-900/30"
          title="Non disponible"
        >
          <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
        </div>
      );
    }

    if (status === 'notIndicated') {
      return (
        <div
          className="flex items-center justify-center p-1.5 rounded bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700"
          title="Pas encore indiqué"
        >
          <Minus className="w-3.5 h-3.5 text-gray-400 dark:text-dark-text-muted" />
        </div>
      );
    }

    // Available — toon met slot chips
    const slots = timeSlots || [];
    const hasSlots = slots.length > 0;

    if (!hasSlots) {
      // Beschikbaar maar geen specifieke slots (legacy data)
      return (
        <div
          className="flex items-center justify-center p-1.5 rounded bg-green-100 dark:bg-green-900/30"
          title="Disponible (tous créneaux)"
        >
          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
        </div>
      );
    }

    // Beschikbaar met specifieke slots — toon als chips
    const slotLabels = slots.map(s => getSlotLabel(role, s));
    const tooltipText = `Disponible: ${slotLabels.join(', ')}`;

    return (
      <div
        className="flex flex-col items-center gap-0.5 p-1 rounded bg-green-50 dark:bg-green-900/20"
        title={tooltipText}
      >
        {slots.map(slot => (
          <span
            key={slot}
            className="text-[10px] leading-tight font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800/40 px-1 py-0.5 rounded whitespace-nowrap"
          >
            {getSlotLabel(role, slot)}
          </span>
        ))}
      </div>
    );
  };

  /**
   * Render een rij voor een member in de accueil sectie (simpel)
   */
  const renderAccueilMemberRow = (
    member: SessionAssignment,
    availabilitiesByDate: AvailabilityByDate[]
  ) => {
    return (
      <tr key={`accueil-${member.membre_id}`} className="border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
        <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-gray-100 whitespace-nowrap">
          {member.membre_prenom} {member.membre_nom}
        </td>
        {availabilitiesByDate.map((dayData, index) => {
          const roleData = dayData.accueil;
          const isAvailable = roleData.available.some(a => a.membre_id === member.membre_id);
          const isUnavailable = roleData.unavailable.some(a => a.membre_id === member.membre_id);

          let status: 'available' | 'unavailable' | 'notIndicated' = 'notIndicated';
          if (isAvailable) status = 'available';
          else if (isUnavailable) status = 'unavailable';

          return (
            <td key={index} className="py-2 px-2 text-center">
              {renderSimpleStatusCell(status)}
            </td>
          );
        })}
      </tr>
    );
  };

  /**
   * Render een rij voor een member met slot detail (encadrant/gonflage)
   */
  const renderSlotMemberRow = (
    member: SessionAssignment,
    role: 'encadrant' | 'gonflage' | 'theorie',
    availabilitiesByDate: AvailabilityByDate[]
  ) => {
    return (
      <tr key={`${role}-${member.membre_id}`} className="border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
        <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-gray-100 whitespace-nowrap">
          {member.membre_prenom} {member.membre_nom}
        </td>
        {availabilitiesByDate.map((dayData, index) => {
          const roleData = role === 'gonflage'
            ? dayData.gonflage
            : role === 'theorie'
              ? dayData.theorie
              : dayData.encadrants;

          // Zoek in available met detail
          const availableDetail = (roleData.available as AvailabilityDetail[]).find(
            a => a.membre_id === member.membre_id
          );
          const isUnavailable = roleData.unavailable.some(a => a.membre_id === member.membre_id);

          let status: 'available' | 'unavailable' | 'notIndicated' = 'notIndicated';
          let timeSlots: string[] | undefined;

          if (availableDetail) {
            status = 'available';
            timeSlots = availableDetail.time_slots;
          } else if (isUnavailable) {
            status = 'unavailable';
          }

          return (
            <td key={index} className="py-1 px-1 text-center align-top">
              {renderSlotStatusCell(status, role, timeSlots)}
            </td>
          );
        })}
      </tr>
    );
  };

  // Collect all unique members for each role
  const getAllMembers = (role: 'accueil' | 'encadrant' | 'gonflage' | 'theorie'): SessionAssignment[] => {
    if (!summary) return [];

    const memberMap = new Map<string, SessionAssignment>();

    summary.availabilitiesByDate.forEach(dayData => {
      const roleData = role === 'accueil'
        ? dayData.accueil
        : role === 'gonflage'
          ? dayData.gonflage
          : role === 'theorie'
            ? dayData.theorie
            : dayData.encadrants;

      [...roleData.available, ...roleData.unavailable, ...roleData.notIndicated].forEach(member => {
        if (!memberMap.has(member.membre_id)) {
          memberMap.set(member.membre_id, member);
        }
      });
    });

    // Sort by name
    return Array.from(memberMap.values()).sort((a, b) =>
      `${a.membre_nom} ${a.membre_prenom}`.localeCompare(`${b.membre_nom} ${b.membre_prenom}`)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Chargement des disponibilités...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => setMonth(month)}
          className="mt-2 text-sm text-red-600 dark:text-red-400 underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
        Aucune donnée disponible
      </div>
    );
  }

  const accueilMembers = getAllMembers('accueil');
  const encadrantMembers = getAllMembers('encadrant');
  const gonflageMembers = getAllMembers('gonflage');
  const theorieMembers = getAllMembers('theorie');

  return (
    <div className="space-y-6">
      {/* Role filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setRoleFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            roleFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Tous
        </button>
        <button
          onClick={() => setRoleFilter('accueil')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            roleFilter === 'accueil'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Users className="w-4 h-4" />
          Accueil ({accueilMembers.length})
        </button>
        <button
          onClick={() => setRoleFilter('encadrant')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            roleFilter === 'encadrant'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Encadrants ({encadrantMembers.length})
        </button>
        <button
          onClick={() => setRoleFilter('gonflage')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            roleFilter === 'gonflage'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Wind className="w-4 h-4" />
          Gonflage ({gonflageMembers.length})
        </button>
        <button
          onClick={() => setRoleFilter('theorie')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            roleFilter === 'theorie'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Théorie ({theorieMembers.length})
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800/40 px-1.5 py-0.5 rounded">
            1ère h.
          </span>
          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Créneaux spécifiques</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center">
            <X className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Non disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded flex items-center justify-center">
            <Minus className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
          </div>
          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Pas encore indiqué</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700">
            <tr>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
                Membre
              </th>
              {summary.tuesdays.map((tuesday, index) => (
                <th
                  key={index}
                  className="py-3 px-2 text-center text-sm font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white"
                >
                  {formatDate(tuesday)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Accueil section */}
            {(roleFilter === 'all' || roleFilter === 'accueil') && accueilMembers.length > 0 && (
              <>
                <tr className="bg-blue-50 dark:bg-blue-900/20">
                  <td
                    colSpan={summary.tuesdays.length + 1}
                    className="py-2 px-4 text-sm font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Équipe Accueil
                  </td>
                </tr>
                {accueilMembers.map(member =>
                  renderAccueilMemberRow(member, summary.availabilitiesByDate)
                )}
              </>
            )}

            {/* Encadrants section — met 1ère heure / 2ème heure detail */}
            {(roleFilter === 'all' || roleFilter === 'encadrant') && encadrantMembers.length > 0 && (
              <>
                <tr className="bg-purple-50 dark:bg-purple-900/20">
                  <td
                    colSpan={summary.tuesdays.length + 1}
                    className="py-2 px-4 text-sm font-bold text-purple-700 dark:text-purple-300"
                  >
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />
                      Encadrants
                      <span className="text-xs font-normal text-purple-500 dark:text-purple-400 ml-2">
                        (1ère heure / 2ème heure)
                      </span>
                    </div>
                  </td>
                </tr>
                {encadrantMembers.map(member =>
                  renderSlotMemberRow(member, 'encadrant', summary.availabilitiesByDate)
                )}
              </>
            )}

            {/* Gonflage section — met 19h45 / 20h15 / 21h30 detail */}
            {(roleFilter === 'all' || roleFilter === 'gonflage') && gonflageMembers.length > 0 && (
              <>
                <tr className="bg-sky-50 dark:bg-sky-900/20">
                  <td
                    colSpan={summary.tuesdays.length + 1}
                    className="py-2 px-4 text-sm font-bold text-sky-700 dark:text-sky-300"
                  >
                    <div className="flex items-center gap-2">
                      <Wind className="w-4 h-4" />
                      Équipe Gonflage
                      <span className="text-xs font-normal text-sky-500 dark:text-sky-400 ml-2">
                        (19h45 / 20h15 / 21h30)
                      </span>
                    </div>
                  </td>
                </tr>
                {gonflageMembers.map(member =>
                  renderSlotMemberRow(member, 'gonflage', summary.availabilitiesByDate)
                )}
              </>
            )}

            {/* Théorie section — met 19h30 / 21h45 detail */}
            {(roleFilter === 'all' || roleFilter === 'theorie') && theorieMembers.length > 0 && (
              <>
                <tr className="bg-orange-50 dark:bg-orange-900/20">
                  <td
                    colSpan={summary.tuesdays.length + 1}
                    className="py-2 px-4 text-sm font-bold text-orange-700 dark:text-orange-300"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Théorie
                      <span className="text-xs font-normal text-orange-500 dark:text-orange-400 ml-2">
                        (19h30 / 21h45)
                      </span>
                    </div>
                  </td>
                </tr>
                {theorieMembers.map(member =>
                  renderSlotMemberRow(member, 'theorie', summary.availabilitiesByDate)
                )}
              </>
            )}

            {/* Empty state */}
            {accueilMembers.length === 0 && encadrantMembers.length === 0 && gonflageMembers.length === 0 && theorieMembers.length === 0 && (
              <tr>
                <td
                  colSpan={summary.tuesdays.length + 1}
                  className="py-8 text-center text-gray-500 dark:text-dark-text-muted"
                >
                  Aucun membre avec le rôle Accueil, Encadrant ou Gonflage trouvé.
                  <br />
                  <span className="text-sm">
                    Assurez-vous que les membres ont le rôle approprié dans leur clubStatuten.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AvailabilityGrid;

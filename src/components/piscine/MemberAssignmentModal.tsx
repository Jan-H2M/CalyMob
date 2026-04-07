import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, User, AlertCircle, AlertTriangle } from 'lucide-react';
import { SessionAssignment, Availability, PiscineLevel, PiscineSession } from '@/types';
import { AvailabilityService } from '@/services/availabilityService';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { Membre } from '@/types';
import { getSlotLabel } from '@/types/piscineSlots';
import { logger } from '@/utils/logger';

/** Represents a member's existing assignment in the session */
interface MemberConflict {
  role: string;      // Display label: "Accueil", "Gonflage 20h15", "★★★ 2ème heure", etc.
  timeSlot: string;  // Normalized time group for overlap detection: '1ere_heure' | '2eme_heure' | 'all'
}

/**
 * Normalize different slot naming conventions to a common time group
 * for detecting time conflicts across roles.
 * - '1ere_heure' / '20h15' / '19h45' → '1ere_heure' (first part of evening)
 * - '2eme_heure' / '21h30' → '2eme_heure' (second part of evening)
 * - No slot → 'all' (spans entire session, e.g. baptêmes)
 */
function normalizeTimeSlot(role: string, slot?: string): string {
  if (!slot) return 'all';
  // Encadrant levels and théorie use '1ere_heure'/'2eme_heure' directly
  if (slot === '1ere_heure' || slot === '20h15' || slot === '19h45') return '1ere_heure';
  if (slot === '2eme_heure' || slot === '21h30') return '2eme_heure';
  // Théorie slots like '22h30' etc. — treat as 2eme_heure
  if (slot.includes('22h')) return '2eme_heure';
  return slot; // fallback
}

/** Check if two time slots overlap */
function timeSlotsOverlap(a: string, b: string): boolean {
  if (a === 'all' || b === 'all') return true;
  return a === b;
}

interface MemberAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (member: SessionAssignment) => Promise<void>;
  clubId: string;
  sessionDate: Date;
  role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie';
  level?: string; // Required when role is 'encadrant'
  slot?: string;  // Required when role is 'gonflage' or 'theorie'
  existingMembers: SessionAssignment[]; // Already assigned in the same role/level/slot
  session?: PiscineSession; // Full session for cross-role conflict detection
}

export const MemberAssignmentModal: React.FC<MemberAssignmentModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  clubId,
  sessionDate,
  role,
  level,
  slot,
  existingMembers,
  session
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<Membre[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

  /**
   * Build a map of all member assignments across the entire session
   * to detect cross-role/cross-level conflicts.
   */
  const allSessionAssignments = useMemo((): Map<string, MemberConflict[]> => {
    const map = new Map<string, MemberConflict[]>();
    if (!session) return map;

    const addConflict = (membreId: string, roleLabel: string, timeSlot: string) => {
      const existing = map.get(membreId) || [];
      existing.push({ role: roleLabel, timeSlot });
      map.set(membreId, existing);
    };

    // Accueil members
    session.accueil?.forEach(m => {
      const mSlot = m.heure || '20h15'; // legacy fallback
      addConflict(m.membre_id, `Accueil ${getSlotLabel('accueil', mSlot)}`, normalizeTimeSlot('accueil', mSlot));
    });

    // Baptêmes members (span entire session)
    session.baptemes?.forEach(m => {
      addConflict(m.membre_id, 'Baptêmes', 'all');
    });

    // Gonflage members
    if (session.gonflage) {
      for (const [gSlot, members] of Object.entries(session.gonflage)) {
        if (Array.isArray(members)) {
          members.forEach((m: SessionAssignment) => {
            addConflict(m.membre_id, `Gonflage ${getSlotLabel('gonflage', gSlot)}`, normalizeTimeSlot('gonflage', gSlot));
          });
        }
      }
    }

    // Théorie members
    if (session.theorie) {
      for (const [tSlot, data] of Object.entries(session.theorie)) {
        const encadrants = (data as any)?.encadrants;
        if (Array.isArray(encadrants)) {
          encadrants.forEach((m: SessionAssignment) => {
            addConflict(m.membre_id, `Théorie ${getSlotLabel('theorie', tSlot)}`, normalizeTimeSlot('theorie', tSlot));
          });
        }
      }
    }

    // Niveaux (encadrant levels)
    if (session.niveaux) {
      for (const [lvl, assignment] of Object.entries(session.niveaux)) {
        const displayName = PiscineLevel.displayName(lvl);
        assignment?.encadrants?.forEach((m: SessionAssignment) => {
          const mHeure = m.heure || '1ere_heure';
          const heureLabel = getSlotLabel('encadrant', mHeure);
          addConflict(m.membre_id, `${displayName} ${heureLabel}`, normalizeTimeSlot('encadrant', mHeure));
        });
      }
    }

    return map;
  }, [session]);

  /** Get conflicts for a specific member (excluding the current role/level/slot being assigned to) */
  const getMemberConflicts = (memberId: string): MemberConflict[] => {
    const assignments = allSessionAssignments.get(memberId) || [];
    // Filter out assignments that are for the SAME role/level/slot (those are already handled by existingMembers)
    return assignments.filter(a => {
      // Build what the current target role label would look like
      const currentLabel = getRoleTitle();
      return a.role !== currentLabel;
    });
  };

  /** Check if any conflict overlaps with the current time slot */
  const hasTimeOverlap = (conflicts: MemberConflict[]): boolean => {
    const currentTimeSlot = normalizeTimeSlot(role, slot);
    return conflicts.some(c => timeSlotsOverlap(c.timeSlot, currentTimeSlot));
  };

  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load members with the appropriate role
        const memberRole = role === 'accueil' ? 'accueil' : role === 'gonflage' ? 'gonflage' : role === 'theorie' ? 'theorie' : 'encadrant';
        const [loadedMembers, dateAvailabilities] = await Promise.all([
          AvailabilityService.getMembersWithRole(clubId, memberRole),
          AvailabilityService.getAvailabilitiesForDate(clubId, sessionDate)
        ]);

        setMembers(loadedMembers);
        setAvailabilities(dateAvailabilities);
      } catch (error) {
        logger.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, clubId, sessionDate, role]);

  const getAvailabilityStatus = (memberId: string): 'available' | 'unavailable' | 'unknown' => {
    const memberRole = role === 'accueil' ? 'accueil' : role === 'gonflage' ? 'gonflage' : role === 'theorie' ? 'theorie' : 'encadrant';
    const availability = availabilities.find(
      a => a.membre_id === memberId && a.role === memberRole
    );

    if (!availability) return 'unknown';
    if (!availability.available) return 'unavailable';

    // If a specific slot is requested, check if the member's time_slots include it
    // Legacy format (no time_slots): treat as available for all slots
    if (slot && availability.time_slots && availability.time_slots.length > 0) {
      return availability.time_slots.includes(slot) ? 'available' : 'unavailable';
    }

    return 'available';
  };

  const filteredMembers = useMemo(() => {
    let result = members;

    // Filter out already assigned members
    const existingIds = new Set(existingMembers.map(m => m.membre_id));
    result = result.filter(m => !existingIds.has(m.id));

    // Filter by availability if toggled
    if (showOnlyAvailable) {
      result = result.filter(m => getAvailabilityStatus(m.id) === 'available');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m => {
        const firstName = getFirstName(m)?.toLowerCase() || '';
        const lastName = getLastName(m)?.toLowerCase() || '';
        return firstName.includes(query) || lastName.includes(query);
      });
    }

    // Sort by name
    result.sort((a, b) => {
      const nameA = `${getLastName(a)} ${getFirstName(a)}`.toLowerCase();
      const nameB = `${getLastName(b)} ${getFirstName(b)}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [members, existingMembers, showOnlyAvailable, searchQuery, availabilities]);

  const handleAssign = async (member: Membre) => {
    setAssigning(member.id);
    try {
      const assignment: SessionAssignment = {
        membre_id: member.id,
        membre_nom: getLastName(member) || '',
        membre_prenom: getFirstName(member) || ''
      };
      await onAssign(assignment);
      onClose();
    } catch (error) {
      logger.error('Error assigning member:', error);
    } finally {
      setAssigning(null);
    }
  };

  const getRoleTitle = () => {
    switch (role) {
      case 'accueil':
        return 'Équipe Accueil';
      case 'baptemes':
        return 'Baptêmes';
      case 'gonflage':
        return slot ? `Gonflage ${getSlotLabel('gonflage', slot)}` : 'Équipe Gonflage';
      case 'encadrant':
        return level ? `Encadrant ${PiscineLevel.displayName(level)}` : 'Encadrant';
      case 'theorie':
        return slot ? `Théorie ${getSlotLabel('theorie', slot)}` : 'Théorie';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
              Ajouter un membre
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted">
              {getRoleTitle()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and filters */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border dark:border-gray-700 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher un membre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyAvailable}
              onChange={(e) => setShowOnlyAvailable(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
              Afficher uniquement les membres disponibles
            </span>
          </label>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-text-muted mb-3" />
              <p className="text-gray-500 dark:text-dark-text-muted">
                {showOnlyAvailable
                  ? 'Aucun membre disponible trouvé'
                  : 'Aucun membre trouvé'}
              </p>
              {showOnlyAvailable && (
                <button
                  onClick={() => setShowOnlyAvailable(false)}
                  className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Afficher tous les membres
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const availability = getAvailabilityStatus(member.id);
                const isAssigning = assigning === member.id;
                const conflicts = getMemberConflicts(member.id);
                const hasOverlap = hasTimeOverlap(conflicts);

                return (
                  <button
                    key={member.id}
                    onClick={() => handleAssign(member)}
                    disabled={isAssigning}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors disabled:opacity-50 ${
                      hasOverlap
                        ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20'
                        : conflicts.length > 0
                          ? 'border-yellow-200 dark:border-yellow-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/10'
                          : 'border-gray-200 dark:border-dark-border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        hasOverlap
                          ? 'bg-orange-100 dark:bg-orange-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        {hasOverlap
                          ? <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                          : <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        }
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                          {getFirstName(member)} {getLastName(member)}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {/* Conflict warnings */}
                          {conflicts.length > 0 && (
                            <span className={`text-xs flex items-center gap-1 ${
                              hasOverlap
                                ? 'text-orange-600 dark:text-orange-400 font-medium'
                                : 'text-yellow-600 dark:text-yellow-400'
                            }`}>
                              <AlertTriangle className="w-3 h-3" />
                              Déjà assigné : {conflicts.map(c => c.role).join(', ')}
                            </span>
                          )}
                          {/* Availability info */}
                          {availability === 'available' && !hasOverlap && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Disponible{slot ? ` (${getSlotLabel(role === 'baptemes' ? 'encadrant' : role, slot)})` : ''}
                            </span>
                          )}
                          {availability === 'unavailable' && (
                            <span className="text-xs text-red-600 dark:text-red-400">
                              Non disponible{slot ? ` (${getSlotLabel(role === 'baptemes' ? 'encadrant' : role, slot)})` : ''}
                            </span>
                          )}
                          {availability === 'unknown' && conflicts.length === 0 && (
                            <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                              Disponibilité inconnue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAssigning ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          hasOverlap
                            ? 'bg-orange-500'
                            : 'bg-blue-600'
                        }`}>
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberAssignmentModal;

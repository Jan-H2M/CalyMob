import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Calendar, Users, Settings, Plus, ChevronLeft, ChevronRight, Book, ListChecks } from 'lucide-react';
import { ParticipantsTab } from './ParticipantsTab';
import { AvailabilityGrid } from './AvailabilityGrid';
import { SessionTimelineCard } from './SessionTimelineCard';
import { MemberAssignmentModal } from './MemberAssignmentModal';
import { CreateSessionModal } from './CreateSessionModal';
import { DateEditModal } from './DateEditModal';
import { PiscineDocumentation } from './documentation/PiscineDocumentation';
import { PiscineSessionService } from '@/services/piscineSessionService';
import toast from 'react-hot-toast';
import { PiscineSession, SessionAssignment } from '@/types';
import { type GonflageSlot } from '@/types/piscineSlots';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

type TabType = 'planning' | 'disponibilites' | 'participants';

const MONTH_NAMES_SHORT = [
  'jan', 'fév', 'mar', 'avr', 'mai', 'jun',
  'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'
];

const DAY_NAMES_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/**
 * Bereken de dichtstbijzijnde toekomstige sessie-index
 */
function findNearestUpcomingIndex(sessions: PiscineSession[]): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = 0; i < sessions.length; i++) {
    const sessionDate = new Date(sessions[i].date);
    sessionDate.setHours(0, 0, 0, 0);
    if (sessionDate >= now) return i;
  }
  // Als er geen toekomstige sessie is, pak de laatste
  return Math.max(0, sessions.length - 1);
}

export const PiscinePlanningPage: React.FC = () => {
  const { clubId, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('planning');

  // Sessions state — load a wide range (6 months back, 6 months forward)
  const [sessions, setSessions] = useState<PiscineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState<{
    isOpen: boolean;
    sessionId: string;
    sessionDate: Date;
    role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie';
    level?: string;
    slot?: string;
    existingMembers: SessionAssignment[];
    session: PiscineSession;
  } | null>(null);
  const [dateEditModal, setDateEditModal] = useState<{
    isOpen: boolean;
    session: PiscineSession;
  } | null>(null);
  const [isDocOpen, setIsDocOpen] = useState(false);

  // Date strip scroll ref
  const stripRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  // Scroll to selected button after render
  useEffect(() => {
    if (!selectedSessionId || !stripRef.current) return;

    // Use setTimeout to ensure DOM has fully laid out
    const timer = setTimeout(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const btn = strip.querySelector(`[data-session-id="${selectedSessionId}"]`) as HTMLElement;
      if (!btn) return;

      // Calculate btn position relative to strip using getBoundingClientRect
      // (offsetLeft can be wrong if strip doesn't have position:relative)
      const stripRect = strip.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const btnLeftInStrip = btnRect.left - stripRect.left + strip.scrollLeft;

      if (!initialScrollDone.current) {
        // First load: align to left edge
        strip.scrollLeft = btnLeftInStrip - 8;
        initialScrollDone.current = true;
      } else {
        // Subsequent: smooth scroll if out of view
        if (btnRect.left < stripRect.left || btnRect.right > stripRect.right) {
          strip.scrollTo({
            left: btnLeftInStrip - strip.offsetWidth / 2 + btn.offsetWidth / 2,
            behavior: 'smooth'
          });
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedSessionId, sessions]);

  // Load sessions: 6 months back, 6 months forward
  useEffect(() => {
    if (!clubId) return;

    setLoading(true);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 7, 1); // 6 months forward + rest of current

    const unsubscribe = PiscineSessionService.subscribeToSessionsRange(
      clubId,
      startDate,
      endDate,
      (loadedSessions) => {
        setSessions(loadedSessions);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clubId]);

  // Auto-select nearest upcoming session on first load
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      const idx = findNearestUpcomingIndex(sessions);
      setSelectedSessionId(sessions[idx].id);
    }
  }, [sessions, selectedSessionId]);

  // Scroll strip with arrows
  const scrollStrip = (direction: 'left' | 'right') => {
    if (!stripRef.current) return;
    const scrollAmount = 300;
    stripRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Selected session
  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  // Derive year/month from selected session for AvailabilityGrid
  const selectedYear = selectedSession
    ? selectedSession.date.getFullYear()
    : new Date().getFullYear();
  const selectedMonth = selectedSession
    ? selectedSession.date.getMonth() + 1
    : new Date().getMonth() + 1;

  // Is this session the nearest upcoming one?
  const nearestUpcomingId = useMemo(() => {
    if (sessions.length === 0) return null;
    const idx = findNearestUpcomingIndex(sessions);
    return sessions[idx].id;
  }, [sessions]);

  // Format date for the strip
  const formatStripDate = (date: Date) => {
    const day = date.getDate();
    const monthStr = MONTH_NAMES_SHORT[date.getMonth()];
    return `${day} ${monthStr}`;
  };

  // Check if date is in the past
  const isPastDate = (date: Date) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < now;
  };

  // (sessions worden rechtstreeks gerenderd, geen separator-groepering nodig)

  const handleAssignMember = useCallback((
    sessionId: string,
    role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie',
    level?: string,
    slot?: string
  ) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    let existingMembers: SessionAssignment[] = [];
    if (role === 'accueil') {
      existingMembers = session.accueil;
    } else if (role === 'baptemes') {
      existingMembers = session.baptemes;
    } else if (role === 'gonflage' && slot) {
      existingMembers = session.gonflage?.[slot as GonflageSlot] || [];
    } else if (role === 'encadrant' && level) {
      const allEncadrants = session.niveaux[level]?.encadrants || [];
      existingMembers = slot
        ? allEncadrants.filter(e => (e.heure || '1ere_heure') === slot)
        : allEncadrants;
    } else if (role === 'theorie' && slot) {
      existingMembers = session.theorie?.[slot]?.encadrants || [];
    }

    setAssignmentModal({
      isOpen: true,
      sessionId,
      sessionDate: session.date,
      role,
      level,
      slot,
      existingMembers,
      session
    });
  }, [sessions]);

  const handleAssignmentSubmit = async (member: SessionAssignment) => {
    if (!clubId || !assignmentModal) return;

    const { sessionId, role, level, slot } = assignmentModal;

    if (role === 'accueil') {
      const memberWithHeure = slot ? { ...member, heure: slot } : member;
      await PiscineSessionService.assignToAccueil(clubId, sessionId, memberWithHeure);
    } else if (role === 'baptemes') {
      await PiscineSessionService.assignToBaptemes(clubId, sessionId, member);
    } else if (role === 'gonflage') {
      await PiscineSessionService.assignToGonflage(clubId, sessionId, member, (slot as GonflageSlot) || '19h45');
    } else if (role === 'encadrant' && level) {
      const memberWithHeure = slot ? { ...member, heure: slot } : member;
      await PiscineSessionService.assignEncadrantToLevel(clubId, sessionId, level, memberWithHeure);
    } else if (role === 'theorie' && slot) {
      await PiscineSessionService.assignToTheorie(clubId, sessionId, slot, member);
    }
  };

  const handleEditDate = useCallback((session: PiscineSession) => {
    setDateEditModal({ isOpen: true, session });
  }, []);

  const handleDateChange = async (newDate: Date) => {
    if (!clubId || !dateEditModal) return;

    try {
      await PiscineSessionService.updateSession(clubId, dateEditModal.session.id, { date: newDate });
      toast.success('Date mise à jour');
    } catch (error) {
      logger.error('Error updating date:', error);
      toast.error('Erreur lors de la mise à jour de la date');
      throw error;
    }
  };

  const renderPlanningTab = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Chargement des séances...</span>
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/30 rounded-lg">
          <Calendar className="w-16 h-16 mx-auto text-gray-400 dark:text-dark-text-muted mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-2">
            Aucune séance trouvée
          </h3>
          <p className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mb-4">
            Créez des séances pour commencer à planifier
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Créer des séances
          </button>
        </div>
      );
    }

    if (!selectedSession) {
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Sélectionnez une séance dans la bande ci-dessus
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <SessionTimelineCard
          key={selectedSession.id}
          session={selectedSession}
          clubId={clubId!}
          onAssignMember={handleAssignMember}
          onEditDate={handleEditDate}
          expanded={true}
        />
      </div>
    );
  };

  // Build month separators for the strip
  const renderDateStrip = () => {
    if (loading || sessions.length === 0) return null;

    let currentMonth = -1;
    const items: React.ReactNode[] = [];

    for (const session of sessions) {
      const m = session.date.getMonth();
      const y = session.date.getFullYear();
      const monthKey = y * 12 + m;

      // Month separator
      if (monthKey !== currentMonth) {
        currentMonth = monthKey;
        const monthLabel = MONTH_NAMES_SHORT[m].charAt(0).toUpperCase() + MONTH_NAMES_SHORT[m].slice(1);
        items.push(
          <div
            key={`sep-${monthKey}`}
            className="flex-shrink-0 flex items-center px-1"
          >
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {monthLabel} {y !== new Date().getFullYear() ? y : ''}
            </span>
          </div>
        );
      }

      const isSelected = session.id === selectedSessionId;
      const isNearest = session.id === nearestUpcomingId;
      const isPast = isPastDate(session.date);
      const isTheorie = session.type === 'theorie';
      const dayName = DAY_NAMES_SHORT[session.date.getDay()];

      items.push(
        <button
          key={session.id}
          data-session-id={session.id}
          onClick={() => setSelectedSessionId(session.id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            isSelected
              ? 'bg-blue-600 text-white shadow-md scale-105'
              : isPast
                ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center leading-tight">
              <span className="text-[10px] opacity-70">{dayName}</span>
              <span>{formatStripDate(session.date)}</span>
            </div>
            {isTheorie && (
              <span className={`text-[10px] px-1 py-0.5 rounded-full font-semibold ${
                isSelected
                  ? 'bg-white/20 text-white'
                  : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
              }`}>
                T
              </span>
            )}
            {isNearest && !isSelected && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
            )}
          </div>
        </button>
      );
    }

    return items;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Top bar: Date strip + Actions */}
      <div className="flex items-center gap-2">
        {/* Left arrow */}
        <button
          onClick={() => scrollStrip('left')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        {/* Scrollable date strip */}
        <div
          ref={stripRef}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-500">Chargement...</span>
            </div>
          ) : sessions.length === 0 ? (
            <span className="text-sm text-gray-500 dark:text-gray-400 py-2">Aucune séance</span>
          ) : (
            renderDateStrip()
          )}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scrollStrip('right')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2 border-l border-gray-200 dark:border-gray-700 pl-3">
          {activeTab === 'planning' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouvelle séance</span>
            </button>
          )}
          <button
            onClick={() => setIsDocOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Documentation"
          >
            <Book className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Tabs: Planning | Disponibilités */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('planning')}
            className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'planning'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Settings className="w-4 h-4" />
            Planning
          </button>
          <button
            onClick={() => setActiveTab('disponibilites')}
            className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'disponibilites'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Disponibilités
          </button>
          <button
            onClick={() => setActiveTab('participants')}
            className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'participants'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            Participants
          </button>
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {activeTab === 'planning' && renderPlanningTab()}

        {activeTab === 'disponibilites' && (
          <AvailabilityGrid year={selectedYear} month={selectedMonth} />
        )}

        {activeTab === 'participants' && selectedSession && (
          <ParticipantsTab
            sessionId={selectedSession.id}
            totalScanned={0}
          />
        )}

        {activeTab === 'participants' && !selectedSession && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            Sélectionnez une séance pour voir les participants
          </div>
        )}
      </div>

      {/* Documentation modal/drawer */}
      {isDocOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsDocOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Book className="w-5 h-5 text-blue-600" />
                Documentation
              </h2>
              <button
                onClick={() => setIsDocOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <PiscineDocumentation />
            </div>
          </div>
        </div>
      )}

      {/* Create session modal */}
      {clubId && user && (
        <CreateSessionModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={() => {}}
          clubId={clubId}
          userId={user.uid}
        />
      )}

      {/* Member assignment modal */}
      {assignmentModal && clubId && (
        <MemberAssignmentModal
          isOpen={assignmentModal.isOpen}
          onClose={() => setAssignmentModal(null)}
          onAssign={handleAssignmentSubmit}
          clubId={clubId}
          sessionDate={assignmentModal.sessionDate}
          role={assignmentModal.role}
          level={assignmentModal.level}
          slot={assignmentModal.slot}
          existingMembers={assignmentModal.existingMembers}
          session={assignmentModal.session}
        />
      )}

      {/* Date edit modal */}
      {dateEditModal && (
        <DateEditModal
          isOpen={dateEditModal.isOpen}
          onClose={() => setDateEditModal(null)}
          currentDate={dateEditModal.session.date}
          onSave={handleDateChange}
        />
      )}
    </div>
  );
};

export default PiscinePlanningPage;

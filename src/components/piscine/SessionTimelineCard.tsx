import React, { useState, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  UserCheck,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Edit,
  Edit2,
  Trash2,
  Send,
  Star,
  Check,
  Gauge,
  Plus,
  FileDown
} from 'lucide-react';
import { PiscineSession, PiscineLevel, PiscineSessionStatus, SessionAssignment } from '@/types';
import { PiscineSessionService } from '@/services/piscineSessionService';
import { generateSessionReport } from '@/services/piscineReportService';
import { GONFLAGE_SLOTS, THEORIE_SLOTS, ENCADRANT_SLOTS, getSlotLabel, type GonflageSlot, LEVELS_FIRST_HOUR_ONLY, LEVELS_SECOND_HOUR_ONLY } from '@/types/piscineSlots';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeEditModal } from './ThemeEditModal';
import { ObservationsList } from './ObservationsList';
import { useCarnetFormationGuard } from '@/hooks/useFeatureFlags';
import toast from 'react-hot-toast';

interface SessionTimelineCardProps {
  session: PiscineSession;
  clubId: string;
  onAssignMember: (sessionId: string, role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie', level?: string, slot?: string) => void;
  onEditSession?: (session: PiscineSession) => void;
  onEditDate?: (session: PiscineSession) => void;
  expanded?: boolean;
}

// ─── TV-Guide Timeline Configuration ─────────────────────────
// Timeline runs from 19:30 (0 min) to 23:30 (240 min)
const TIMELINE_START = 0;   // 19:30
const TIMELINE_END = 240;   // 23:30 (240 min after 19:30)

/** Convert "HHhMM" to minutes from 19:30 */
function timeToMin(t: string): number {
  const match = t.match(/(\d+)[h:](\d+)/);
  if (!match) return 0;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  return (h * 60 + m) - (19 * 60 + 30);
}

/** Convert minutes to percentage of timeline */
function minToPercent(min: number): number {
  return ((min - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;
}

/** Time block definition */
interface TimeBlock {
  startMin: number;
  endMin: number;
  slot?: string;     // data key for gonflage/théorie/accueil
  heure?: string;    // for encadrants (1ere_heure / 2eme_heure)
}

/** Track with TV-guide time blocks */
interface TrackConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  textColor: string;
  badgeColor: string;
  blockBg: string;
  blockBorder: string;
  role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie' | null;
  level?: string;
  blocks: TimeBlock[];
}

// ─── Time ruler marks ───────────────────────────────────────
const RULER_MARKS = [
  { min: 0, label: '19:30' },
  { min: 15, label: '19:45' },
  { min: 30, label: '20:00' },
  { min: 45, label: '20:15' },
  { min: 60, label: '20:30' },
  { min: 75, label: '20:45' },
  { min: 90, label: '21:00' },
  { min: 105, label: '21:15' },
  { min: 120, label: '21:30' },
  { min: 135, label: '21:45' },
  { min: 150, label: '22:00' },
  { min: 165, label: '22:15' },
  { min: 180, label: '22:30' },
  { min: 195, label: '22:45' },
  { min: 210, label: '23:00' },
  { min: 225, label: '23:15' },
  { min: 240, label: '23:30' },
];

// Only show labels for every 30 min to avoid clutter
const MAJOR_MARKS = new Set([0, 30, 60, 90, 120, 150, 180, 210, 240]);

export const SessionTimelineCard: React.FC<SessionTimelineCardProps> = ({
  session,
  clubId,
  onAssignMember,
  onEditSession,
  onEditDate,
  expanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [isPublishing, setIsPublishing] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [editingThemeLevel, setEditingThemeLevel] = useState<string>('');
  const [editingTheme, setEditingTheme] = useState<string>('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const { appUser } = useAuth();
  const adminName = `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || 'Admin';
  const { visible: showFormation } = useCarnetFormationGuard(clubId);

  // ─── Track configurations with time blocks ──────────────────
  const tracks: TrackConfig[] = [
    {
      id: 'accueil',
      label: 'Accueil',
      icon: <Users className="w-4 h-4" />,
      color: 'bg-blue-50 dark:bg-blue-900/10',
      textColor: 'text-blue-700 dark:text-blue-400',
      badgeColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      blockBg: 'bg-blue-50 dark:bg-blue-900/20',
      blockBorder: 'border-blue-200 dark:border-blue-800',
      role: 'accueil',
      blocks: [
        { startMin: 30, endMin: 105, slot: '20h00' },    // 20:00 → 21:15
      ]
    },
    {
      id: 'baptemes',
      label: 'Baptêmes',
      icon: <UserCheck className="w-4 h-4" />,
      color: 'bg-teal-50 dark:bg-teal-900/10',
      textColor: 'text-teal-700 dark:text-teal-400',
      badgeColor: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
      blockBg: 'bg-teal-50 dark:bg-teal-900/20',
      blockBorder: 'border-teal-200 dark:border-teal-800',
      role: 'baptemes',
      blocks: [
        { startMin: 45, endMin: 105 },                    // 20:15 → 21:15
      ]
    },
    {
      id: 'gonflage',
      label: 'Gonflage',
      icon: <Gauge className="w-4 h-4" />,
      color: 'bg-gray-50 dark:bg-gray-900/10',
      textColor: 'text-gray-700 dark:text-gray-400',
      badgeColor: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
      blockBg: 'bg-gray-100 dark:bg-gray-800',
      blockBorder: 'border-gray-300 dark:border-gray-600',
      role: 'gonflage',
      blocks: [
        { startMin: 15, endMin: 45, slot: '19h45' },      // 19:45 → 20:15
        { startMin: 45, endMin: 105, slot: '20h15' },      // 20:15 → 21:15
        { startMin: 120, endMin: 180, slot: '21h30' },    // 21:30 → 22:30
      ]
    },
    {
      id: 'theorie',
      label: 'Théorie',
      icon: <GraduationCap className="w-4 h-4" />,
      color: 'bg-orange-50 dark:bg-orange-900/10',
      textColor: 'text-orange-700 dark:text-orange-400',
      badgeColor: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
      blockBg: 'bg-orange-50 dark:bg-orange-900/20',
      blockBorder: 'border-orange-200 dark:border-orange-800',
      role: 'theorie',
      blocks: [
        { startMin: 0, endMin: 60, slot: '19h30' },       // 19:30 → 20:30
        { startMin: 135, endMin: 180, slot: '21h45' },    // 21:45 → 22:30
      ]
    },
    // Niveaux (levels)
    ...PiscineLevel.all.map(level => ({
      id: `level_${level}`,
      label: PiscineLevel.displayName(level),
      icon: null as React.ReactNode,
      color: 'bg-purple-50 dark:bg-purple-900/10',
      textColor: 'text-purple-700 dark:text-purple-400',
      badgeColor: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      blockBg: 'bg-purple-50 dark:bg-purple-900/20',
      blockBorder: 'border-purple-200 dark:border-purple-800',
      role: 'encadrant' as const,
      level,
      blocks: (LEVELS_FIRST_HOUR_ONLY as readonly string[]).includes(level)
        ? [{ startMin: 45, endMin: 105, heure: '1ere_heure' }]           // 1*: 20:15 → 21:15
        : [{ startMin: 105, endMin: 180, heure: '2eme_heure' }]          // 2*+: 21:15 → 22:30
    }))
  ];

  // ─── Existing handlers (unchanged) ──────────────────────────

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);

  // Detect if timeline needs horizontal scrolling
  useEffect(() => {
    const checkScroll = () => {
      const el = timelineScrollRef.current;
      if (el) {
        setCanScroll(el.scrollWidth > el.clientWidth + 10);
      }
    };
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isExpanded, expanded]);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === session.statut) {
      setStatusDropdownOpen(false);
      return;
    }
    setIsUpdatingStatus(true);
    try {
      await PiscineSessionService.updateStatus(clubId, session.id, newStatus);
      toast.success('Statut mis à jour');
    } catch (error) {
      logger.error('Error updating status:', error);
      toast.error('Erreur lors de la mise à jour du statut');
    } finally {
      setIsUpdatingStatus(false);
      setStatusDropdownOpen(false);
    }
  };

  const openThemeModal = (level: string, currentTheme: string) => {
    setEditingThemeLevel(level);
    setEditingTheme(currentTheme);
    setThemeModalOpen(true);
  };

  // Note: handleEditNote via prompt() is replaced — all comments now use the ThemeEditModal
  // The modal determines save behavior based on editingThemeLevel prefix (see handleSaveTheme)

  // Determine if a key represents a note/comment (not a theme)
  const isNoteKey = (key: string) =>
    key === 'accueil' || key === 'baptemes' || key.startsWith('gonflage_');

  const handleSaveTheme = async (value: string) => {
    try {
      if (isNoteKey(editingThemeLevel)) {
        // Save as a note/comment
        await PiscineSessionService.updateNote(clubId, session.id, editingThemeLevel, value);
        toast.success(value ? 'Commentaire mis à jour' : 'Commentaire supprimé');
      } else if (editingThemeLevel.startsWith('theorie_')) {
        const theorieSlot = editingThemeLevel.replace('theorie_', '');
        await PiscineSessionService.updateTheorieTheme(clubId, session.id, theorieSlot, value, adminName);
        toast.success('Thème mis à jour');
      } else {
        // Key format: "level_heure" e.g. "1_etoile_1ere_heure" or "1_etoile_2eme_heure"
        const heureMatch = editingThemeLevel.match(/^(.+)_(1ere_heure|2eme_heure)$/);
        if (heureMatch) {
          const level = heureMatch[1];
          const heure = heureMatch[2];
          await PiscineSessionService.updateThemePerHeure(clubId, session.id, level, heure, value, adminName);
        } else {
          await PiscineSessionService.updateTheme(clubId, session.id, editingThemeLevel, value, adminName);
        }
        toast.success('Thème mis à jour');
      }
    } catch (error) {
      logger.error('Error updating:', error);
      toast.error('Erreur lors de la mise à jour');
      throw error;
    }
  };

  const formatDate = (date: Date) => {
    const weekdays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await PiscineSessionService.publishSession(clubId, session.id);
      toast.success('Séance publiée avec succès');
    } catch (error) {
      logger.error('Error publishing session:', error);
      toast.error('Erreur lors de la publication');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRemoveMember = async (
    membreId: string,
    role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie',
    level?: string,
    slot?: string,
    heure?: string
  ) => {
    try {
      if (role === 'accueil') {
        await PiscineSessionService.removeFromAccueil(clubId, session.id, membreId, slot);
      } else if (role === 'baptemes') {
        await PiscineSessionService.removeFromBaptemes(clubId, session.id, membreId);
      } else if (role === 'gonflage') {
        await PiscineSessionService.removeFromGonflage(clubId, session.id, membreId, (slot as GonflageSlot) || '19h45');
      } else if (role === 'encadrant' && level) {
        await PiscineSessionService.removeEncadrantFromLevel(clubId, session.id, level, membreId, heure);
      } else if (role === 'theorie' && slot) {
        await PiscineSessionService.removeFromTheorie(clubId, session.id, slot, membreId);
      }
      toast.success('Membre retiré');
    } catch (error) {
      logger.error('Error removing member:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // ─── Status dropdown ────────────────────────────────────────
  const statusOptions = [
    {
      value: PiscineSessionStatus.brouillon,
      label: 'Brouillon',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-400',
      hoverBg: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
    },
    {
      value: PiscineSessionStatus.publie,
      label: 'Publié',
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      hoverBg: 'hover:bg-green-50 dark:hover:bg-green-900/20'
    },
    {
      value: PiscineSessionStatus.termine,
      label: 'Terminé',
      bg: 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700',
      text: 'text-gray-700 dark:text-dark-text-primary dark:text-dark-text-muted',
      hoverBg: 'hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:hover:bg-gray-600'
    }
  ];

  const currentStatus = statusOptions.find(s => s.value === session.statut) || statusOptions[0];

  const renderStatusDropdown = () => (
    <div className="relative" ref={statusDropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setStatusDropdownOpen(!statusDropdownOpen);
        }}
        disabled={isUpdatingStatus}
        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${currentStatus.bg} ${currentStatus.text} hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 dark:hover:ring-gray-500 transition-all disabled:opacity-50`}
      >
        {isUpdatingStatus ? 'Mise à jour...' : currentStatus.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
      </button>
      {statusDropdownOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border dark:border-gray-700 py-1 min-w-[120px]">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(option.value);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm ${option.text} ${option.hoverBg} transition-colors`}
            >
              <span>{option.label}</span>
              {option.value === session.statut && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const getLevelStars = (level: string) => {
    const stars: Record<string, number> = { '1*': 1, '2*': 2, '3*': 3, '4*': 4 };
    const count = stars[level];
    if (count) {
      return Array(count).fill(null).map((_, i) => (
        <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
      ));
    }
    return null;
  };

  // ─── Block data resolution ──────────────────────────────────
  const getBlockMembers = (track: TrackConfig, block: TimeBlock): SessionAssignment[] => {
    if (track.role === 'accueil') {
      // Single accueil slot — show all accueil members (retrocompat: old heure values ignored)
      return session.accueil || [];
    }
    if (track.role === 'baptemes') {
      return session.baptemes || [];
    }
    if (track.role === 'gonflage' && block.slot) {
      return session.gonflage?.[block.slot] || [];
    }
    if (track.role === 'theorie' && block.slot) {
      return session.theorie?.[block.slot]?.encadrants || [];
    }
    if (track.role === 'encadrant' && track.level && block.heure) {
      const levelData = session.niveaux[track.level];
      return levelData?.encadrants.filter(e => (e.heure || '1ere_heure') === block.heure) || [];
    }
    return [];
  };

  const getBlockTheme = (track: TrackConfig, block: TimeBlock): { theme?: string; key?: string; isTheme: boolean } => {
    if (track.role === 'theorie' && block.slot) {
      return {
        theme: session.theorie?.[block.slot]?.theme,
        key: `theorie_${block.slot}`,
        isTheme: true
      };
    }
    if (track.role === 'encadrant' && track.level) {
      const heure = block.heure || '1ere_heure';
      const themeField = `theme_${heure}`;
      // Fallback: als er geen per-uur thema is, check het oude 'theme' veld voor backward compat
      const niveauData = session.niveaux[track.level];
      const themeValue = niveauData?.[themeField] || (!block.heure ? niveauData?.theme : undefined);
      return {
        theme: themeValue,
        key: `${track.level}_${heure}`,
        isTheme: true
      };
    }
    if (track.role === 'gonflage' && block.slot) {
      const noteKey = `gonflage_${block.slot}`;
      return {
        theme: session.notes?.[noteKey],
        key: noteKey,
        isTheme: false
      };
    }
    if (track.role === 'accueil' && block.slot) {
      return {
        theme: session.notes?.['accueil'],
        key: 'accueil',
        isTheme: false
      };
    }
    if (track.role === 'baptemes') {
      return {
        theme: session.notes?.['baptemes'],
        key: 'baptemes',
        isTheme: false
      };
    }
    return { isTheme: false };
  };

  // ─── Dynamic row height calculation ────────────────────────
  /** Calculate the needed height for a track row based on its content */
  const getTrackHeight = (track: TrackConfig): number => {
    const MIN_HEIGHT = 52;
    const THEME_LINE = 26;  // space for theme/comment button
    const MEMBER_HEIGHT = 24; // height per member row (with gap)
    const PADDING = 12;     // top + bottom padding

    let maxNeeded = MIN_HEIGHT;

    for (const block of track.blocks) {
      const members = getBlockMembers(track, block);
      const { key: themeKey } = getBlockTheme(track, block);

      // Calculate width percentage of this block
      const widthPct = (block.endMin - block.startMin) / (TIMELINE_END - TIMELINE_START);
      // Approximate block width in px (assume ~1100px timeline content area)
      const blockWidthPx = widthPct * 1100;
      // Each member badge is ~80px wide, + button is ~24px
      const itemsPerRow = Math.max(1, Math.floor((blockWidthPx - 12) / 82)); // 82 = badge + gap
      // The + button sits inline and overlaps — only count as extra row if there are many members
      const memberCount = Math.max(1, members.length);
      const memberRows = Math.ceil(memberCount / itemsPerRow);

      const needed = PADDING + (themeKey ? THEME_LINE : 0) + (memberRows * MEMBER_HEIGHT);
      if (needed > maxNeeded) maxNeeded = needed;
    }

    return maxNeeded;
  };

  // ─── Conflict detection: find members assigned to overlapping time blocks ───
  const conflictingMemberIds = React.useMemo(() => {
    // Build a list of all (memberId, startMin, endMin) across all tracks
    const assignments: { memberId: string; startMin: number; endMin: number }[] = [];
    for (const track of tracks) {
      for (const block of track.blocks) {
        const members = getBlockMembers(track, block);
        for (const m of members) {
          assignments.push({ memberId: m.membre_id, startMin: block.startMin, endMin: block.endMin });
        }
      }
    }
    // For each member, check if they have overlapping time ranges
    const conflicts = new Set<string>();
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (assignments[i].memberId === assignments[j].memberId) {
          const a = assignments[i];
          const b = assignments[j];
          // Overlapping if one starts before the other ends (exclusive — touching is OK)
          if (a.startMin < b.endMin && b.startMin < a.endMin) {
            conflicts.add(a.memberId);
          }
        }
      }
    }
    return conflicts;
  }, [session]);

  // ─── Empty gap zones (activatable with + button) ───────────
  const getGaps = (track: TrackConfig): { startMin: number; endMin: number }[] => {
    const gaps: { startMin: number; endMin: number }[] = [];
    const sorted = [...track.blocks].sort((a, b) => a.startMin - b.startMin);
    let cursor = 0; // timeline start = 0 (19:30)
    for (const block of sorted) {
      if (block.startMin > cursor) {
        gaps.push({ startMin: cursor, endMin: block.startMin });
      }
      cursor = Math.max(cursor, block.endMin);
    }
    if (cursor < TIMELINE_END) {
      gaps.push({ startMin: cursor, endMin: TIMELINE_END });
    }
    return gaps;
  };

  const renderGap = (track: TrackConfig, gap: { startMin: number; endMin: number }, idx: number) => {
    const left = minToPercent(gap.startMin);
    const width = minToPercent(gap.endMin) - left;
    if (width < 2) return null; // too narrow to be useful
    return (
      <div
        key={`${track.id}_gap_${idx}`}
        className="absolute top-0 bottom-0 group/gap flex items-center justify-center cursor-pointer hover:bg-gray-100/60 dark:hover:bg-gray-700/30 rounded transition-colors"
        style={{ left: `${left}%`, width: `${width}%` }}
        onClick={() => onAssignMember(session.id, track.role!, track.level)}
        title="Ajouter un membre (hors créneau)"
      >
        <div className="opacity-0 group-hover/gap:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500">
          <Plus className="w-3.5 h-3.5" />
        </div>
      </div>
    );
  };

  // ─── Block rendering ────────────────────────────────────────
  const renderBlock = (track: TrackConfig, block: TimeBlock, blockIdx: number) => {
    const left = minToPercent(block.startMin);
    const width = minToPercent(block.endMin) - left;
    const members = getBlockMembers(track, block);
    const { theme, key: themeKey, isTheme } = getBlockTheme(track, block);

    return (
      <div
        key={`${track.id}_block_${blockIdx}`}
        className={`absolute top-0 bottom-0 ${track.blockBg} border ${track.blockBorder} rounded-md flex flex-col gap-0.5 p-1.5`}
        style={{
          left: `${left}%`,
          width: `${width}%`,
        }}
      >
        {/* Theme/comment line — all use the same modal */}
        {themeKey && (
          <button
            onClick={() => openThemeModal(themeKey, theme || '')}
            className={`text-left truncate max-w-full rounded transition-colors text-[10px] leading-tight px-1 py-0.5 ${
              theme
                ? `${
                    isTheme
                      ? track.role === 'theorie'
                        ? 'text-orange-600 dark:text-orange-400 bg-orange-100/50 dark:bg-orange-900/30 font-medium'
                        : 'text-purple-600 dark:text-purple-400 bg-purple-100/50 dark:bg-purple-900/30 font-medium'
                      : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/30 font-medium'
                  }`
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 hover:bg-gray-200/50 dark:hover:bg-gray-600/30 italic'
            }`}
            title={theme || (isTheme ? 'Ajouter un thème' : 'Ajouter un commentaire')}
          >
            {theme || (isTheme ? '+ thème' : '+ comm.')}
          </button>
        )}

        {/* Members + Add button inline */}
        <div className="flex-1 flex flex-wrap gap-0.5 items-start content-start">
          {members.map((member) => {
            const hasConflict = conflictingMemberIds.has(member.membre_id);
            const badgeClass = hasConflict
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-1 ring-red-300 dark:ring-red-700'
              : track.badgeColor;
            return (
            <div
              key={member.membre_id}
              className={`group relative flex items-center gap-0.5 px-1.5 py-0.5 ${badgeClass} rounded text-[11px] font-medium whitespace-nowrap`}
              title={hasConflict ? `⚠ ${member.membre_prenom} est assigné(e) à un autre créneau au même moment` : undefined}
            >
              <span>{member.membre_prenom || '?'}</span>
              <button
                onClick={() =>
                  handleRemoveMember(member.membre_id, track.role!, track.level, block.slot, block.heure)
                }
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                title="Retirer"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
            );
          })}
          {/* Add button — inline with members */}
          <button
            onClick={() =>
              onAssignMember(session.id, track.role!, track.level, block.slot || block.heure)
            }
            className={`${track.textColor} opacity-50 hover:opacity-100 transition-opacity flex items-center justify-center w-5 h-5 rounded hover:bg-black/5 dark:hover:bg-white/10 ml-auto`}
            title="Ajouter un membre"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // ─── Track label rendering ──────────────────────────────────
  const renderTrackLabel = (track: TrackConfig) => (
    <div className={`h-full flex items-center px-3 py-2 border-b border-r border-gray-200 dark:border-gray-700 ${track.color}`}>
      <div className="flex items-center gap-2 min-w-0">
        {track.icon && <div className={track.textColor}>{track.icon}</div>}
        {track.role === 'encadrant' && track.level && (
          <div className="flex items-center gap-1">
            {getLevelStars(track.level) || (
              <span className="text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                {track.level}
              </span>
            )}
          </div>
        )}
        {track.icon && (
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {track.label}
          </span>
        )}
      </div>
    </div>
  );

  // ─── Main render ────────────────────────────────────────────
  return (
    <div className={expanded ? 'overflow-hidden' : 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-dark-border dark:border-gray-700 overflow-hidden'}>
      {/* Header */}
      <div
        className={`p-4 ${expanded ? '' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:hover:bg-gray-700/50'} transition-colors`}
        onClick={expanded ? undefined : () => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
                  {formatDate(session.date)}
                </h3>
                {onEditDate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditDate(session); }}
                    className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-500 transition-colors"
                    title="Modifier la date"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-dark-text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {session.horaireDebut} - {session.horaireFin}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {session.lieu}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await generateSessionReport(session);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
              title="Télécharger le rapport PDF"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            {renderStatusDropdown()}
            {!expanded && (isExpanded
              ? <ChevronUp className="w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
              : <ChevronDown className="w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
            <Users className="w-4 h-4" /> {session.accueil.length} accueil
          </span>
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
            <UserCheck className="w-4 h-4" /> {session.baptemes.length} baptêmes
          </span>
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
            <GraduationCap className="w-4 h-4" />
            {Object.values(session.niveaux).reduce((acc, n) => acc + n.encadrants.length, 0)} encadrants
          </span>
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
            <Gauge className="w-4 h-4" /> {Object.values(session.gonflage || {}).reduce((acc, arr) => acc + arr.length, 0)} gonflage
          </span>
        </div>
      </div>

      {/* Expanded content - TV Guide Timeline */}
      {(expanded || isExpanded) && (
        <div className="border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
          {/* Horizontal scroll slider */}
          {canScroll && (
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-3">
              <style>{`
                .timeline-slider {
                  -webkit-appearance: none; appearance: none;
                  height: 6px; border-radius: 3px; outline: none; cursor: pointer;
                }
                .timeline-slider::-webkit-slider-thumb {
                  -webkit-appearance: none; appearance: none;
                  width: 22px; height: 22px; border-radius: 50%;
                  background: #3b82f6; cursor: grab;
                  border: 3px solid white;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                }
                .timeline-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
                .timeline-slider::-moz-range-thumb {
                  width: 22px; height: 22px; border-radius: 50%;
                  background: #3b82f6; cursor: grab;
                  border: 3px solid white;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                }
              `}</style>
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">19:30</span>
              <input
                type="range"
                min="0" max="100"
                value={Math.round(scrollPercent * 100)}
                onChange={(e) => {
                  const percent = Number(e.target.value) / 100;
                  setScrollPercent(percent);
                  const el = timelineScrollRef.current;
                  if (el) { el.scrollLeft = percent * (el.scrollWidth - el.clientWidth); }
                }}
                className="timeline-slider flex-1"
                style={{ background: `linear-gradient(to right, #3b82f6 ${scrollPercent * 100}%, #e2e8f0 ${scrollPercent * 100}%)` }}
              />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">22:30</span>
            </div>
          )}

          {/* Timeline area */}
          <div
            ref={timelineScrollRef}
            className="overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onScroll={() => {
              const el = timelineScrollRef.current;
              if (el) {
                const maxScroll = el.scrollWidth - el.clientWidth;
                setScrollPercent(maxScroll > 0 ? el.scrollLeft / maxScroll : 0);
              }
            }}
          >
            <style>{`.timeline-hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            <div className="timeline-hide-scrollbar" style={{ minWidth: '1300px', display: 'grid', gridTemplateColumns: '140px 1fr' }}>
              {/* Ruler header — label */}
              <div className="h-10 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center px-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Créneau</span>
              </div>
              {/* Ruler header — timeline */}
              <div className="h-10 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 relative">
                {RULER_MARKS.map(mark => {
                  const left = minToPercent(mark.min);
                  const isMajor = MAJOR_MARKS.has(mark.min);
                  return (
                    <div key={mark.min} className="absolute top-0 bottom-0" style={{ left: `${left}%` }}>
                      <div className={`absolute bottom-0 w-px ${isMajor ? 'h-3 bg-gray-400 dark:bg-gray-500' : 'h-2 bg-gray-300 dark:bg-gray-600'}`} />
                      {isMajor && (
                        <span className="absolute bottom-3 -translate-x-1/2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {mark.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Track rows — each track is a grid row with label + timeline */}
              {tracks.map(track => {
                const trackH = getTrackHeight(track);
                return (
                  <React.Fragment key={track.id}>
                    {/* Label cell */}
                    <div style={{ height: `${trackH}px` }}>
                      {renderTrackLabel(track)}
                    </div>
                    {/* Timeline cell */}
                    <div
                      className="relative border-b border-gray-200 dark:border-gray-700"
                      style={{ height: `${trackH}px` }}
                    >
                      {/* Background grid lines */}
                      {RULER_MARKS.filter(m => MAJOR_MARKS.has(m.min)).map(mark => (
                        <div
                          key={mark.min}
                          className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-800"
                          style={{ left: `${minToPercent(mark.min)}%` }}
                        />
                      ))}

                      {/* Activatable empty gaps */}
                      {track.role && getGaps(track).map((gap, idx) => renderGap(track, gap, idx))}

                      {/* Time blocks */}
                      {track.blocks.map((block, idx) => renderBlock(track, block, idx))}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-200"></div>
                <span className="text-gray-600 dark:text-gray-300">Accueil</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-teal-100 dark:bg-teal-900/30 rounded border border-teal-200"></div>
                <span className="text-gray-600 dark:text-gray-300">Baptêmes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-100 dark:bg-gray-900/30 rounded border border-gray-300"></div>
                <span className="text-gray-600 dark:text-gray-300">Gonflage</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-100 dark:bg-orange-900/30 rounded border border-orange-200"></div>
                <span className="text-gray-600 dark:text-gray-300">Théorie</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-100 dark:bg-purple-900/30 rounded border border-purple-200"></div>
                <span className="text-gray-600 dark:text-gray-300">Niveaux</span>
              </div>
            </div>
          </div>
          {/* Observations — Carnet de Formation */}
          {showFormation && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <ObservationsList clubId={clubId} sessionId={session.id} />
            </div>
          )}
        </div>
      )}

      {/* Theme / Comment Edit Modal */}
      <ThemeEditModal
        isOpen={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        level={editingThemeLevel}
        currentTheme={editingTheme}
        onSave={handleSaveTheme}
        isNote={isNoteKey(editingThemeLevel)}
        clubId={clubId}
      />
    </div>
  );
};

export default SessionTimelineCard;

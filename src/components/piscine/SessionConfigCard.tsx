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
  Gauge
} from 'lucide-react';
import { PiscineSession, PiscineLevel, PiscineSessionStatus, SessionAssignment } from '@/types';
import { PiscineSessionService } from '@/services/piscineSessionService';
import { GONFLAGE_SLOTS, THEORIE_SLOTS, ENCADRANT_SLOTS, getSlotLabel, type GonflageSlot, LEVELS_FIRST_HOUR_ONLY, LEVELS_SECOND_HOUR_ONLY } from '@/types/piscineSlots';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeEditModal } from './ThemeEditModal';
import toast from 'react-hot-toast';

interface SessionConfigCardProps {
  session: PiscineSession;
  clubId: string;
  onAssignMember: (sessionId: string, role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant' | 'theorie', level?: string, slot?: string) => void;
  onEditSession?: (session: PiscineSession) => void;
  onEditDate?: (session: PiscineSession) => void;
  /** When true, content is always expanded and accordion toggle is hidden */
  expanded?: boolean;
}

export const SessionConfigCard: React.FC<SessionConfigCardProps> = ({
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
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const { appUser } = useAuth();
  const adminName = `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || 'Admin';

  // Fermer le dropdown en cliquant ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };

    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [statusDropdownOpen]);

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

  const handleSaveTheme = async (theme: string) => {
    try {
      // Si le level commence par "theorie_", c'est un slot théorie
      if (editingThemeLevel.startsWith('theorie_')) {
        const theorieSlot = editingThemeLevel.replace('theorie_', '');
        await PiscineSessionService.updateTheorieTheme(
          clubId,
          session.id,
          theorieSlot,
          theme,
          adminName
        );
      } else {
        await PiscineSessionService.updateTheme(
          clubId,
          session.id,
          editingThemeLevel,
          theme,
          adminName
        );
      }
      toast.success('Thème mis à jour');
    } catch (error) {
      logger.error('Error updating theme:', error);
      toast.error('Erreur lors de la mise à jour du thème');
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
        await PiscineSessionService.removeFromAccueil(clubId, session.id, membreId);
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
      hoverBg: 'hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-600'
    }
  ];

  const currentStatus = statusOptions.find(s => s.value === session.statut) || statusOptions[0];

  const renderStatusDropdown = () => {
    return (
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
                {option.value === session.statut && (
                  <Check className="w-4 h-4" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMemberList = (
    members: SessionAssignment[],
    role: 'accueil' | 'baptemes' | 'gonflage' | 'encadrant',
    level?: string
  ) => {
    if (members.length === 0) {
      return (
        <p className="text-sm text-gray-500 dark:text-dark-text-muted italic">
          Aucun membre assigné
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.membre_id}
            className="flex items-center justify-between bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {member.membre_prenom?.[0] || '?'}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-gray-100">
                {member.membre_prenom} {member.membre_nom}
              </span>
            </div>
            <button
              onClick={() => handleRemoveMember(member.membre_id, role, level)}
              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-red-500 transition-colors"
              title="Retirer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const getLevelStars = (level: string) => {
    const stars: Record<string, number> = {
      '1*': 1,
      '2*': 2,
      '3*': 3,
      '4*': 4,
    };
    const count = stars[level];
    if (count) {
      return Array(count).fill(null).map((_, i) => (
        <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
      ));
    }
    return null;
  };

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
            {renderStatusDropdown()}
            {!expanded && (
              isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
              )
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
            <Users className="w-4 h-4" />
            {session.accueil.length} accueil
          </span>
          <span className="flex items-center gap-1 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
            <UserCheck className="w-4 h-4" />
            {session.baptemes.length} baptêmes
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

      {/* Expanded content */}
      {(expanded || isExpanded) && (
        <div className="border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
          {/* Actions bar */}
          <div className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onEditSession && (
                <button
                  onClick={() => onEditSession(session)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Modifier
                </button>
              )}
            </div>
            {session.statut === PiscineSessionStatus.brouillon && (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex items-center gap-1 px-4 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isPublishing ? 'Publication...' : 'Publier'}
              </button>
            )}
          </div>

          <div className="p-4 space-y-6">
            {/* Accueil section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Équipe Accueil
                </h4>
                <button
                  onClick={() => onAssignMember(session.id, 'accueil')}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Ajouter
                </button>
              </div>
              {renderMemberList(session.accueil, 'accueil')}
            </div>

            {/* Baptêmes section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-teal-500" />
                  Baptêmes
                </h4>
                <button
                  onClick={() => onAssignMember(session.id, 'baptemes')}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Ajouter
                </button>
              </div>
              {renderMemberList(session.baptemes, 'baptemes')}
            </div>

            {/* Gonflage section — par créneau */}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2 mb-3">
                <Gauge className="w-4 h-4" /> Équipe Gonflage
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {GONFLAGE_SLOTS.map((slot) => {
                  const slotMembers = session.gonflage?.[slot] || [];
                  return (
                    <div
                      key={slot}
                      className="border border-gray-200 dark:border-dark-border dark:border-gray-600 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-dark-text-primary dark:text-white">
                          {getSlotLabel('gonflage', slot)}
                        </span>
                        <button
                          onClick={() => onAssignMember(session.id, 'gonflage', undefined, slot)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          + Ajouter
                        </button>
                      </div>
                      {slotMembers.length > 0 ? (
                        <div className="space-y-1">
                          {slotMembers.map((member) => (
                            <div
                              key={member.membre_id}
                              className="flex items-center justify-between text-sm bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded px-2 py-1"
                            >
                              <span className="text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                                {member.membre_prenom} {member.membre_nom}
                              </span>
                              <button
                                onClick={() => handleRemoveMember(member.membre_id, 'gonflage', undefined, slot)}
                                className="text-gray-400 dark:text-dark-text-muted hover:text-red-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted italic">
                          Aucun membre
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Théorie section — toujours visible */}
            <div>
                <h4 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2 mb-3">
                  <GraduationCap className="w-4 h-4 text-orange-500" />
                  Théorie
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {THEORIE_SLOTS.map((slot) => {
                    const slotData = session.theorie?.[slot] || { encadrants: [] };
                    return (
                      <div
                        key={slot}
                        className="border border-gray-200 dark:border-dark-border dark:border-gray-600 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-gray-900 dark:text-dark-text-primary dark:text-white">
                            {getSlotLabel('theorie', slot)}
                          </span>
                          <button
                            onClick={() => onAssignMember(session.id, 'theorie', undefined, slot)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            + Encadrant
                          </button>
                        </div>

                        {/* Theme */}
                        <div className="mb-2">
                          {slotData.theme ? (
                            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-sm flex justify-between items-center">
                              <div>
                                <span className="text-gray-500 dark:text-dark-text-muted">Thème: </span>
                                <span className="text-gray-900 dark:text-dark-text-primary dark:text-white">{slotData.theme}</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); openThemeModal(`theorie_${slot}`, slotData.theme || ''); }}
                                className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-500 transition-colors"
                                title="Modifier le thème"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); openThemeModal(`theorie_${slot}`, ''); }}
                              className="w-full p-2 border-2 border-dashed border-gray-300 dark:border-dark-border dark:border-gray-600 rounded text-sm text-gray-400 dark:text-dark-text-muted hover:border-orange-400 hover:text-orange-400 transition-colors"
                            >
                              + Ajouter un thème
                            </button>
                          )}
                        </div>

                        {/* Encadrants */}
                        {slotData.encadrants.length > 0 ? (
                          <div className="space-y-1">
                            {slotData.encadrants.map((enc) => (
                              <div
                                key={enc.membre_id}
                                className="flex items-center justify-between text-sm bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded px-2 py-1"
                              >
                                <span className="text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                                  {enc.membre_prenom} {enc.membre_nom}
                                </span>
                                <button
                                  onClick={() => handleRemoveMember(enc.membre_id, 'theorie', undefined, slot)}
                                  className="text-gray-400 dark:text-dark-text-muted hover:text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted italic">
                            Aucun encadrant
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
            </div>

            {/* Niveaux section — per uur */}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2 mb-3">
                <GraduationCap className="w-4 h-4 text-purple-500" />
                Niveaux
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PiscineLevel.all.map((level) => {
                  const levelAssignment = session.niveaux[level];
                  if (!levelAssignment) return null;

                  return (
                    <div
                      key={level}
                      className="border border-gray-200 dark:border-dark-border dark:border-gray-600 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center">
                            {getLevelStars(level)}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                            {PiscineLevel.displayName(level)}
                          </span>
                        </div>
                      </div>

                      {/* Theme - met edit mogelijkheid */}
                      <div className="mb-3">
                        {levelAssignment.theme ? (
                          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm flex justify-between items-center">
                            <div>
                              <span className="text-gray-500 dark:text-dark-text-muted">Thème: </span>
                              <span className="text-gray-900 dark:text-dark-text-primary dark:text-white">{levelAssignment.theme}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); openThemeModal(level, levelAssignment.theme || ''); }}
                              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-500 transition-colors"
                              title="Modifier le thème"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); openThemeModal(level, ''); }}
                            className="w-full p-2 border-2 border-dashed border-gray-300 dark:border-dark-border dark:border-gray-600 rounded text-sm text-gray-400 dark:text-dark-text-muted hover:border-blue-400 hover:text-blue-400 transition-colors"
                          >
                            + Ajouter un thème
                          </button>
                        )}
                      </div>

                      {/* Encadrants per uur — only show relevant slot(s) per level */}
                      {ENCADRANT_SLOTS
                        .filter(heure => {
                          if ((LEVELS_FIRST_HOUR_ONLY as readonly string[]).includes(level)) return heure === '1ere_heure';
                          if ((LEVELS_SECOND_HOUR_ONLY as readonly string[]).includes(level)) return heure === '2eme_heure';
                          return true;
                        })
                        .map((heure) => {
                        const heureLabel = getSlotLabel('encadrant', heure);
                        const heureEncadrants = levelAssignment.encadrants.filter(
                          enc => (enc.heure || '1ere_heure') === heure
                        );

                        return (
                          <div key={heure} className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                                {heureLabel}
                              </span>
                              <button
                                onClick={() => onAssignMember(session.id, 'encadrant', level, heure)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                + Encadrant
                              </button>
                            </div>
                            {heureEncadrants.length > 0 ? (
                              <div className="space-y-1">
                                {heureEncadrants.map((enc) => (
                                  <div
                                    key={`${enc.membre_id}_${heure}`}
                                    className="flex items-center justify-between text-sm bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded px-2 py-1"
                                  >
                                    <span className="text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                                      {enc.membre_prenom} {enc.membre_nom}
                                    </span>
                                    <button
                                      onClick={() => handleRemoveMember(enc.membre_id, 'encadrant', level, undefined, enc.heure || heure)}
                                      className="text-gray-400 dark:text-dark-text-muted hover:text-red-500"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted italic">
                                —
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Edit Modal */}
      <ThemeEditModal
        isOpen={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        level={editingThemeLevel}
        currentTheme={editingTheme}
        onSave={handleSaveTheme}
      />
    </div>
  );
};

export default SessionConfigCard;

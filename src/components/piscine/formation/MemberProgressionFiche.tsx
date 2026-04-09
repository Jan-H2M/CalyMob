import React, { useState, useEffect } from 'react';
import {
  Award, Calendar, CheckCircle2, Clock, AlertCircle,
  MapPin, User as UserIcon, BookOpen, ChevronDown, ChevronRight,
  CalendarCheck
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { lifrasService } from '@/services/lifrasService';
import { exerciceValideService } from '@/services/exerciceValideService';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { PiscineSessionService } from '@/services/piscineSessionService';
import { SessionThemeService } from '@/services/sessionThemeService';
import { ExerciceLIFRAS, NIVEAU_LABELS, NiveauLIFRAS } from '@/types/lifras.types';
import { ExerciceValide } from '@/types/exerciceValide.types';
import { MemberObservation, OBSERVATION_CATEGORIES } from '@/types/memberObservation.types';
import { PiscineSession } from '@/types/piscine.types';
import { SessionTheme } from '@/types/sessionTheme.types';
import { ObservationBadge } from '../ObservationBadge';

/**
 * Direct mapping from plongeur_code to:
 *  - exerciseNiveau: which exercises to load (the LIFRAS niveau code)
 *  - goalLabel: the brevet they're working towards
 *
 * NB member → does NB exercises → to become 1*
 * 1* member → does P2 exercises → to become 2*
 * 2* member → does P3 exercises → to become 3*
 * etc.
 */
const TARGET_MAP: Record<string, { exerciseNiveau: NiveauLIFRAS; goalLabel: string }> = {
  'NB':  { exerciseNiveau: 'NB', goalLabel: 'Plongeur 1★' },
  '1':   { exerciseNiveau: 'P2', goalLabel: 'Plongeur 2★' },
  '2':   { exerciseNiveau: 'P3', goalLabel: 'Plongeur 3★' },
  '3':   { exerciseNiveau: 'P4', goalLabel: 'Plongeur 4★' },
  '4':   { exerciseNiveau: 'AM', goalLabel: 'Assistant Moniteur' },
  'AM':  { exerciseNiveau: 'MC', goalLabel: 'Moniteur Club' },
  'MC':  { exerciseNiveau: 'MF', goalLabel: 'Moniteur Fédéral' },
  'MF':  { exerciseNiveau: 'MN', goalLabel: 'Moniteur National' },
};

/**
 * Map plongeur_code to the piscine session level key (niveaux dict key)
 * NB members swim with 1* group
 */
const PLONGEUR_TO_PISCINE_LEVEL: Record<string, string> = {
  'NB': '1*', '1': '1*', '2': '2*', '3': '3*',
  '4': '4*', 'AM': 'AM', 'MC': 'MC',
};

function getTargetNiveau(plongeurCode: string): NiveauLIFRAS | null {
  return TARGET_MAP[plongeurCode]?.exerciseNiveau ?? null;
}

function getTargetLabel(plongeurCode: string): string {
  return TARGET_MAP[plongeurCode]?.goalLabel ?? '';
}

/** Get the start of the current diving season (September 1) */
function getSeasonStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 8, 1); // September 1
}

interface MemberProgressionFicheProps {
  memberId: string;
  memberName: string;
  plongeurCode: string;  // '1', '2', '3', '4', 'AM', 'MC' etc.
  observations: MemberObservation[];
}

/** Enriched attendance record with theme info */
interface AttendanceWithTheme extends AttendanceRecord {
  themeName?: string;
  themeCategory?: string;
}

export function MemberProgressionFiche({
  memberId,
  memberName,
  plongeurCode,
  observations,
}: MemberProgressionFicheProps) {
  const { clubId } = useAuth();
  const [exercicesLIFRAS, setExercicesLIFRAS] = useState<ExerciceLIFRAS[]>([]);
  const [exercicesValides, setExercicesValides] = useState<ExerciceValide[]>([]);
  const [attendances, setAttendances] = useState<AttendanceWithTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllObs, setShowAllObs] = useState(false);
  const [showAllAtt, setShowAllAtt] = useState(false);

  const targetNiveau = getTargetNiveau(plongeurCode);
  const targetLabel = getTargetLabel(plongeurCode);
  // Current level label based on plongeur_code
  const CURRENT_LABELS: Record<string, string> = {
    'NB': 'Non Breveté', '1': 'Plongeur 1★', '2': 'Plongeur 2★',
    '3': 'Plongeur 3★', '4': 'Plongeur 4★', 'AM': 'Assistant Moniteur',
    'MC': 'Moniteur Club', 'MF': 'Moniteur Fédéral', 'MN': 'Moniteur National',
  };
  const currentLabel = CURRENT_LABELS[plongeurCode] || plongeurCode;

  useEffect(() => {
    if (!clubId || !memberId) return;
    setLoading(true);

    const seasonStart = getSeasonStart();
    const piscineLevel = PLONGEUR_TO_PISCINE_LEVEL[plongeurCode];

    const promises: Promise<any>[] = [
      exerciceValideService.getExercicesValides(clubId, memberId),
      // Load attendance for this member since season start
      attendanceService.getAttendanceForMember(clubId, memberId, seasonStart),
    ];

    // Load LIFRAS exercises for the TARGET niveau (next brevet)
    if (targetNiveau) {
      promises.push(lifrasService.getExercicesByNiveau(clubId, targetNiveau));
    }

    Promise.all(promises)
      .then(async ([valides, rawAttendances, lifras]) => {
        setExercicesValides(valides || []);
        // Sort exercises alphabetically by code
        const sorted = (lifras || []).sort((a: ExerciceLIFRAS, b: ExerciceLIFRAS) =>
          a.code.localeCompare(b.code)
        );
        setExercicesLIFRAS(sorted);

        // Enrich attendance records with theme info from piscine sessions
        const enriched = await enrichAttendancesWithThemes(
          clubId, rawAttendances || [], piscineLevel, seasonStart
        );
        setAttendances(enriched);

        setLoading(false);
      })
      .catch(err => {
        console.error('[MemberFiche] Error loading data:', err);
        setLoading(false);
      });
  }, [clubId, memberId, targetNiveau, plongeurCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mr-2" />
        Chargement de la fiche...
      </div>
    );
  }

  // Build set of validated exercise codes for quick lookup
  const validatedCodes = new Set(exercicesValides.map(ev => ev.exercice_code));
  const validatedById = new Map(exercicesValides.map(ev => [ev.exercice_code, ev]));

  // Group LIFRAS exercises: niveau-specific first, then TN
  const niveauExercices = exercicesLIFRAS.filter(e => e.niveau !== 'TN');
  const tnExercices = exercicesLIFRAS.filter(e => e.niveau === 'TN');

  const totalExercices = exercicesLIFRAS.length;
  const validatedCount = exercicesLIFRAS.filter(e => validatedCodes.has(e.code)).length;
  const progressPct = totalExercices > 0 ? Math.round((validatedCount / totalExercices) * 100) : 0;

  // Observations to display (max 5, unless "show all")
  const displayedObs = showAllObs ? observations : observations.slice(0, 5);

  // Attendance to display (max 8, unless "show all")
  const displayedAtt = showAllAtt ? attendances : attendances.slice(0, 8);

  // No target = already at highest level
  if (!targetNiveau && !loading) {
    return (
      <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-900/50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 text-center">
          <Award className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {currentLabel} — Niveau le plus élevé atteint
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Pas d'exercices de progression disponibles
          </p>
        </div>

        {/* Still show attendance even for highest level */}
        <AttendanceSection
          attendances={attendances}
          displayedAtt={displayedAtt}
          showAllAtt={showAllAtt}
          setShowAllAtt={setShowAllAtt}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-900/50 space-y-4">
      {/* Progress summary bar */}
      {totalExercices > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {currentLabel} → <span className="text-blue-600 font-semibold">{targetLabel}</span>
            </span>
            <span className="text-sm font-bold text-blue-600">
              {validatedCount}/{totalExercices} exercices ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Exercices LIFRAS checklist */}
      {exercicesLIFRAS.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800">
            <Award className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">
              Exercices pour devenir {targetLabel}
            </span>
          </div>

          {/* Niveau-specific exercises */}
          {niveauExercices.length > 0 && (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {niveauExercices.map(ex => {
                const isValidated = validatedCodes.has(ex.code);
                const validation = validatedById.get(ex.code);
                return (
                  <div key={ex.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${
                    isValidated ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                  }`}>
                    {isValidated ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                    )}
                    <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">{ex.code}</span>
                    <span className={`flex-1 ${isValidated ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {ex.description}
                    </span>
                    {isValidated && validation && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {validation.date_validation.toLocaleDateString('fr-BE', { day: '2-digit', month: 'short', year: '2-digit' })}
                        {' · '}{validation.moniteur_nom}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TN (Tous Niveaux) exercises */}
          {tnExercices.length > 0 && (
            <>
              <div className="px-3 py-1.5 bg-teal-50 dark:bg-teal-900/20 border-t border-teal-200 dark:border-teal-800">
                <span className="text-xs font-medium text-teal-600 dark:text-teal-400">Tous Niveaux</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {tnExercices.map(ex => {
                  const isValidated = validatedCodes.has(ex.code);
                  const validation = validatedById.get(ex.code);
                  return (
                    <div key={ex.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      isValidated ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                    }`}>
                      {isValidated ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                      )}
                      <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">{ex.code}</span>
                      <span className={`flex-1 ${isValidated ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {ex.description}
                      </span>
                      {ex.specialite && (
                        <span className="text-xs text-teal-600 dark:text-teal-400 flex-shrink-0">
                          {ex.specialite}
                        </span>
                      )}
                      {isValidated && validation && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {validation.date_validation.toLocaleDateString('fr-BE', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Observations this season */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
            Observations cette saison
          </span>
          <span className="text-xs text-blue-500 bg-blue-100 dark:bg-blue-900/50 rounded-full px-2 py-0.5">
            {observations.length}
          </span>
        </div>

        {observations.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center italic">
            Aucune observation enregistrée cette saison
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {displayedObs.map(obs => {
                const catLabel = OBSERVATION_CATEGORIES.find(
                  c => c.value === obs.category
                )?.label ?? obs.category;
                const dateStr = obs.contextDate.toLocaleDateString('fr-BE', {
                  day: '2-digit', month: 'short'
                });
                return (
                  <div key={obs.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="text-xs text-gray-400 w-14 flex-shrink-0">{dateStr}</span>
                    <ObservationBadge result={obs.result} />
                    <span className="text-gray-500 text-xs">{catLabel}</span>
                    {obs.exerciceCode && (
                      <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1 rounded">
                        {obs.exerciceCode}
                      </span>
                    )}
                    {obs.themeTitle && (
                      <span className="text-xs text-purple-600 truncate max-w-[140px]">
                        {obs.themeTitle}
                      </span>
                    )}
                    {obs.note && (
                      <span className="text-xs text-gray-400 truncate flex-1" title={obs.note}>
                        — {obs.note}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-300 flex-shrink-0">
                      {obs.observerName}
                    </span>
                  </div>
                );
              })}
            </div>
            {observations.length > 5 && (
              <button
                onClick={() => setShowAllObs(!showAllObs)}
                className="w-full py-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border-t border-gray-100 dark:border-gray-700">
                {showAllObs ? 'Moins' : `Voir toutes les ${observations.length} observations`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Attendance this season */}
      <AttendanceSection
        attendances={attendances}
        displayedAtt={displayedAtt}
        showAllAtt={showAllAtt}
        setShowAllAtt={setShowAllAtt}
      />
    </div>
  );
}

// ── Attendance Section Component ──────────────────────────────────────

function AttendanceSection({
  attendances,
  displayedAtt,
  showAllAtt,
  setShowAllAtt,
}: {
  attendances: AttendanceWithTheme[];
  displayedAtt: AttendanceWithTheme[];
  showAllAtt: boolean;
  setShowAllAtt: (v: boolean) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
        <CalendarCheck className="w-4 h-4 text-green-600" />
        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
          Présences cette saison
        </span>
        <span className="text-xs text-green-500 bg-green-100 dark:bg-green-900/50 rounded-full px-2 py-0.5">
          {attendances.length}
        </span>
      </div>

      {attendances.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center italic">
          Aucune présence enregistrée cette saison
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {displayedAtt.map(att => {
              const dateStr = att.checked_in_at.toLocaleDateString('fr-BE', {
                day: '2-digit', month: 'short',
              });
              const isPiscine = att.operation_titre?.toLowerCase().includes('piscine') ||
                                att.operation_titre?.toLowerCase().includes('zwembad');
              return (
                <div key={att.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-xs text-gray-400 w-14 flex-shrink-0">{dateStr}</span>
                  {isPiscine ? (
                    <span className="text-xs bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 px-1.5 py-0.5 rounded font-medium">
                      Piscine
                    </span>
                  ) : (
                    <span className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                      Événement
                    </span>
                  )}
                  <span className="text-gray-700 dark:text-gray-300 text-xs truncate flex-1">
                    {att.operation_titre || 'Check-in'}
                  </span>
                  {att.themeName && (
                    <span className="text-xs text-purple-600 dark:text-purple-400 truncate max-w-[180px]" title={att.themeName}>
                      🎯 {att.themeName}
                    </span>
                  )}
                  <span className="text-xs text-gray-300 flex-shrink-0 ml-auto">
                    {att.scan_method === 'qr' ? '📱' : att.scan_method === 'barcode' ? '📋' : '✋'}
                  </span>
                </div>
              );
            })}
          </div>
          {attendances.length > 8 && (
            <button
              onClick={() => setShowAllAtt(!showAllAtt)}
              className="w-full py-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors border-t border-gray-100 dark:border-gray-700">
              {showAllAtt ? 'Moins' : `Voir toutes les ${attendances.length} présences`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Theme enrichment helper ───────────────────────────────────────────

/**
 * Cross-reference attendance records with piscine sessions to find
 * the theme that was being taught for the member's level on that date.
 */
async function enrichAttendancesWithThemes(
  clubId: string,
  attendances: AttendanceRecord[],
  piscineLevel: string | undefined,
  seasonStart: Date
): Promise<AttendanceWithTheme[]> {
  if (attendances.length === 0) return [];

  try {
    // Load piscine sessions for the season (month by month from season start to now)
    const now = new Date();
    const sessionPromises: Promise<PiscineSession[]>[] = [];
    const d = new Date(seasonStart);
    while (d <= now) {
      sessionPromises.push(
        PiscineSessionService.getSessionsForMonth(clubId, d.getFullYear(), d.getMonth() + 1)
      );
      d.setMonth(d.getMonth() + 1);
    }

    const sessionArrays = await Promise.all(sessionPromises);
    const allSessions = sessionArrays.flat();

    // Build maps: sessionId → session (direct match for piscine scans),
    // operationId → session (event scans), and date → session (fallback).
    const sessionById = new Map<string, PiscineSession>();
    const sessionByOpId = new Map<string, PiscineSession>();
    const sessionByDate = new Map<string, PiscineSession>(); // 'YYYY-MM-DD' → session
    for (const s of allSessions) {
      if (s.id) sessionById.set(s.id, s);
      if (s.operationId) sessionByOpId.set(s.operationId, s);
      const dateKey = s.date.toISOString().split('T')[0];
      sessionByDate.set(dateKey, s);
    }

    // Collect unique theme IDs to load titles
    const themeIds = new Set<string>();
    for (const s of allSessions) {
      if (!piscineLevel || !s.niveaux?.[piscineLevel]) continue;
      const lvl = s.niveaux[piscineLevel];
      if (lvl.theme) themeIds.add(lvl.theme);
      if (lvl.theme_1ere_heure) themeIds.add(lvl.theme_1ere_heure);
      if (lvl.theme_2eme_heure) themeIds.add(lvl.theme_2eme_heure);
    }

    // Load theme titles
    const themeMap = new Map<string, SessionTheme>();
    if (themeIds.size > 0) {
      const themes = await SessionThemeService.getThemes(clubId);
      for (const t of themes) {
        if (themeIds.has(t.id)) themeMap.set(t.id, t);
      }
    }

    // Enrich each attendance
    return attendances.map(att => {
      const enriched: AttendanceWithTheme = { ...att };

      if (!piscineLevel) return enriched;

      // Try to find matching piscine session
      let session: PiscineSession | undefined;
      // 1. Direct match via piscine_session_id (from piscine_sessions/*/attendees)
      if (att.piscine_session_id) {
        session = sessionById.get(att.piscine_session_id);
      }
      // 2. Via operation_id (event scans on a piscine operation)
      if (!session && att.operation_id) {
        session = sessionByOpId.get(att.operation_id);
      }
      // 3. Fallback: match by date
      if (!session) {
        const dateKey = att.checked_in_at.toISOString().split('T')[0];
        session = sessionByDate.get(dateKey);
      }

      if (session && session.niveaux?.[piscineLevel]) {
        const lvl = session.niveaux[piscineLevel];
        // Prefer per-hour themes, fall back to single theme
        const themeId = lvl.theme_1ere_heure || lvl.theme_2eme_heure || lvl.theme;
        if (themeId) {
          const theme = themeMap.get(themeId);
          if (theme) {
            enriched.themeName = theme.title;
            enriched.themeCategory = theme.category;
          }
        }
      }

      return enriched;
    });
  } catch (error) {
    console.error('[MemberFiche] Error enriching attendance with themes:', error);
    // Return attendances without theme info rather than failing
    return attendances.map(att => ({ ...att }));
  }
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, Save, GraduationCap, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PiscineSessionService } from '@/services/piscineSessionService';
import { SessionThemeService } from '@/services/sessionThemeService';
import { PiscineSession, LevelAssignment } from '@/types';
import { SessionTheme } from '@/types/sessionTheme.types';
import { useCarnetFormationGuard } from '@/hooks/useFeatureFlags';
import toast from 'react-hot-toast';

const NIVEAUX = ['1*', '2*', '3*', '4*', 'AM', 'MC'] as const;

/** Which theme field to read/write per niveau */
function themeKey(niveau: string): 'theme_1ere_heure' | 'theme_2eme_heure' {
  return niveau === '1*' ? 'theme_1ere_heure' : 'theme_2eme_heure';
}

function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 8 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
}

/** Get season date range: Sep 1 → Aug 31 */
function seasonRange(season: string): { start: Date; end: Date } {
  const [startYear] = season.split('-').map(Number);
  return {
    start: new Date(startYear, 8, 1),   // Sep 1
    end: new Date(startYear + 1, 7, 31), // Aug 31
  };
}

/** Row data derived from a PiscineSession for a given niveau */
interface PlanningRow {
  sessionId: string;
  date: Date;
  theme: string;
  theoryTopic: string;
  moniteur1: string;
  moniteur2: string;
  statut: string;
}

/** Extract a PlanningRow from a session for a given niveau */
function sessionToRow(session: PiscineSession, niveau: string): PlanningRow {
  const niv = session.niveaux?.[niveau];
  const key = themeKey(niveau);
  const encadrants = niv?.encadrants || [];

  // Theory: check all theorie slots for a theme
  let theoryTopic = '';
  if (session.theorie) {
    for (const slot of Object.values(session.theorie)) {
      if ((slot as LevelAssignment)?.theme) {
        theoryTopic = (slot as LevelAssignment).theme || '';
        break;
      }
    }
  }

  return {
    sessionId: session.id,
    date: session.date,
    theme: (niv as any)?.[key] || '',
    theoryTopic,
    moniteur1: encadrants[0]
      ? `${encadrants[0].membre_prenom} ${encadrants[0].membre_nom}`.trim()
      : '',
    moniteur2: encadrants[1]
      ? `${encadrants[1].membre_prenom} ${encadrants[1].membre_nom}`.trim()
      : '',
    statut: session.statut,
  };
}

export function SessionPlanningPage() {
  const { clubId, appUser } = useAuth();
  const { visible } = useCarnetFormationGuard(clubId);
  const [season, setSeason] = useState(getCurrentSeason);
  const [selectedNiveau, setSelectedNiveau] = useState<string>('1*');
  const [sessions, setSessions] = useState<PiscineSession[]>([]);
  const [themes, setThemes] = useState<SessionTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // Local edits keyed by sessionId
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<PlanningRow>>>({});

  // Load all piscine_sessions for the season
  useEffect(() => {
    setLoading(true);
    const { start, end } = seasonRange(season);
    // Subscribe to all months in the season
    const unsubscribers: (() => void)[] = [];
    const allSessions: Record<string, PiscineSession> = {};
    let loadedMonths = 0;
    const totalMonths = 12; // Sep → Aug

    for (let i = 0; i < totalMonths; i++) {
      const m = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const unsub = PiscineSessionService.subscribeToSessionsForMonth(
        clubId, m.getFullYear(), m.getMonth() + 1,
        (monthSessions) => {
          for (const s of monthSessions) allSessions[s.id] = s;
          loadedMonths++;
          if (loadedMonths >= totalMonths) {
            const sorted = Object.values(allSessions).sort(
              (a, b) => a.date.getTime() - b.date.getTime()
            );
            setSessions(sorted);
            setLoading(false);
          }
        }
      );
      unsubscribers.push(unsub);
    }

    return () => {
      unsubscribers.forEach(u => u());
    };
  }, [clubId, season]);

  // Reset local edits when season or niveau changes
  useEffect(() => {
    setLocalEdits({});
    setDirtyIds(new Set());
  }, [season, selectedNiveau]);

  // Load themes for combobox
  useEffect(() => {
    const unsub = SessionThemeService.subscribeToThemes(clubId, (allThemes) => {
      setThemes(allThemes.filter(t => t.targetNiveaux.includes(selectedNiveau)));
    });
    return unsub;
  }, [clubId, selectedNiveau]);

  // Build rows from sessions + local edits
  const rows: PlanningRow[] = useMemo(() => {
    return sessions.map(s => {
      const base = sessionToRow(s, selectedNiveau);
      const edits = localEdits[s.id];
      return edits ? { ...base, ...edits } : base;
    });
  }, [sessions, selectedNiveau, localEdits]);

  const updateRow = useCallback((sessionId: string, field: keyof PlanningRow, value: string) => {
    setLocalEdits(prev => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], [field]: value },
    }));
    setDirtyIds(prev => new Set(prev).add(sessionId));
  }, []);

  const handleSave = useCallback(async () => {
    if (dirtyIds.size === 0) return;
    setSaving(true);
    const key = themeKey(selectedNiveau);
    const adminName = `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim();

    try {
      for (const sessionId of dirtyIds) {
        const edits = localEdits[sessionId];
        if (!edits) continue;

        const session = sessions.find(s => s.id === sessionId);
        if (!session) continue;

        // Build updated niveaux for this level
        const currentNiv = session.niveaux?.[selectedNiveau] || { encadrants: [] };
        const updatedNiv: Record<string, unknown> = { ...currentNiv };

        if (edits.theme !== undefined) {
          updatedNiv[key] = edits.theme;
          updatedNiv[`${key}_updated_by`] = adminName;
          updatedNiv[`${key}_updated_at`] = new Date();
        }

        // Update the session's niveaux
        const updatedNiveaux = { ...session.niveaux, [selectedNiveau]: updatedNiv };
        await PiscineSessionService.updateSession(clubId, sessionId, {
          niveaux: updatedNiveaux as any,
        });
      }

      toast.success(`${dirtyIds.size} séance(s) mise(s) à jour`);
      setDirtyIds(new Set());
      setLocalEdits({});
    } catch (e) {
      console.error('Save error:', e);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }, [clubId, selectedNiveau, dirtyIds, localEdits, sessions, appUser]);

  const shiftSeason = (dir: number) => {
    const [startStr] = season.split('-');
    const start = parseInt(startStr) + dir;
    setSeason(`${start}-${start + 1}`);
  };

  const isDirty = dirtyIds.size > 0;

  if (!visible) return null;

  const formatDate = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const isPast = (d: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Planning Formation
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftSeason(-1)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-semibold min-w-[110px] text-center">
            {season}
          </span>
          <button onClick={() => shiftSeason(1)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Niveau tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {NIVEAUX.map(n => (
          <button key={n}
            onClick={() => setSelectedNiveau(n)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${selectedNiveau === n
                ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}>
            {n}
          </button>
        ))}
      </div>

      {/* Planning table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Calendar className="w-5 h-5 mr-2 animate-pulse" />
            Chargement...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-28">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Thème</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-40">Théorie</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-36">Moniteur 1</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-36">Moniteur 2</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                        Aucune séance piscine pour cette saison.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.sessionId}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50
                        ${isPast(row.date) ? 'opacity-60' : ''}
                        ${dirtyIds.has(row.sessionId) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          list={`themes-${row.sessionId}`}
                          value={row.theme}
                          placeholder="Tapez ou choisissez un thème…"
                          onChange={e => updateRow(row.sessionId, 'theme', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
                        />
                        <datalist id={`themes-${row.sessionId}`}>
                          {themes.map(t => (
                            <option key={t.id} value={t.title} />
                          ))}
                        </datalist>
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
                        {row.theoryTopic}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
                        {row.moniteur1}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
                        {row.moniteur2}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <span className="text-sm text-gray-400">
                {rows.length} séance{rows.length !== 1 ? 's' : ''} · source: piscine sessions
              </span>
              <button onClick={handleSave}
                disabled={!isDirty || saving}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isDirty
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                <Save className="w-4 h-4" />
                {saving ? 'Enregistrement...' : isDirty ? `Enregistrer (${dirtyIds.size})` : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, User, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronRight, Search, Users, GraduationCap, UserX
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { MemberObservationService } from '@/services/memberObservationService';
import { MemberObservation } from '@/types/memberObservation.types';
import { useCarnetFormationGuard } from '@/hooks/useFeatureFlags';
import { MemberProgressionFiche } from './MemberProgressionFiche';
import { getMembres } from '@/services/membreService';
import { Membre } from '@/types';

// Niveaux affichés dans les tabs
const NIVEAUX = ['NB', '1*', '2*', '3*', '4*', 'AM', 'MC'] as const;

// Map tab niveau to plongeur_code values in Firestore
const NIVEAU_TO_CODES: Record<string, string[]> = {
  'NB': ['NB'],
  '1*': ['1', '1*'],
  '2*': ['2', '2*'],
  '3*': ['3', '3*'],
  '4*': ['4', '4*'],
  'AM': ['AM'],
  'MC': ['MC'],
};

function getSeasonDates(season: string): { start: Date; end: Date } {
  const [startYear] = season.split('-').map(Number);
  return {
    start: new Date(startYear, 8, 1),   // 1 Sep
    end: new Date(startYear + 1, 7, 31) // 31 Aug
  };
}

function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() < 8 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
}

function getMemberDisplayName(m: Membre): string {
  if (m.displayName) return m.displayName;
  const prenom = m.prenom || '';
  const nom = m.nom || '';
  return `${prenom} ${nom}`.trim() || m.email || 'Inconnu';
}

function matchesNiveau(membre: Membre, niveau: string): boolean {
  const codes = NIVEAU_TO_CODES[niveau] || [];
  const memberCode = membre.plongeur_code || '';
  const niveauStr = (membre.plongeur_niveau || membre.niveau_plongee || '').toLowerCase();

  if (codes.includes(memberCode)) return true;

  const niveauLabel = niveau.replace('*', '');
  if (niveau.endsWith('*')) {
    return niveauStr.includes(`plongeur ${niveauLabel}`) || niveauStr === niveau.toLowerCase();
  }
  if (niveau === 'NB') return niveauStr.includes('non breveté') || niveauStr.includes('non brevete');
  if (niveau === 'AM') return niveauStr.includes('assistant moniteur');
  if (niveau === 'MC') return niveauStr.includes('moniteur club');

  return false;
}

interface MemberWithStats {
  id: string;
  name: string;
  niveau: string;
  formationActive: boolean;
  acquis: number;
  enProgres: number;
  aRevoir: number;
  total: number;
  observations: MemberObservation[];
}

export function ProgressionDashboard() {
  const { clubId } = useAuth();
  const { visible } = useCarnetFormationGuard(clubId);
  const [season] = useState(getCurrentSeason);
  const [selectedNiveau, setSelectedNiveau] = useState<string>('1*');
  const [members, setMembers] = useState<MemberWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [niveauCounts, setNiveauCounts] = useState<Record<string, number>>({});

  // Load all active members once for niveau counts
  useEffect(() => {
    getMembres(clubId)
      .then(allMembers => {
        const active = allMembers.filter(m =>
          !m.member_status || m.member_status === 'active'
        );
        const counts: Record<string, number> = {};
        for (const n of NIVEAUX) {
          counts[n] = active.filter(m => matchesNiveau(m, n)).length;
        }
        setNiveauCounts(counts);
      })
      .catch(err => console.error('[Progression] Error loading members:', err));
  }, [clubId]);

  // Load members + observations for selected niveau
  useEffect(() => {
    setLoading(true);
    const { start, end } = getSeasonDates(season);

    const membersPromise = getMembres(clubId);
    const obsPromise = MemberObservationService.getObservationsForNiveau(clubId, selectedNiveau, start, end)
      .catch(err => {
        console.warn(`[Progression] Observations query failed:`, err);
        return [] as MemberObservation[];
      });

    Promise.all([membersPromise, obsPromise])
      .then(([allMembers, observations]) => {
        const activeMembers = allMembers.filter(m =>
          !m.member_status || m.member_status === 'active'
        );
        const niveauMembers = activeMembers.filter(m => matchesNiveau(m, selectedNiveau));

        const obsMap = new Map<string, MemberObservation[]>();
        for (const obs of observations) {
          const list = obsMap.get(obs.memberId) || [];
          list.push(obs);
          obsMap.set(obs.memberId, list);
        }

        const result: MemberWithStats[] = niveauMembers.map(m => {
          const memberObs = obsMap.get(m.id) || [];
          return {
            id: m.id,
            name: getMemberDisplayName(m),
            niveau: m.plongeur_code || selectedNiveau,
            formationActive: !!(m as any).formation_active,
            acquis: memberObs.filter(o => o.result === 'acquis').length,
            enProgres: memberObs.filter(o => o.result === 'en_progres').length,
            aRevoir: memberObs.filter(o => o.result === 'a_revoir').length,
            total: memberObs.length,
            observations: memberObs.sort((a, b) =>
              b.contextDate.getTime() - a.contextDate.getTime()
            ),
          };
        });

        // Edge case: deactivated members with observations
        for (const [memberId, obs] of obsMap) {
          if (!result.find(r => r.id === memberId)) {
            result.push({
              id: memberId,
              name: obs[0].memberName,
              niveau: obs[0].memberNiveau,
              formationActive: true,
              acquis: obs.filter(o => o.result === 'acquis').length,
              enProgres: obs.filter(o => o.result === 'en_progres').length,
              aRevoir: obs.filter(o => o.result === 'a_revoir').length,
              total: obs.length,
              observations: obs.sort((a, b) =>
                b.contextDate.getTime() - a.contextDate.getTime()
              ),
            });
          }
        }

        result.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(result);
        setLoading(false);
      })
      .catch(err => {
        console.error('[Progression] Failed to load members:', err);
        setLoading(false);
      });
  }, [clubId, selectedNiveau, season]);

  // Toggle formation_active on a member
  const toggleFormation = useCallback(async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    const newValue = !member.formationActive;

    // Optimistic update
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, formationActive: newValue } : m
    ));

    try {
      const memberRef = doc(db, 'clubs', clubId, 'members', memberId);
      await updateDoc(memberRef, { formation_active: newValue });
    } catch (err) {
      console.error('[Progression] Failed to update formation_active:', err);
      // Rollback
      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, formationActive: !newValue } : m
      ));
    }
  }, [members, clubId]);

  const filtered = search
    ? members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : members;

  const enFormation = filtered.filter(m => m.formationActive);
  const autresMembres = filtered.filter(m => !m.formationActive);

  const formationMembers = members.filter(m => m.formationActive);
  const totals = {
    enFormation: formationMembers.length,
    acquis: formationMembers.reduce((s, m) => s + m.acquis, 0),
    enProgres: formationMembers.reduce((s, m) => s + m.enProgres, 0),
    aRevoir: formationMembers.reduce((s, m) => s + m.aRevoir, 0),
  };

  if (!visible) return null;

  // Render a member row
  const renderMemberRow = (m: MemberWithStats) => (
    <div key={m.id}>
      <div className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        {/* Formation toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFormation(m.id); }}
          title={m.formationActive ? 'Retirer de la formation' : 'Ajouter à la formation'}
          className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all
            ${m.formationActive
              ? 'bg-blue-500 border-blue-500 text-white hover:bg-blue-600'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-300 hover:border-blue-400 hover:text-blue-400'
            }`}>
          <GraduationCap className="w-3.5 h-3.5" />
        </button>

        {/* Expand button + name */}
        <button
          onClick={() => setExpandedMember(expandedMember === m.id ? null : m.id)}
          className="flex items-center gap-2 flex-1 text-left min-w-0">
          {expandedMember === m.id
            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <span className="font-medium text-gray-800 dark:text-white truncate">
            {m.name}
          </span>
        </button>

        {/* Progress bar + stats */}
        {m.total > 0 ? (
          <>
            <div className="flex gap-0.5 h-4 w-24 rounded overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
              <div className="bg-green-500 h-full"
                style={{ width: `${(m.acquis / m.total) * 100}%` }} />
              <div className="bg-yellow-400 h-full"
                style={{ width: `${(m.enProgres / m.total) * 100}%` }} />
              <div className="bg-red-400 h-full"
                style={{ width: `${(m.aRevoir / m.total) * 100}%` }} />
            </div>
            <span className="text-xs text-gray-500 min-w-[60px] text-right flex-shrink-0">
              {m.acquis}/{m.total} obs.
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-300 dark:text-gray-600 italic min-w-[80px] text-right flex-shrink-0">
            Pas d'observations
          </span>
        )}
      </div>

      {/* Expanded member fiche */}
      {expandedMember === m.id && (
        <MemberProgressionFiche
          memberId={m.id}
          memberName={m.name}
          plongeurCode={m.niveau}
          observations={m.observations}
        />
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Progression des membres
          </h1>
        </div>
        <span className="text-sm text-gray-500">Saison {season}</span>
      </div>

      {/* Niveau tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {NIVEAUX.map(n => (
          <button key={n} onClick={() => setSelectedNiveau(n)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5
              ${selectedNiveau === n
                ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}>
            {n}
            {niveauCounts[n] !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                selectedNiveau === n
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
              }`}>
                {niveauCounts[n]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-blue-500" />
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{totals.enFormation}</div>
          </div>
          <div className="text-xs text-blue-600">En formation</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{totals.acquis}</div>
          </div>
          <div className="text-xs text-green-600">Acquis</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-500" />
            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{totals.enProgres}</div>
          </div>
          <div className="text-xs text-yellow-600">En progrès</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{totals.aRevoir}</div>
          </div>
          <div className="text-xs text-red-600">À revoir</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Chercher un membre..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <BarChart3 className="w-5 h-5 mr-2 animate-pulse" /> Chargement...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {members.length === 0
            ? `Aucun membre actif avec le niveau ${selectedNiveau}`
            : 'Aucun résultat pour cette recherche'}
        </div>
      ) : (
        <div className="space-y-4">
          {/* EN FORMATION section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-blue-200 dark:border-blue-800 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                En formation
              </span>
              <span className="text-xs text-blue-500 bg-blue-100 dark:bg-blue-900/50 rounded-full px-2 py-0.5">
                {enFormation.length}
              </span>
            </div>
            {enFormation.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm italic">
                Cliquez sur <GraduationCap className="w-3.5 h-3.5 inline -mt-0.5" /> pour ajouter des membres à la formation
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {enFormation.map(renderMemberRow)}
              </div>
            )}
          </div>

          {/* AUTRES MEMBRES section */}
          {autresMembres.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-200 dark:border-gray-700">
                <Users className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Autres membres {selectedNiveau}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">
                  {autresMembres.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {autresMembres.map(renderMemberRow)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

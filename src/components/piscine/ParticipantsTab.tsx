import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, UserPlus, X, ChevronDown, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PiscineParticipantsService } from '@/services/piscineParticipantsService';
import { SessionParticipant, SessionFormation, FormationGroup } from '@/types/piscine.types';
import { getMembres } from '@/services/membreService';
import { Membre } from '@/types';
import toast from 'react-hot-toast';

interface Props {
  sessionId: string;
  totalScanned: number;
}

// ── Drag payload ────────────────────────────────────────────────────────────
interface DragPayload {
  participantId: string;
  fromFormationId: string | null;
  fromGroupId: string | null;
}

// ── Level display helper ────────────────────────────────────────────────────
function levelBadge(level: string): string {
  if (!level || level === 'NB') return 'NB';
  return level;
}

function levelColor(level: string): string {
  if (level === 'NB') return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  if (level.startsWith('P1') || level === '1*') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (level.startsWith('P2') || level === '2*') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
  if (level.startsWith('P3') || level === '3*') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';
  if (level.startsWith('P4') || level === '4*') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
  return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
}

// ── ParticipantChip ─────────────────────────────────────────────────────────
interface ChipProps {
  participant: SessionParticipant;
  isScanned: boolean;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  onRemove: (id: string) => void;
}

const ParticipantChip: React.FC<ChipProps> = ({ participant, isScanned, onDragStart, onRemove }) => {
  const initials = `${participant.memberPrenom?.[0] ?? ''}${participant.memberNom?.[0] ?? ''}`.toUpperCase();
  const fullName = `${participant.memberPrenom} ${participant.memberNom}`.trim();

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, {
        participantId: participant.id,
        fromFormationId: participant.formationId,
        fromGroupId: participant.groupId,
      })}
      className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow select-none group"
    >
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-blue-700 dark:text-blue-300 overflow-hidden">
        {participant.photoURL
          ? <img src={participant.photoURL} className="w-full h-full object-cover" alt="" />
          : initials}
      </div>
      {/* Name + level */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-900 dark:text-white truncate">{fullName}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] font-medium px-1 py-0 rounded ${levelColor(participant.memberLevel)}`}>
            {levelBadge(participant.memberLevel)}
          </span>
          {!isScanned && (
            <span className="text-[10px] px-1 py-0 rounded bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
              non scanné
            </span>
          )}
        </div>
      </div>
      {/* Remove button */}
      <button
        onClick={() => onRemove(participant.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ── DropZone ────────────────────────────────────────────────────────────────
interface DropZoneProps {
  formationId: string | null;
  groupId: string | null;
  className?: string;
  children?: React.ReactNode;
  onDrop: (payload: DragPayload, toFormationId: string | null, toGroupId: string | null) => void;
  isDragActive: boolean;
  emptyText?: string;
}

const DropZone: React.FC<DropZoneProps> = ({
  formationId, groupId, className = '', children,
  onDrop, isDragActive, emptyText
}) => {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={`relative min-h-[60px] rounded-lg border-2 transition-colors ${
        isOver
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : isDragActive
            ? 'border-dashed border-blue-200 dark:border-blue-700'
            : 'border-transparent'
      } ${className}`}
      onDragOver={e => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsOver(false);
        try {
          const payload = JSON.parse(e.dataTransfer.getData('application/json')) as DragPayload;
          onDrop(payload, formationId, groupId);
        } catch { /* ignore */ }
      }}
    >
      {children}
      {(!children || (Array.isArray(children) && children.length === 0)) && emptyText && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 italic pointer-events-none">
          {emptyText}
        </p>
      )}
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────────────
export const ParticipantsTab: React.FC<Props> = ({ sessionId, totalScanned }) => {
  const { clubId } = useAuth();
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [formations, setFormations] = useState<SessionFormation[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [reserveSearch, setReserveSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [allMembers, setAllMembers] = useState<Membre[]>([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Subscribe to formations + participants ─────────────────────────
  useEffect(() => {
    if (!clubId || !sessionId) return;
    const unsub1 = PiscineParticipantsService.subscribeToFormations(clubId, sessionId, f => {
      setFormations(f);
      setLoading(false);
      setLoadError(null);
    }, (err) => {
      console.error('[SessionParticipantsTab] load error:', err);
      setLoadError(err.message);
      setLoading(false);
    });
    const unsub2 = PiscineParticipantsService.subscribeToParticipants(clubId, sessionId, p => {
      setParticipants(p);
    }, (err) => {
      console.error('[SessionParticipantsTab] participants error:', err);
    });
    return () => { unsub1(); unsub2(); };
  }, [clubId, sessionId]);

  // ── Ensure default formations exist (once) ─────────────────────────
  useEffect(() => {
    if (!clubId || !sessionId || formations.length > 0 || loading) return;
    PiscineParticipantsService.ensureDefaultFormations(clubId, sessionId).catch(() => {});
  }, [clubId, sessionId, formations.length, loading]);

  // ── Load all members for manual add ───────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    getMembres(clubId).then(setAllMembers).catch(() => {});
  }, [clubId]);

  // ── Derived views ──────────────────────────────────────────────────
  const reserveParticipants = participants.filter(p => p.formationId === null);
  const scannedIds = new Set(participants.filter(p => !p.isManuallyAdded).map(p => p.memberId));

  const filteredReserve = reserveParticipants.filter(p => {
    const name = `${p.memberPrenom} ${p.memberNom}`.toLowerCase();
    return name.includes(reserveSearch.toLowerCase());
  });

  const alreadyAddedIds = new Set(participants.map(p => p.memberId));
  const availableToAdd = allMembers.filter(m => {
    if (alreadyAddedIds.has(m.id)) return false;
    const name = `${m.prenom} ${m.nom}`.toLowerCase();
    return name.includes(addSearch.toLowerCase());
  });

  // ── Drag handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragActive(true);
  }, []);

  const handleDrop = useCallback(async (
    payload: DragPayload,
    toFormationId: string | null,
    toGroupId: string | null
  ) => {
    setIsDragActive(false);
    if (!clubId) return;
    // Geen beweging als bron = doel
    if (payload.fromFormationId === toFormationId && payload.fromGroupId === toGroupId) return;
    try {
      await PiscineParticipantsService.moveParticipant(
        clubId, sessionId, payload.participantId, toFormationId, toGroupId
      );
    } catch {
      toast.error('Erreur lors du déplacement');
    }
  }, [clubId, sessionId]);

  const handleDragEnd = useCallback(() => setIsDragActive(false), []);

  // ── Remove participant ─────────────────────────────────────────────
  const handleRemove = useCallback(async (participantId: string) => {
    if (!clubId) return;
    try {
      await PiscineParticipantsService.removeParticipant(clubId, sessionId, participantId);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }, [clubId, sessionId]);

  // ── Manual add ────────────────────────────────────────────────────
  const handleManualAdd = useCallback(async (member: Membre) => {
    if (!clubId) return;
    try {
      await PiscineParticipantsService.addParticipant(clubId, sessionId, {
        memberId: member.id,
        memberNom: member.nom,
        memberPrenom: member.prenom,
        memberLevel: member.plongeur_niveau ?? member.niveau_plongee ?? 'NB',
        formationId: null,
        groupId: null,
        isManuallyAdded: true,
        remarks: '',
      });
      setAddSearch('');
    } catch {
      toast.error('Erreur lors de l\'ajout');
    }
  }, [clubId, sessionId]);

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (loadError) return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium">Erreur de chargement</p>
        <p className="text-xs mt-0.5 opacity-75">{loadError}</p>
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 items-start" onDragEnd={handleDragEnd}>

      {/* LEFT: Formations column */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {totalScanned} personne{totalScanned !== 1 ? 's' : ''} scannée{totalScanned !== 1 ? 's' : ''}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">glisser-déposer pour réorganiser</p>
          </div>
          <button
            onClick={() => setShowAddPanel(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Réserve de répartition</span>
          </button>
        </div>

        {/* Formations */}
        {formations.map(formation => (
          <FormationCard
            key={formation.id}
            formation={formation}
            participants={participants}
            scannedIds={scannedIds}
            isDragActive={isDragActive}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onRemove={handleRemove}
          />
        ))}

        {formations.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            Aucune formation configurée
          </div>
        )}
      </div>

      {/* RIGHT: Réserve de répartition */}
      <ReservePanel
        participants={filteredReserve}
        allReserve={reserveParticipants}
        isDragActive={isDragActive}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onRemove={handleRemove}
        search={reserveSearch}
        onSearchChange={setReserveSearch}
        showAdd={showAddPanel}
        addSearch={addSearch}
        onAddSearchChange={setAddSearch}
        availableToAdd={availableToAdd}
        onManualAdd={handleManualAdd}
      />

    </div>
  );
};

// ── FormationCard ────────────────────────────────────────────────────────────
interface FormationCardProps {
  formation: SessionFormation;
  participants: SessionParticipant[];
  scannedIds: Set<string>;
  isDragActive: boolean;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  onDrop: (payload: DragPayload, toFormationId: string | null, toGroupId: string | null) => void;
  onRemove: (id: string) => void;
}

const FormationCard: React.FC<FormationCardProps> = ({
  formation, participants, scannedIds, isDragActive,
  onDragStart, onDrop, onRemove
}) => {
  const formationParticipants = participants.filter(p => p.formationId === formation.id);
  const waitingParticipants = formationParticipants.filter(p => p.groupId === null);
  const totalCount = formationParticipants.length;

  if (totalCount === 0 && !isDragActive) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Formation header */}
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm font-bold text-gray-700 dark:text-gray-200 tracking-wide">
          {formation.levelLabel}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totalCount} élève{totalCount !== 1 ? 's' : ''}
        </span>
        {formation.courseMode === 'parallel' && (
          <span className="text-xs text-violet-600 dark:text-violet-400 font-medium ml-auto">
            PLUSIEURS COURS EN PARALLÈLE
          </span>
        )}
      </div>

      <div className="p-3">
        {/* Groups side by side */}
        <div className="grid grid-cols-2 gap-3">
          {formation.groups.map(group => {
            const groupParticipants = formationParticipants.filter(p => p.groupId === group.id);
            return (
              <GroupColumn
                key={group.id}
                group={group}
                formationId={formation.id}
                participants={groupParticipants}
                scannedIds={scannedIds}
                isDragActive={isDragActive}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onRemove={onRemove}
              />
            );
          })}
        </div>

        {/* À répartir wachtrij — also a valid drop zone */}
        {(waitingParticipants.length > 0 || isDragActive) && (
          <DropZone
            formationId={formation.id}
            groupId={null}
            onDrop={onDrop}
            isDragActive={isDragActive}
            emptyText="Glissez un participant ici pour l'affecter à cette formation"
            className="mt-3 p-2"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                À RÉPARTIR
              </span>
              <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 rounded-full">
                {waitingParticipants.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {waitingParticipants.map(p => (
                <ParticipantChip
                  key={p.id}
                  participant={p}
                  isScanned={scannedIds.has(p.memberId)}
                  onDragStart={onDragStart}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </DropZone>
        )}
      </div>
    </div>
  );
};

// ── GroupColumn ──────────────────────────────────────────────────────────────
interface GroupColumnProps {
  group: FormationGroup;
  formationId: string;
  participants: SessionParticipant[];
  scannedIds: Set<string>;
  isDragActive: boolean;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  onDrop: (payload: DragPayload, toFormationId: string | null, toGroupId: string | null) => void;
  onRemove: (id: string) => void;
}

const GroupColumn: React.FC<GroupColumnProps> = ({
  group, formationId, participants, scannedIds,
  isDragActive, onDragStart, onDrop, onRemove
}) => {
  const groupBadgeColor = group.id === 'group_1'
    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-700'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';

  return (
    <DropZone
      formationId={formationId}
      groupId={group.id}
      onDrop={onDrop}
      isDragActive={isDragActive}
      emptyText="Glissez un participant ici pour l'affecter à ce cours"
      className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      {/* Group header */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${groupBadgeColor}`}>
          {group.label}
        </span>
        <span className="text-xs text-gray-400">{participants.length} formateur{participants.length !== 1 ? 's' : ''} • {participants.length} élève{participants.length !== 1 ? 's' : ''}</span>
      </div>
      {/* Monitor badge */}
      {group.monitorName && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 flex-shrink-0">
            {group.monitorName.charAt(0)}
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{group.monitorName}</span>
          {group.monitorRole && (
            <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700 flex-shrink-0">
              {group.monitorRole}
            </span>
          )}
        </div>
      )}
      {/* Theme note */}
      {group.theme && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-2 truncate">
          {group.theme}
        </p>
      )}
      {/* Participants */}
      <div className="flex flex-col gap-1.5">
        {participants.map(p => (
          <ParticipantChip
            key={p.id}
            participant={p}
            isScanned={scannedIds.has(p.memberId)}
            onDragStart={onDragStart}
            onRemove={onRemove}
          />
        ))}
      </div>
    </DropZone>
  );
};

// ── ReservePanel ─────────────────────────────────────────────────────────────
interface ReservePanelProps {
  participants: SessionParticipant[];
  allReserve: SessionParticipant[];
  isDragActive: boolean;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  onDrop: (payload: DragPayload, toFormationId: string | null, toGroupId: string | null) => void;
  onRemove: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  showAdd: boolean;
  addSearch: string;
  onAddSearchChange: (v: string) => void;
  availableToAdd: Membre[];
  onManualAdd: (member: Membre) => void;
}

const ReservePanel: React.FC<ReservePanelProps> = ({
  participants, allReserve, isDragActive,
  onDragStart, onDrop, onRemove,
  search, onSearchChange,
  showAdd, addSearch, onAddSearchChange, availableToAdd, onManualAdd,
}) => {
  return (
    <div className="w-64 flex-shrink-0 sticky top-4">
      {/* Header */}
      <div className="bg-blue-700 dark:bg-blue-800 rounded-t-xl px-3 py-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-white uppercase tracking-wide">
          Réserve de répartition
        </span>
        <ChevronDown className="w-4 h-4 text-blue-200" />
      </div>

      {/* Sub-header */}
      <div className="bg-blue-600/90 dark:bg-blue-700/90 px-3 py-1.5">
        <p className="text-xs text-blue-100">Cherche ici puis glisse vers un groupe</p>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Chercher un participant..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Count bar */}
      <div className="bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {allReserve.length} DISPONIBLES
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">HORS GROUPES VISIBLES</span>
      </div>

      {/* DropZone: van hier kan je ook terug slepen (formationId=null, groupId=null) */}
      <DropZone
        formationId={null}
        groupId={null}
        onDrop={onDrop}
        isDragActive={isDragActive}
        emptyText="Glisse ici pour remettre dans la réserve"
        className="bg-white dark:bg-gray-800 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-xl min-h-[200px] p-2 flex flex-col gap-1.5"
      >
        {participants.map(p => (
          <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600 group cursor-grab active:cursor-grabbing"
            draggable
            onDragStart={e => onDragStart(e, {
              participantId: p.id,
              fromFormationId: p.formationId,
              fromGroupId: p.groupId,
            })}
          >
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0 overflow-hidden">
              {p.photoURL
                ? <img src={p.photoURL} className="w-full h-full object-cover" alt="" />
                : `${p.memberPrenom?.[0] ?? ''}${p.memberNom?.[0] ?? ''}`.toUpperCase()}
            </div>
            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 dark:text-white truncate">
                {p.memberPrenom} {p.memberNom}
              </div>
              <span className={`text-[10px] font-medium px-1 py-0 rounded ${levelColor(p.memberLevel)}`}>
                {levelBadge(p.memberLevel)}
              </span>
            </div>
            {/* Remove */}
            <button
              onClick={() => onRemove(p.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {participants.length === 0 && !isDragActive && (
          <p className="text-xs text-center text-gray-400 dark:text-gray-500 italic py-4">
            Aucun participant dans la réserve
          </p>
        )}
      </DropZone>

      {/* Manual add panel */}
      {showAdd && (
        <div className="mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Ajouter manuellement</span>
          </div>
          <div className="p-2">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Chercher un membre..."
                value={addSearch}
                onChange={e => onAddSearchChange(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {availableToAdd.slice(0, 20).map(m => (
                <button
                  key={m.id}
                  onClick={() => onManualAdd(m)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                    {m.prenom?.[0]}{m.nom?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-900 dark:text-white truncate">{m.prenom} {m.nom}</div>
                  </div>
                  <span className={`text-[10px] px-1 rounded flex-shrink-0 ${levelColor(m.plongeur_niveau ?? m.niveau_plongee ?? 'NB')}`}>
                    {m.plongeur_niveau ?? m.niveau_plongee ?? 'NB'}
                  </span>
                </button>
              ))}
              {availableToAdd.length === 0 && (
                <p className="text-xs text-center text-gray-400 py-3">Aucun membre trouvé</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Plus, Save, GripVertical, Users, Trash2, Loader2, Zap, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, FileDown } from 'lucide-react';
import { InscriptionEvenement, Membre, Operation, PalanqueeAssignments, Palanquee, PalanqueeParticipant } from '@/types';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { getPalanqueeAssignments, savePalanqueeAssignments } from '@/services/palanqueeService';
import { validateAllPalanquees, type ValidationResult } from '@/services/lifrasValidationService';
import { autoAssignPalanquees } from '@/services/palanqueeAutoAssignService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { LifrasRulesSettings } from '@/types/settings.types';
import toast from 'react-hot-toast';
import { lifrasService } from '@/services/lifrasService';
import { ExerciceLIFRAS } from '@/types/lifras.types';
import { MemberObservationService } from '@/services/memberObservationService';
import { MemberObservation, ObservationResult, OBSERVATION_RESULTS } from '@/types/memberObservation.types';

// ============================================================
// Types intern
// ============================================================

interface DragItem {
  id: string;           // membre_id
  nom: string;
  prenom: string;
  niveau: string;
  exerciceCodes: string[];  // Resolved exercise codes for display
  exerciceResults?: Map<string, ObservationResult>;  // exerciceCode -> ObservationResult
}

interface PalanqueeBuilderProps {
  operation: Operation;
  inscriptions: InscriptionEvenement[];
  allMembers: Membre[];
  clubId: string;
  userId: string;
  onClose: () => void;
  onSaved?: () => void;
}

// ============================================================
// Helper: diving level (zelfde logica als PDF)
// ============================================================

function getDivingLevel(member: Membre | undefined): string {
  if (!member) return '';
  if (member.plongeur_code) {
    const c = member.plongeur_code;
    return /^\d$/.test(c) ? `${c}*` : c;
  }
  const raw = member.plongeur_niveau || (member as any).niveau_plongeur || (member as any).niveau_plongee || '';
  if (!raw) return '';
  const m = raw.match(/(\d)\s*\*/);
  if (m) return `${m[1]}*`;
  if (/moniteur\s*club/i.test(raw)) return 'MC';
  if (/aide\s*moniteur/i.test(raw)) return 'AM';
  if (/assistant\s*moniteur/i.test(raw)) return 'AM';
  if (/moniteur\s*f/i.test(raw)) return 'MF';
  if (/moniteur\s*n/i.test(raw)) return 'MN';
  if (/non\s*brevet/i.test(raw) || raw.toUpperCase() === 'NB') return 'NB';
  return raw;
}

// ============================================================
// Container IDs
// ============================================================

const UNASSIGNED_CONTAINER = 'unassigned';
const palanqueeContainerId = (num: number) => `palanquee-${num}`;

// ============================================================
// Sortable participant item
// ============================================================

function SortableParticipant({ item, isOverlay }: { item: DragItem; isOverlay?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  // Helper to get color classes for observation result
  const getObservationBgColor = (result: ObservationResult): string => {
    switch (result) {
      case 'acquis':
        return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700';
      case 'en_progres':
        return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700';
      case 'a_revoir':
        return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700';
      default:
        return 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? undefined : style}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-grab active:cursor-grabbing
        text-sm select-none
        ${isOverlay
          ? 'bg-blue-100 border-2 border-blue-400 shadow-lg'
          : 'bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
        }
      `}
    >
      <GripVertical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium text-gray-800 truncate">{item.nom}</span>
          <span className="text-gray-500 truncate">{item.prenom}</span>
        </div>
        {item.exerciceCodes.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {item.exerciceCodes.map((code) => {
              const result = item.exerciceResults?.get(code);
              const bgColor = getObservationBgColor(result || 'acquis');
              return (
                <span
                  key={code}
                  className={`text-[10px] px-1 py-0 rounded border font-medium ${bgColor} ${result ? '' : 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700'}`}
                >
                  {code}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {item.niveau && (
        <span className="ml-auto flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
          {item.niveau}
        </span>
      )}
    </div>
  );
}

// ============================================================
// Droppable container for unassigned pool
// ============================================================

function DroppablePool({
  children,
  itemCount,
}: {
  children: React.ReactNode;
  itemCount: number;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: UNASSIGNED_CONTAINER });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-1 overflow-y-auto p-2 space-y-1 rounded-lg border-2 border-dashed transition-colors
        ${isOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-gray-50/30'}
      `}
    >
      {itemCount === 0 ? (
        <div className="flex items-center justify-center h-20 text-sm text-gray-400 italic">
          Tous les participants sont assignés
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ============================================================
// Validation Banner (inline dans PalanqueeCard)
// ============================================================

function ValidationBanner({ validation }: { validation: ValidationResult | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (!validation || (validation.errors.length === 0 && validation.warnings.length === 0)) {
    // Afficher profondeur max si tout est OK
    if (validation?.maxDepth) {
      return (
        <div className="mx-2 mt-1 mb-0.5 flex items-center gap-1.5 px-2 py-1 rounded bg-green-50 border border-green-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium">
            Max: {validation.maxDepth}m
          </span>
        </div>
      );
    }
    return null;
  }

  const hasErrors = validation.errors.length > 0;

  return (
    <div className={`mx-2 mt-1 mb-0.5 rounded border ${hasErrors ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left"
      >
        {hasErrors ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
        ) : (
          <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        )}
        <span className={`text-xs font-medium flex-1 ${hasErrors ? 'text-red-700' : 'text-amber-700'}`}>
          {hasErrors && `${validation.errors.length} erreur${validation.errors.length > 1 ? 's' : ''}`}
          {hasErrors && validation.warnings.length > 0 && ' + '}
          {validation.warnings.length > 0 && `${validation.warnings.length} avis`}
          {validation.maxDepth !== null && ` — Max: ${validation.maxDepth}m`}
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-gray-500" />
        ) : (
          <ChevronDown className="w-3 h-3 text-gray-500" />
        )}
      </button>

      {/* Detail list */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {validation.errors.map((err, i) => (
            <div key={`e-${i}`} className="flex items-start gap-1.5 text-xs text-red-700">
              <span className="font-bold mt-0.5">!</span>
              <div>
                <span>{err.message}</span>
                {err.rule && (
                  <span className="ml-1 text-red-400 italic">({err.rule})</span>
                )}
              </div>
            </div>
          ))}
          {validation.warnings.map((warn, i) => (
            <div key={`w-${i}`} className="flex items-start gap-1.5 text-xs text-amber-700">
              <span className="font-bold mt-0.5">~</span>
              <div>
                <span>{warn.message}</span>
                {warn.rule && (
                  <span className="ml-1 text-amber-400 italic">({warn.rule})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Droppable Palanquée Card
// ============================================================

function PalanqueeCard({
  palanquee,
  items,
  onRemove,
  validation,
}: {
  palanquee: Palanquee;
  items: DragItem[];
  onRemove: () => void;
  validation?: ValidationResult;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: palanqueeContainerId(palanquee.numero),
  });

  const hasErrors = validation && validation.errors.length > 0;
  const hasWarnings = validation && validation.warnings.length > 0;

  return (
    <div
      className={`
        rounded-lg border-2 transition-all flex flex-col
        ${isOver ? 'border-blue-400 bg-blue-50/30 shadow-md' :
          hasErrors ? 'border-red-300 bg-white' :
            hasWarnings ? 'border-amber-300 bg-white' :
              'border-gray-200 bg-white'}
      `}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-md ${
        hasErrors ? 'bg-gradient-to-r from-red-600 to-red-700' :
          hasWarnings ? 'bg-gradient-to-r from-amber-500 to-amber-600' :
            'bg-gradient-to-r from-blue-600 to-blue-700'
      }`}>
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-white/70" />
          <span className="text-sm font-bold text-white">
            Palanquée {palanquee.numero}
          </span>
          <span className="text-xs text-white/70">
            ({items.length})
          </span>
          {/* Depth badge */}
          {validation?.maxDepth && !hasErrors && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/20 text-white">
              {validation.maxDepth}m
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-white/20 transition-colors"
          title="Supprimer cette palanquée"
        >
          <Trash2 className="w-3.5 h-3.5 text-white/70 hover:text-white" />
        </button>
      </div>

      {/* Validation Banner */}
      <ValidationBanner validation={validation} />

      {/* Body — droppable zone */}
      <div
        ref={setNodeRef}
        className="flex-1 p-2 space-y-1 min-h-[80px]"
      >
        <SortableContext
          items={items.map(i => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-xs text-gray-400 italic border border-dashed border-gray-200 rounded">
              Glisser des participants ici
            </div>
          ) : (
            items.map(item => (
              <SortableParticipant key={item.id} item={item} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PalanqueeBuilder({
  operation,
  inscriptions,
  allMembers,
  clubId,
  userId,
  onClose,
  onSaved,
}: PalanqueeBuilderProps) {
  // ---- State ----

  // Load LIFRAS exercise catalog
  const [exerciceCatalog, setExerciceCatalog] = useState<Map<string, ExerciceLIFRAS>>(new Map());

  useEffect(() => {
    if (!clubId) return;
    lifrasService.getAllExercices(clubId).then(exercices => {
      const map = new Map<string, ExerciceLIFRAS>();
      exercices.forEach(ex => map.set(ex.id, ex));
      setExerciceCatalog(map);
    });
  }, [clubId]);
  const [palanquees, setPalanquees] = useState<Palanquee[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validationResults, setValidationResults] = useState<Map<number, ValidationResult>>(new Map());
  const [lifrasRules, setLifrasRules] = useState<LifrasRulesSettings | undefined>(undefined);
  const [exerciceObservations, setExerciceObservations] = useState<Map<string, Map<string, MemberObservation>>>(new Map());

  // ---- Load LIFRAS rules from Firestore ----
  useEffect(() => {
    (async () => {
      try {
        const rules = await FirebaseSettingsService.loadLifrasRules(clubId);
        setLifrasRules(rules);
      } catch {
        // On error, validation will use default rules
      }
    })();
  }, [clubId]);

  // ---- Subscribe to exercise observations for the operation ----
  useEffect(() => {
    if (!clubId || !operation?.id) return;
    const unsubscribe = MemberObservationService.subscribeToObservationsForSession(
      clubId,
      operation.id,
      (observations) => {
        const map = new Map<string, Map<string, MemberObservation>>();
        observations.forEach(obs => {
          if (obs.category === 'exercice_lifras' && obs.exerciceCode) {
            if (!map.has(obs.memberId)) map.set(obs.memberId, new Map());
            map.get(obs.memberId)!.set(obs.exerciceCode, obs);
          }
        });
        setExerciceObservations(map);
      }
    );
    return () => unsubscribe();
  }, [clubId, operation?.id]);

  // ---- Build participant pool from inscriptions ----
  const allParticipants = useMemo<DragItem[]>(() => {
    return inscriptions
      .filter(i => i.membre_id && (!i.is_guest || i.membre_nom))
      .map(ins => {
        const mem = allMembers.find(m => m.id === ins.membre_id);
        const exerciceCodes = (ins.exercices || [])
          .map(exId => exerciceCatalog.get(exId)?.code)
          .filter((code): code is string => !!code);
        const exerciceResults = new Map<string, ObservationResult>();
        const memberObs = exerciceObservations.get(ins.membre_id);
        if (memberObs) {
          memberObs.forEach((obs, code) => {
            if (obs.result) exerciceResults.set(code, obs.result);
          });
        }
        return {
          id: ins.membre_id,
          nom: ((mem ? getLastName(mem) : ins.membre_nom) || '').toUpperCase(),
          prenom: (mem ? getFirstName(mem) : ins.membre_prenom) || '',
          niveau: getDivingLevel(mem),
          exerciceCodes,
          exerciceResults: exerciceResults.size > 0 ? exerciceResults : undefined,
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [inscriptions, allMembers, exerciceCatalog, exerciceObservations]);

  // ---- Compute assigned vs unassigned ----
  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    palanquees.forEach(p => p.participants.forEach(pp => ids.add(pp.membre_id)));
    return ids;
  }, [palanquees]);

  const unassignedItems = useMemo(
    () => allParticipants.filter(p => !assignedIds.has(p.id)),
    [allParticipants, assignedIds]
  );

  // ---- Drag item lookup ----
  const getItem = useCallback(
    (id: string) => allParticipants.find(p => p.id === id) || null,
    [allParticipants]
  );

  // ---- Items per palanquee (ordered) ----
  const palanqueeItems = useCallback(
    (pal: Palanquee): DragItem[] => {
      return pal.participants
        .sort((a, b) => a.ordre - b.ordre)
        .map(pp => getItem(pp.membre_id))
        .filter((item): item is DragItem => item !== null);
    },
    [getItem]
  );

  // ---- Run validation whenever palanquees change ----
  useEffect(() => {
    if (palanquees.length === 0) {
      setValidationResults(new Map());
      return;
    }
    const results = validateAllPalanquees(palanquees, operation.lieu_type, lifrasRules);
    setValidationResults(results);
  }, [palanquees, operation.lieu_type, lifrasRules]);

  // ---- Load from Firestore ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getPalanqueeAssignments(clubId, operation.id);
        if (!cancelled && data) {
          // Bouw lookup van actuele member data (niveau kan geüpdatet zijn)
          const currentLookup = new Map(allParticipants.map(p => [p.id, p]));
          const currentIds = new Set(allParticipants.map(p => p.id));
          const cleaned = data.palanquees.map(p => ({
            ...p,
            participants: p.participants
              .filter(pp => currentIds.has(pp.membre_id))
              .map(pp => {
                // Refresh niveau vanuit actuele member data
                const current = currentLookup.get(pp.membre_id);
                return current ? { ...pp, niveau: current.niveau || pp.niveau } : pp;
              }),
          }));
          setPalanquees(cleaned);
        }
      } catch (err: any) {
        if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
          console.warn('Palanquées non accessibles (permissions) — démarrage à vide');
        } else {
          console.error('Erreur lors du chargement des palanquées:', err);
          toast.error('Impossible de charger les palanquées');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clubId, operation.id, allParticipants]);

  // ---- DnD Sensors ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ---- Find which container an item is in ----
  const findContainer = useCallback(
    (id: string): string | null => {
      if (id === UNASSIGNED_CONTAINER) return UNASSIGNED_CONTAINER;
      if (id.startsWith('palanquee-')) return id;
      if (unassignedItems.some(i => i.id === id)) return UNASSIGNED_CONTAINER;
      for (const pal of palanquees) {
        if (pal.participants.some(pp => pp.membre_id === id)) {
          return palanqueeContainerId(pal.numero);
        }
      }
      return null;
    },
    [unassignedItems, palanquees]
  );

  // ---- DnD Handlers ----
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(() => {
    // Visual feedback is handled by isOver in droppable components
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const activeItemId = active.id as string;
      const overId = over.id as string;

      const fromContainer = findContainer(activeItemId);
      const toContainer = findContainer(overId);

      if (!fromContainer || !toContainer) return;

      // ---- CASE 1: Same container — reorder within palanquee ----
      if (fromContainer === toContainer && toContainer.startsWith('palanquee-')) {
        const palNum = parseInt(toContainer.replace('palanquee-', ''));
        setPalanquees(prev =>
          prev.map(p => {
            if (p.numero !== palNum) return p;
            const items = [...p.participants];
            const oldIdx = items.findIndex(pp => pp.membre_id === activeItemId);
            const overIdx = items.findIndex(pp => pp.membre_id === overId);
            if (oldIdx === -1) return p;
            const targetIdx = overIdx >= 0 ? overIdx : items.length - 1;
            const [moved] = items.splice(oldIdx, 1);
            items.splice(targetIdx, 0, moved);
            return { ...p, participants: items.map((pp, i) => ({ ...pp, ordre: i })) };
          })
        );
        setHasChanges(true);
        return;
      }

      // ---- CASE 2: Different containers — move between containers ----
      if (fromContainer !== toContainer) {
        const item = getItem(activeItemId);
        if (!item) return;

        setPalanquees(prev => {
          let updated = prev;

          // Remove from source palanquee
          if (fromContainer.startsWith('palanquee-')) {
            const fromNum = parseInt(fromContainer.replace('palanquee-', ''));
            updated = updated.map(p =>
              p.numero === fromNum
                ? { ...p, participants: p.participants.filter(pp => pp.membre_id !== activeItemId) }
                : p
            );
          }

          // Add to target palanquee
          if (toContainer.startsWith('palanquee-')) {
            const toNum = parseInt(toContainer.replace('palanquee-', ''));
            updated = updated.map(p => {
              if (p.numero !== toNum) return p;
              if (p.participants.some(pp => pp.membre_id === item.id)) return p;

              const newParticipants = [...p.participants];
              let insertAt = newParticipants.length;
              if (overId !== toContainer) {
                const overIdx = newParticipants.findIndex(pp => pp.membre_id === overId);
                if (overIdx >= 0) insertAt = overIdx;
              }

              const participant: PalanqueeParticipant = {
                membre_id: item.id,
                membre_nom: item.nom,
                membre_prenom: item.prenom,
                niveau: item.niveau,
                ordre: 0,
              };

              newParticipants.splice(insertAt, 0, participant);
              return {
                ...p,
                participants: newParticipants.map((pp, i) => ({ ...pp, ordre: i })),
              };
            });
          }

          return updated;
        });

        setHasChanges(true);
      }
    },
    [findContainer, getItem]
  );

  // ---- Add / Remove palanquee ----
  const addPalanquee = useCallback(() => {
    setPalanquees(prev => {
      const maxNum = prev.reduce((max, p) => Math.max(max, p.numero), 0);
      return [...prev, { numero: maxNum + 1, participants: [] }];
    });
    setHasChanges(true);
  }, []);

  const removePalanquee = useCallback((numero: number) => {
    setPalanquees(prev => prev.filter(p => p.numero !== numero));
    setHasChanges(true);
  }, []);

  // ---- Auto-assign ----
  const handleAutoAssign = useCallback(() => {
    // Collecter TOUS les participants (assignés + non-assignés) pour redistribuer
    const allItems: PalanqueeParticipant[] = allParticipants.map((p, i) => ({
      membre_id: p.id,
      membre_nom: p.nom,
      membre_prenom: p.prenom,
      niveau: p.niveau,
      ordre: i,
    }));

    const result = autoAssignPalanquees(allItems, operation.lieu_type, lifrasRules);

    setPalanquees(result.palanquees);
    setHasChanges(true);

    if (result.warnings.length > 0) {
      // Toon max 3 warnings
      const shown = result.warnings.slice(0, 3);
      shown.forEach(w => toast(w, { icon: '⚠️', duration: 5000 }));
      if (result.warnings.length > 3) {
        toast(`+ ${result.warnings.length - 3} autres avertissements`, { icon: '⚠️' });
      }
    }

    if (result.palanquees.length > 0) {
      toast.success(`${result.palanquees.length} palanquées créées automatiquement`);
    }
  }, [allParticipants, operation.lieu_type]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await savePalanqueeAssignments(
        clubId,
        operation.id,
        { palanquees },
        userId
      );
      setHasChanges(false);
      toast.success('Palanquées enregistrées');
      onSaved?.();
    } catch (err: any) {
      console.error('Erreur lors de l\'enregistrement:', err);
      if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
        toast.error('Les règles Firestore ne sont pas déployées. Exécutez : firebase deploy --only firestore:rules');
      } else {
        toast.error('Erreur lors de l\'enregistrement');
      }
    } finally {
      setSaving(false);
    }
  }, [clubId, operation.id, palanquees, userId, onSaved]);

  // ---- Active drag item for overlay ----
  const activeItem = activeId ? getItem(activeId) : null;

  // ---- Validation summary ----
  const validationSummary = useMemo(() => {
    let totalErrors = 0;
    let totalWarnings = 0;
    for (const result of validationResults.values()) {
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
    }
    return { totalErrors, totalWarnings };
  }, [validationResults]);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl p-8 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-gray-600">Chargement des palanquées...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-gray-50 rounded-xl shadow-2xl flex flex-col" style={{ width: '92vw', height: '88vh', maxWidth: '1400px' }}>
        {/* ---- HEADER ---- */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-white rounded-t-xl">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">
              Palanquées
            </h2>
            <span className="text-sm text-gray-500">
              — {operation.titre}
            </span>
            {operation.lieu_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {operation.lieu_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Validation summary in header */}
            {validationSummary.totalErrors > 0 && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {validationSummary.totalErrors} erreur{validationSummary.totalErrors > 1 ? 's' : ''}
              </span>
            )}
            {hasChanges && (
              <span className="text-xs text-amber-600 font-medium mr-2">
                Modifications non enregistrées
              </span>
            )}
            <button
              onClick={async () => {
                try {
                  const { generateFichePalanqueePdf } = await import('@/utils/generateFichePalanqueePdf');
                  // Build palanquee assignments from current state
                  const currentAssignments: PalanqueeAssignments = {
                    palanquees: palanquees.map(p => ({
                      numero: p.numero,
                      participants: p.participants,
                    })),
                  };
                  const hasAssignments = currentAssignments.palanquees.some(p => p.participants.length > 0);
                  await generateFichePalanqueePdf({
                    operation,
                    inscriptions,
                    allMembers,
                    clubInfo: { nom: 'Calypso Diving Club' },
                    palanqueeAssignments: hasAssignments ? currentAssignments : undefined,
                  });
                  toast.success('Fiche de palanquée générée !', { duration: 2000, position: 'bottom-right' });
                } catch (error) {
                  console.error('Erreur génération fiche palanquée:', error);
                  toast.error('Erreur lors de la génération du PDF');
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 shadow-sm transition-all"
              title="Télécharger la fiche de palanquée (PDF)"
            >
              <FileDown className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`
                inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${hasChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Enregistrer
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Fermer"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ---- BODY ---- */}
        <div className="flex-1 flex overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* LEFT: Unassigned pool */}
            <div className="w-64 flex-shrink-0 border-r bg-white flex flex-col p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Non assignés
                </h3>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {unassignedItems.length}
                </span>
              </div>

              {/* Auto-assign button */}
              <button
                onClick={handleAutoAssign}
                className="mb-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                title="Attribution automatique selon les règles LIFRAS MIL 2026"
              >
                <Zap className="w-4 h-4" />
                Auto-assign
              </button>

              <DroppablePool itemCount={unassignedItems.length}>
                <SortableContext
                  items={unassignedItems.map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {unassignedItems.map(item => (
                    <SortableParticipant key={item.id} item={item} />
                  ))}
                </SortableContext>
              </DroppablePool>
            </div>

            {/* RIGHT: Palanquee grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {palanquees.map(pal => (
                  <PalanqueeCard
                    key={pal.numero}
                    palanquee={pal}
                    items={palanqueeItems(pal)}
                    onRemove={() => removePalanquee(pal.numero)}
                    validation={validationResults.get(pal.numero)}
                  />
                ))}

                {/* Add button */}
                <button
                  onClick={addPalanquee}
                  className="
                    flex items-center justify-center gap-2 min-h-[120px]
                    rounded-lg border-2 border-dashed border-gray-300
                    text-gray-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/30
                    transition-all
                  "
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-sm font-medium">Ajouter une palanquée</span>
                </button>
              </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeItem ? (
                <SortableParticipant item={activeItem} isOverlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* ---- FOOTER ---- */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t bg-white rounded-b-xl text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>{allParticipants.length} participants</span>
            <span>•</span>
            <span>{palanquees.length} palanquées</span>
            <span>•</span>
            <span className={unassignedItems.length > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
              {unassignedItems.length} non assigné{unassignedItems.length !== 1 ? 's' : ''}
            </span>
            {validationSummary.totalErrors > 0 && (
              <>
                <span>•</span>
                <span className="text-red-600 font-medium">
                  {validationSummary.totalErrors} erreur{validationSummary.totalErrors > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
          <div className="text-gray-400">
            Règles LIFRAS MIL 2026
          </div>
        </div>
      </div>
    </div>
  );
}

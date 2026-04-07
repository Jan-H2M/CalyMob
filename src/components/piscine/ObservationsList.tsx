import React, { useEffect, useState } from 'react';
import { ClipboardList, Trash2, User } from 'lucide-react';
import { MemberObservation, OBSERVATION_CATEGORIES } from '@/types/memberObservation.types';
import { MemberObservationService } from '@/services/memberObservationService';
import { ObservationBadge } from './ObservationBadge';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/utils/fieldMapper';
import toast from 'react-hot-toast';

interface ObservationsListProps {
  clubId: string;
  sessionId: string;
}

/**
 * Liste des observations enregistrées pour une session piscine.
 * Affiche les observations groupées par membre, avec badge résultat.
 * Visible uniquement quand le Carnet de Formation est activé.
 */
export function ObservationsList({ clubId, sessionId }: ObservationsListProps) {
  const { user, appUser } = useAuth();
  const [observations, setObservations] = useState<MemberObservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = MemberObservationService.subscribeToObservationsForSession(
      clubId, sessionId,
      (obs) => { setObservations(obs); setLoading(false); }
    );
    return unsub;
  }, [clubId, sessionId]);

  const handleDelete = async (obs: MemberObservation) => {
    // Only admin or the observer can delete
    const canDelete = isAdmin(appUser) || obs.observerId === user?.uid;
    if (!canDelete) {
      toast.error('Pas autorisé à supprimer cette observation');
      return;
    }
    try {
      await MemberObservationService.deleteObservation(clubId, obs.id);
      toast.success('Observation supprimée');
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-gray-400">
        <ClipboardList className="w-4 h-4 mr-2 animate-pulse" />
        Chargement des observations...
      </div>
    );
  }

  if (observations.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        <ClipboardList className="w-5 h-5 mx-auto mb-1 opacity-50" />
        Aucune observation pour cette session
      </div>
    );
  }

  // Group by member
  const grouped = observations.reduce<Record<string, MemberObservation[]>>((acc, obs) => {
    const key = obs.memberId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(obs);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-600 flex items-center gap-1.5">
        <ClipboardList className="w-4 h-4" />
        Observations ({observations.length})
      </h4>
      {Object.entries(grouped).map(([memberId, memberObs]) => (
        <div key={memberId} className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm font-medium">{memberObs[0].memberName}</span>
            <span className="text-xs text-gray-400">
              ({memberObs.length} obs.)
            </span>
          </div>
          <div className="space-y-1.5">
            {memberObs.map((obs) => {
              const catLabel = OBSERVATION_CATEGORIES.find(
                c => c.value === obs.category
              )?.label ?? obs.category;
              const canDelete = isAdmin(appUser) || obs.observerId === user?.uid;

              return (
                <div key={obs.id}
                  className="flex items-center gap-2 bg-white rounded px-2 py-1.5 text-sm">
                  <ObservationBadge result={obs.result} />
                  <span className="text-gray-500 text-xs">{catLabel}</span>
                  {obs.exerciceCode && (
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1 rounded">
                      {obs.exerciceCode}
                    </span>
                  )}
                  {obs.themeTitle && (
                    <span className="text-xs text-purple-600 truncate max-w-[120px]">
                      {obs.themeTitle}
                    </span>
                  )}
                  {obs.note && (
                    <span className="text-xs text-gray-400 truncate max-w-[150px]"
                      title={obs.note}>
                      — {obs.note}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-300">
                    {obs.observerName}
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(obs)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

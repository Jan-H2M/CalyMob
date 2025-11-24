import React from 'react';
import { FileText, Calendar, Euro, ChevronRight } from 'lucide-react';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { DemandeRemboursement, Evenement } from '@/types';

interface LinkedEntityMiniCardProps {
  entity: DemandeRemboursement | Evenement;
  type: 'demand' | 'event';
  onClick?: () => void;
}

export function LinkedEntityMiniCard({ entity, type, onClick }: LinkedEntityMiniCardProps) {
  const isDemand = type === 'demand';
  const demand = isDemand ? (entity as DemandeRemboursement) : null;
  const event = !isDemand ? (entity as Evenement) : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all hover:shadow-md group min-w-[280px]",
        isDemand
          ? "bg-purple-50 border-purple-200 hover:bg-purple-100 hover:border-purple-300"
          : "bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
      )}
    >
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
        isDemand ? "bg-purple-100" : "bg-blue-100"
      )}>
        {isDemand ? (
          <FileText className={cn("h-5 w-5", "text-purple-600")} />
        ) : (
          <Calendar className={cn("h-5 w-5", "text-blue-600")} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        <p className={cn(
          "text-sm font-semibold truncate",
          isDemand ? "text-purple-900" : "text-blue-900"
        )}>
          {isDemand ? demand?.description : event?.titre}
        </p>
        <p className="text-xs text-gray-600 dark:text-dark-text-secondary truncate mt-0.5">
          {isDemand
            ? `${demand?.demandeur_nom} • ${formatDate(demand?.date_demande)}`
            : `${formatDate(event?.date_debut)} • ${event?.lieu}`
          }
        </p>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <div className="text-right">
          <p className={cn(
            "text-sm font-bold",
            isDemand ? "text-purple-700" : "text-blue-700"
          )}>
            {isDemand
              ? formatMontant(demand?.montant ?? 0)
              : formatMontant(event?.budget_prevu_depenses ?? 0)
            }
          </p>
          {!isDemand && (
            <p className="text-xs text-gray-500 dark:text-dark-text-muted">Budget</p>
          )}
        </div>
        <ChevronRight className={cn(
          "h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity",
          isDemand ? "text-purple-600" : "text-blue-600"
        )} />
      </div>
    </button>
  );
}

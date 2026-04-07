import { useState } from 'react';
import { ChevronDown, ChevronUp, User, ArrowRight, MessageSquare } from 'lucide-react';
import { MontantAudit } from '@/types';
import { formatDate, cn, formatMontant } from '@/utils/utils';

interface MontantAuditTrailProps {
  history?: MontantAudit[];
  currentMontant?: number; // Reserved for future use (e.g., comparison display)
}

export function MontantAuditTrail({
  history,
  currentMontant: _currentMontant
}: MontantAuditTrailProps) {
  void _currentMontant; // Suppress unused warning
  const [isExpanded, setIsExpanded] = useState(false);

  // Si pas d'historique, ne rien afficher
  if (!history || history.length === 0) {
    return null;
  }

  // Trier par date décroissante (plus récent en premier)
  const sortedHistory = [...history].sort((a, b) =>
    new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  const latestEntry = sortedHistory[0];
  const hasMultipleEntries = sortedHistory.length > 1;

  return (
    <div className="mt-2 text-xs">
      {/* Dernière modification - compact sur 1-2 lignes */}
      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 flex-wrap">
        <User className="h-3 w-3" />
        <span className="font-medium">{latestEntry.changed_by_name}</span>
        <span>•</span>
        <span>{formatDate(latestEntry.changed_at, 'dd/MM/yyyy HH:mm')}</span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <span className="line-through text-gray-500 dark:text-dark-text-muted">{formatMontant(latestEntry.old_montant)}</span>
          <ArrowRight className="h-3 w-3" />
          <span className="font-medium">{formatMontant(latestEntry.new_montant)}</span>
        </span>
      </div>

      {/* Justification si présente */}
      {latestEntry.justification && (
        <div className="mt-1 flex items-start gap-1.5 text-gray-600 dark:text-dark-text-secondary">
          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span className="italic">"{latestEntry.justification}"</span>
        </div>
      )}

      {/* Bouton pour afficher l'historique complet */}
      {hasMultipleEntries && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "mt-2 flex items-center gap-1.5 text-xs font-medium transition-colors",
            "text-calypso-blue dark:text-calypso-aqua hover:text-blue-700 dark:hover:text-blue-300"
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Masquer l'historique
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Voir historique ({sortedHistory.length} modification{sortedHistory.length > 1 ? 's' : ''})
            </>
          )}
        </button>
      )}

      {/* Historique complet en accordion */}
      {isExpanded && hasMultipleEntries && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-amber-200 dark:border-amber-800">
          {sortedHistory.map((entry, index) => (
            <div
              key={index}
              className={cn(
                "py-1.5 text-[11px]",
                index < sortedHistory.length - 1 && "border-b border-gray-100 dark:border-dark-border"
              )}
            >
              {/* Ligne 1: Date, user */}
              <div className="flex items-center gap-1.5 flex-wrap text-gray-600 dark:text-dark-text-secondary mb-0.5">
                <span className="font-medium text-gray-700 dark:text-dark-text-primary">
                  {formatDate(entry.changed_at, 'dd/MM/yyyy HH:mm')}
                </span>
                <span>•</span>
                <span>{entry.changed_by_name}</span>
              </div>
              {/* Ligne 2: Montants */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="line-through text-gray-500 dark:text-dark-text-muted">{formatMontant(entry.old_montant)}</span>
                <ArrowRight className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />
                <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                  {formatMontant(entry.new_montant)}
                </span>
              </div>
              {/* Ligne 3: Justification si présente */}
              {entry.justification && (
                <div className="mt-0.5 flex items-start gap-1 text-gray-500 dark:text-dark-text-muted">
                  <MessageSquare className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                  <span className="italic text-[10px]">"{entry.justification}"</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

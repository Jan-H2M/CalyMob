import React, { useState } from 'react';
import { ChevronDown, ChevronUp, User, Clock, Edit, Zap, Users, Brain, Trash2 } from 'lucide-react';
import { CodeComptableAudit } from '@/types';
import { formatDate, cn } from '@/utils/utils';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';

interface CodeComptableAuditTrailProps {
  history?: CodeComptableAudit[];
  currentCode?: string;
  currentCategorie?: string;
}

export function CodeComptableAuditTrail({
  history,
  currentCode,
  currentCategorie
}: CodeComptableAuditTrailProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Si pas d'historique, ne rien afficher
  if (!history || history.length === 0) {
    return null;
  }

  // Trier par date décroissante (plus récent en premier)
  const sortedHistory = [...history].sort((a, b) =>
    new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
  );

  const latestEntry = sortedHistory[0];
  const hasMultipleEntries = sortedHistory.length > 1;

  // Helper pour obtenir le label d'un code comptable
  const allCodes = AccountCodeService.isReady()
    ? AccountCodeService.getAllCodes()
    : calypsoAccountCodes;
  const getCodeLabel = (code: string) => {
    const codeObj = allCodes.find(c => c.code === code);
    return codeObj?.label || '';
  };

  // Icône selon la source
  const getSourceIcon = (source?: string) => {
    switch (source) {
      case 'manual':
        return <Edit className="h-3 w-3" />;
      case 'manual_delete':
        return <Trash2 className="h-3 w-3" />;
      case 'auto':
        return <Zap className="h-3 w-3" />;
      case 'bulk':
        return <Users className="h-3 w-3" />;
      case 'learned':
        return <Brain className="h-3 w-3" />;
      default:
        return <Edit className="h-3 w-3" />;
    }
  };

  // Label selon la source
  const getSourceLabel = (source?: string) => {
    switch (source) {
      case 'manual':
        return 'Manuel';
      case 'manual_delete':
        return 'Supprimé';
      case 'auto':
        return 'Automatique';
      case 'bulk':
        return 'En masse';
      case 'learned':
        return 'Appris';
      default:
        return 'Manuel';
    }
  };

  return (
    <div className="mt-2 text-xs">
      {/* Dernière modification - ULTRA compact sur 1 ligne */}
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-dark-text-secondary flex-wrap">
        <User className="h-3 w-3" />
        <span className="font-medium">{latestEntry.assigned_by_name}</span>
        <span>•</span>
        <span>{formatDate(latestEntry.assigned_at, 'dd/MM/yyyy HH:mm')}</span>
        {latestEntry.source && (
          <>
            <span>•</span>
            <span className="flex items-center gap-0.5">
              {getSourceIcon(latestEntry.source)}
              <span>{getSourceLabel(latestEntry.source)}</span>
            </span>
          </>
        )}
        {latestEntry.previous_code && (
          <>
            <span>•</span>
            <span className="text-gray-500 dark:text-dark-text-muted">
              De: <span className="font-mono">{latestEntry.previous_code}</span>
            </span>
          </>
        )}
      </div>

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
              Afficher l'historique ({sortedHistory.length} modification{sortedHistory.length > 1 ? 's' : ''})
            </>
          )}
        </button>
      )}

      {/* Historique complet en accordion - COMPACT avec labels */}
      {isExpanded && hasMultipleEntries && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-200 dark:border-dark-border">
          {sortedHistory.map((entry, index) => (
            <div
              key={index}
              className={cn(
                "py-1.5 text-[11px]",
                index < sortedHistory.length - 1 && "border-b border-gray-100 dark:border-dark-border"
              )}
            >
              {/* Ligne 1: Date, user, source */}
              <div className="flex items-center gap-1.5 flex-wrap text-gray-600 dark:text-dark-text-secondary mb-0.5">
                <span className="font-medium text-gray-700 dark:text-dark-text-primary">{formatDate(entry.assigned_at, 'dd/MM HH:mm')}</span>
                <span>•</span>
                <span>{entry.assigned_by_name}</span>
                {entry.source && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      {getSourceIcon(entry.source)}
                      {getSourceLabel(entry.source)}
                    </span>
                  </>
                )}
              </div>
              {/* Ligne 2: Code avec label */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-gray-500 dark:text-dark-text-muted">→</span>
                {entry.source === 'manual_delete' || !entry.code_comptable ? (
                  <span className="italic text-red-500 dark:text-red-400">(supprimé)</span>
                ) : (
                  <>
                    <span className="font-mono font-medium text-gray-900 dark:text-dark-text-primary">{entry.code_comptable}</span>
                    <span className="text-gray-600 dark:text-dark-text-secondary text-[10px]">{getCodeLabel(entry.code_comptable)}</span>
                  </>
                )}
                {entry.previous_code && (
                  <>
                    <span className="text-gray-400 dark:text-dark-text-muted">←</span>
                    <span className="font-mono text-gray-500 dark:text-dark-text-muted">{entry.previous_code}</span>
                    <span className="text-gray-500 dark:text-dark-text-muted text-[10px]">{getCodeLabel(entry.previous_code)}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

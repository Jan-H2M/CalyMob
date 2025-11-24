import React from 'react';
import { Check, Clock, X, AlertCircle, Users, User } from 'lucide-react';
import { DemandeRemboursement } from '@/types';
import { formatDate } from '@/utils/utils';
import { cn } from '@/utils/utils';
import { SettingsService } from '@/services/settingsService';

interface ApprovalBadgeProps {
  demand: DemandeRemboursement;
  showDetails?: boolean;
  className?: string;
}

export function ApprovalBadge({ demand, showDetails = false, className }: ApprovalBadgeProps) {
  // Déterminer l'état d'approbation
  const getApprovalState = () => {
    if (demand.statut === 'refuse') {
      return {
        label: 'Refusé',
        icon: X,
        color: 'text-red-600 bg-red-50 border-red-200',
        iconColor: 'text-red-500'
      };
    }
    
    if (demand.statut === 'rembourse') {
      return {
        label: 'Remboursé',
        icon: Check,
        color: 'text-green-600 bg-green-50 border-green-200',
        iconColor: 'text-green-500'
      };
    }
    
    if (demand.statut === 'en_attente_validation') {
      return {
        label: 'Attente 2e validation',
        icon: Users,
        color: 'text-orange-600 bg-orange-50 border-orange-200',
        iconColor: 'text-orange-500'
      };
    }
    
    if (demand.statut === 'approuve') {
      if (demand.requires_double_approval && !demand.approuve_par_2) {
        return {
          label: 'Partiellement approuvé',
          icon: AlertCircle,
          color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
          iconColor: 'text-yellow-500'
        };
      }
      return {
        label: 'Approuvé',
        icon: Check,
        color: 'text-green-600 bg-green-50 border-green-200',
        iconColor: 'text-green-500'
      };
    }
    
    return {
      label: 'En attente',
      icon: Clock,
      color: 'text-gray-600 bg-gray-50 border-gray-200',
      iconColor: 'text-gray-500'
    };
  };

  const state = getApprovalState();
  const Icon = state.icon;

  if (!showDetails) {
    // Badge simple
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        state.color,
        className
      )}>
        <Icon className={cn("h-3.5 w-3.5", state.iconColor)} />
        {state.label}
      </div>
    );
  }

  // Badge détaillé avec les approbateurs
  return (
    <div className={cn("space-y-2", className)}>
      {/* Badge principal */}
      <div className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border",
        state.color
      )}>
        <Icon className={cn("h-4 w-4", state.iconColor)} />
        {state.label}
      </div>

      {/* Détails des approbations */}
      <div className="space-y-1.5">
        {/* Premier approbateur */}
        {demand.approuve_par && (
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-dark-text-secondary">
            <User className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
            <span className="font-medium">{demand.approuve_par_nom || demand.approuve_par}</span>
            <span className="text-gray-400 dark:text-dark-text-muted">•</span>
            <span>{formatDate(demand.date_approbation!, 'dd/MM/yyyy HH:mm')}</span>
            {!demand.requires_double_approval && (
              <span className="ml-auto px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">
                Validation complète
              </span>
            )}
          </div>
        )}

        {/* Deuxième approbateur */}
        {demand.requires_double_approval && (
          <>
            {demand.approuve_par_2 ? (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-dark-text-secondary">
                <User className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
                <span className="font-medium">{demand.approuve_par_2_nom || demand.approuve_par_2}</span>
                <span className="text-gray-400 dark:text-dark-text-muted">•</span>
                <span>{formatDate(demand.date_approbation_2!, 'dd/MM/yyyy HH:mm')}</span>
                <span className="ml-auto px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">
                  2e validation
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-dark-text-muted italic">
                <Users className="h-3.5 w-3.5" />
                <span>En attente de 2e validation</span>
                {demand.montant && (
                  <span className="ml-auto text-orange-600 font-medium">
                    Montant &gt; {SettingsService.getDoubleApprovalThreshold()} {SettingsService.getCurrency()}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Refus */}
        {demand.statut === 'refuse' && demand.refuse_par && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <X className="h-3.5 w-3.5" />
            <span className="font-medium">Refusé par {demand.refuse_par_nom || demand.refuse_par}</span>
            {demand.date_refus && (
              <>
                <span className="text-red-400">•</span>
                <span>{formatDate(demand.date_refus, 'dd/MM/yyyy HH:mm')}</span>
              </>
            )}
          </div>
        )}

        {/* Motif de refus */}
        {demand.motif_refus && (
          <div className="mt-2 p-2 bg-red-50 rounded-md border border-red-100">
            <p className="text-xs text-red-700">
              <span className="font-medium">Motif:</span> {demand.motif_refus}
            </p>
          </div>
        )}

        {/* Indicateur de double approbation requise */}
        {demand.requires_double_approval && demand.statut === 'soumis' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Cette demande nécessite une double approbation (montant &gt; {SettingsService.getDoubleApprovalThreshold()} {SettingsService.getCurrency()})</span>
          </div>
        )}
      </div>
    </div>
  );
}
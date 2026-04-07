import React from 'react';
import { Check, Clock, X, AlertCircle, Users, User, Banknote, FileText, Building } from 'lucide-react';
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
  // Déterminer l'état d'approbation avec les couleurs selon le tableau:
  // Brouillon: gray, En attente d'approbation / 1ère validation: amber, En attente 2e validation: violet
  // Approuvé: emerald, Paiement effectué: cyan, Remboursé: blue, Refusé: red
  const requiresDoubleApproval = demand.requires_double_approval ?? SettingsService.requiresDoubleApproval(demand.montant);

  const getApprovalState = () => {
    // Fallback: treat legacy 'en_attente' as 'brouillon'
    const statut = demand.statut === 'en_attente' ? 'brouillon' : demand.statut;

    if (statut === 'brouillon') {
      return {
        label: 'Brouillon',
        icon: FileText,
        color: 'text-gray-600 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
        iconColor: 'text-gray-500 dark:text-dark-text-muted'
      };
    }

    if (statut === 'refuse') {
      return {
        label: 'Refusé',
        icon: X,
        color: 'text-red-700 bg-red-100 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-600',
        iconColor: 'text-red-500 dark:text-red-400'
      };
    }

    if (statut === 'rembourse') {
      return {
        label: 'Remboursé',
        icon: Check,
        color: 'text-sky-700 bg-sky-100 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-600',
        iconColor: 'text-sky-500 dark:text-sky-400'
      };
    }

    if (statut === 'paiement_effectue') {
      return {
        label: 'Paiement effectué',
        icon: Banknote,
        color: 'text-cyan-700 bg-cyan-100 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-600',
        iconColor: 'text-cyan-500 dark:text-cyan-400'
      };
    }

    if (statut === 'en_attente_validation') {
      const hasFirstApproval = !!demand.approuve_par;

      if (!hasFirstApproval) {
        // En attente d'approbation simple ou de 1ère validation si double approbation requise
        return {
          label: requiresDoubleApproval ? 'En attente de 1ère validation' : "En attente d'approbation",
          icon: Clock,
          color: 'text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600',
          iconColor: 'text-amber-500 dark:text-amber-400'
        };
      } else if (requiresDoubleApproval && !demand.approuve_par_2) {
        // En attente de 2e validation
        return {
          label: 'En attente de 2e validation',
          icon: Users,
          color: 'text-violet-700 bg-violet-100 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-600',
          iconColor: 'text-violet-500 dark:text-violet-400'
        };
      } else {
        // Première approbation faite, pas besoin de 2e → devrait être 'approuve'
        // Mais le statut est encore 'en_attente_validation', afficher comme approuvé
        return {
          label: 'Approuvé',
          icon: Check,
          color: 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600',
          iconColor: 'text-emerald-500 dark:text-emerald-400'
        };
      }
    }

    if (statut === 'approuve') {
      if (demand.requires_double_approval && !demand.approuve_par_2) {
        return {
          label: 'Partiellement approuvé',
          icon: AlertCircle,
          color: 'text-yellow-700 bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-600',
          iconColor: 'text-yellow-500 dark:text-yellow-400'
        };
      }
      return {
        label: 'Approuvé',
        icon: Check,
        color: 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600',
        iconColor: 'text-emerald-500 dark:text-emerald-400'
      };
    }

    if (statut === 'cree_banque_attente_validation') {
      return {
        label: 'Créé dans banque',
        icon: Building,
        color: 'text-indigo-700 bg-indigo-100 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-600',
        iconColor: 'text-indigo-500 dark:text-indigo-400'
      };
    }

    // Default fallback (should not happen with valid statut)
    return {
      label: 'Statut inconnu',
      icon: AlertCircle,
      color: 'text-gray-700 dark:text-dark-text-primary bg-gray-100 dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-600',
      iconColor: 'text-gray-500 dark:text-dark-text-muted'
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
            {!requiresDoubleApproval && (
              <span className="ml-auto px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">
                Validation complète
              </span>
            )}
          </div>
        )}

        {/* Deuxième approbateur */}
        {requiresDoubleApproval && (
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
                    Montant &ge; {SettingsService.getDoubleApprovalThreshold()} {SettingsService.getCurrency()}
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
        {requiresDoubleApproval && demand.statut === 'en_attente_validation' && !demand.approuve_par && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Cette demande nécessite une double approbation (montant &ge; {SettingsService.getDoubleApprovalThreshold()} {SettingsService.getCurrency()})</span>
          </div>
        )}
      </div>
    </div>
  );
}

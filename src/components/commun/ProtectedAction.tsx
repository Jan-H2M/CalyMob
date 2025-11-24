import React, { ReactElement, cloneElement } from 'react';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { cn } from '@/utils/utils';

/**
 * Props pour ProtectedAction
 */
interface ProtectedActionProps {
  children: ReactElement;          // Élément à protéger (button, etc.)
  disabled?: boolean;               // Désactivation externe
  disabledMessage?: string;         // Message custom pour tooltip
  requireModify?: boolean;          // Vérifie canModify (défaut: true)
  showTooltip?: boolean;            // Affiche tooltip explicatif (défaut: true)
}

/**
 * Wrapper pour protéger les actions de modification selon l'année fiscale
 *
 * Désactive automatiquement les boutons/actions quand:
 * - L'année est verrouillée (permanently_closed)
 * - L'année est clôturée (closed) ET l'utilisateur n'est pas admin
 *
 * Usage:
 * ```tsx
 * <ProtectedAction requireModify>
 *   <button onClick={handleCreate}>
 *     <Plus /> Nouvelle Transaction
 *   </button>
 * </ProtectedAction>
 * ```
 */
export function ProtectedAction({
  children,
  disabled = false,
  disabledMessage,
  requireModify = true,
  showTooltip = true
}: ProtectedActionProps) {
  const { canModify, selectedFiscalYear } = useFiscalYear();

  // Déterminer si l'action est désactivée
  const isDisabled = disabled || (requireModify && !canModify);

  /**
   * Générer message tooltip selon contexte
   */
  const getTooltipMessage = (): string => {
    if (disabledMessage) return disabledMessage;
    if (!selectedFiscalYear) return 'Aucune année fiscale sélectionnée';

    switch (selectedFiscalYear.status) {
      case 'permanently_closed':
        return 'Année verrouillée définitivement - Aucune modification possible';
      case 'closed':
        return 'Année clôturée - Seuls les administrateurs peuvent rouvrir temporairement';
      default:
        return 'Action désactivée';
    }
  };

  // Clone l'élément enfant avec les props désactivation
  const clonedElement = cloneElement(children, {
    disabled: isDisabled,
    className: cn(
      children.props.className,
      isDisabled && 'opacity-50 cursor-not-allowed'
    ),
    title: showTooltip && isDisabled ? getTooltipMessage() : children.props.title
  });

  return clonedElement;
}

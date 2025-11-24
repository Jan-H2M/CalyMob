import React from 'react';
import { CreditCard, Banknote, Clock, CheckCircle } from 'lucide-react';
import { InscriptionEvenement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface InscriptionPaymentBadgeProps {
  inscription: InscriptionEvenement;
  showDate?: boolean;
  className?: string;
}

/**
 * Display payment status badge for an inscription
 *
 * States:
 * - Bank linked: Green badge with transaction amount and date
 * - Cash paid: Blue badge with payment date
 * - Unpaid: Orange badge
 */
export function InscriptionPaymentBadge({
  inscription,
  showDate = true,
  className
}: InscriptionPaymentBadgeProps) {
  // State 1: Paid via bank transfer (has transaction_id)
  if (inscription.transaction_id && inscription.paye) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 text-sm rounded-full">
          <CreditCard className="h-3.5 w-3.5" />
          <span className="font-medium">
            Transaction: {formatMontant(inscription.transaction_montant || inscription.prix)}
          </span>
          {showDate && inscription.date_paiement && (
            <span className="text-green-600 ml-1">
              ({formatDate(inscription.date_paiement, 'dd/MM/yyyy')})
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
          <CheckCircle className="h-3 w-3" />
          Payé
        </span>
      </div>
    );
  }

  // State 2: Paid in cash (no transaction_id, but paye=true)
  if (!inscription.transaction_id && inscription.paye) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
          <Banknote className="h-3.5 w-3.5" />
          <span className="font-medium">Paiement en espèces</span>
          {showDate && inscription.date_paiement && (
            <span className="text-blue-600 ml-1">
              ({formatDate(inscription.date_paiement, 'dd/MM/yyyy')})
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
          <CheckCircle className="h-3 w-3" />
          Payé
        </span>
      </div>
    );
  }

  // State 3: Unpaid (no transaction_id, paye=false)
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
        <Clock className="h-3.5 w-3.5" />
        <span className="font-medium">Aucun paiement enregistré</span>
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">
        <Clock className="h-3 w-3" />
        Non payé
      </span>
    </div>
  );
}

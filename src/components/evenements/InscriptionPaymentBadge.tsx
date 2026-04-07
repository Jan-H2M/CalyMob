import React from 'react';
import { CreditCard, Banknote, Clock, CheckCircle, Smartphone, Mail, MapPin } from 'lucide-react';
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
 * 1. Bank linked: Green badge with transaction amount and date
 * 2. Cash paid: Blue badge with payment date (explicit mode_paiement='cash')
 * 3. CalyMob payment: Amber badge awaiting bank reconciliation (paye=true, no transaction, not cash)
 * 4. QR email sent: Yellow badge - QR code sent by email
 * 5. QR on site: Gray badge - will pay on site
 * 6. Unpaid: Orange badge
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

  // State 2: Paid in cash (explicit mode_paiement='cash')
  if (!inscription.transaction_id && inscription.paye && inscription.mode_paiement === 'cash') {
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

  // State 3: Paid via CalyMob but bank transaction not yet matched
  // Catches all paye=true without transaction_id and not cash (CalyMob EPC QR payments, etc.)
  if (inscription.paye && !inscription.transaction_id) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 text-sm rounded-full">
          <Smartphone className="h-3.5 w-3.5" />
          <span className="font-medium">Payé via CalyMob</span>
          {showDate && inscription.date_paiement && (
            <span className="text-amber-600 ml-1">
              ({formatDate(inscription.date_paiement, 'dd/MM/yyyy')})
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
          <Clock className="h-3 w-3" />
          En attente banque
        </span>
      </div>
    );
  }

  // State 4: QR code sent by email - waiting for payment
  if (inscription.payment_status === 'qr_email_sent') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-full">
          <Mail className="h-3.5 w-3.5" />
          <span className="font-medium">QR code envoyé</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded-full">
          <Clock className="h-3 w-3" />
          En attente
        </span>
      </div>
    );
  }

  // State 5: Will pay on site - QR code shown at event
  if (inscription.payment_status === 'qr_on_site') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-sm rounded-full">
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium">Paiement sur place</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-full">
          <Clock className="h-3 w-3" />
          À l'événement
        </span>
      </div>
    );
  }

  // State 6: Unpaid (no transaction_id, paye=false)
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

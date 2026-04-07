/**
 * EpcQrCode Component
 *
 * Displays an EPC QR code for SEPA bank transfers.
 * Shows a disabled state with reason when QR cannot be generated.
 * Includes checkbox to mark payment as done (before transaction is booked).
 */

import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, AlertTriangle, CheckCircle, Check, Banknote } from 'lucide-react';
import { generateEpcPayload, canGenerateEpcQr, formatIbanDisplay, isStructuredCommunication, formatStructuredReference, EpcQrCodeData } from '@/utils/epcQrCode';
import { cn } from '@/utils/utils';

interface EpcQrCodeProps {
  beneficiaryName: string;
  iban: string | undefined;
  amount: number;
  communicationQr?: string;
  /** Fallback reference when communicationQr is empty (e.g., demand ID) */
  fallbackReference?: string;
  status: string;
  isAlreadyPaid: boolean;
  isPaiementManuel?: boolean;
  paiementManuelDate?: Date;
  onPaiementManuelChange?: (checked: boolean) => void;
  className?: string;
}

export function EpcQrCode({
  beneficiaryName,
  iban,
  amount,
  communicationQr,
  fallbackReference,
  status,
  isAlreadyPaid,
  isPaiementManuel,
  paiementManuelDate,
  onPaiementManuelChange,
  className,
}: EpcQrCodeProps) {
  // Check if QR can be generated
  const qrStatus = useMemo(() => {
    return canGenerateEpcQr(status, !!iban, isAlreadyPaid);
  }, [status, iban, isAlreadyPaid]);

  // Generate QR payload - use fallback reference if communication is empty
  // Ensure we always have some communication text
  const effectiveCommunication = communicationQr?.trim() || fallbackReference?.trim() || 'Paiement';

  // Detect if the communication is a Belgian structured reference (OGM)
  const isStructured = useMemo(() => isStructuredCommunication(effectiveCommunication), [effectiveCommunication]);

  const qrPayload = useMemo(() => {
    if (!qrStatus.canGenerate || !iban) return null;

    const data: EpcQrCodeData = {
      beneficiaryName,
      iban,
      amount,
      // If structured communication detected → put on line 10 (reference)
      // Otherwise → put on line 11 (description/unstructured text)
      ...(isStructured
        ? { reference: formatStructuredReference(effectiveCommunication) }
        : { description: effectiveCommunication.substring(0, 140) }
      ),
    };

    return generateEpcPayload(data);
  }, [qrStatus.canGenerate, beneficiaryName, iban, amount, effectiveCommunication, isStructured]);

  return (
    <div className={cn('bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <QrCode className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
        <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">
          QR Code de paiement
        </h3>
      </div>

      {/* Paiement manuel indicator - show when marked as paid but not yet booked */}
      {isPaiementManuel && !isAlreadyPaid && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Banknote className="h-4 w-4" />
            <span className="text-sm font-medium">Paiement effectué</span>
          </div>
          {paiementManuelDate && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 ml-6">
              le {new Date(paiementManuelDate).toLocaleDateString('fr-FR')}
            </p>
          )}
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 ml-6">
            En attente de réconciliation avec la transaction bancaire
          </p>
        </div>
      )}

      {qrStatus.canGenerate && qrPayload ? (
        <div className="flex flex-col items-center">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <QRCodeSVG
              value={qrPayload}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>

          {/* Payment details */}
          <div className="mt-4 text-center space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
              {beneficiaryName}
            </p>
            <p className="text-xs font-mono text-gray-600 dark:text-dark-text-secondary">
              {formatIbanDisplay(iban || '')}
            </p>
            <p className="text-lg font-bold text-calypso-blue">
              {amount.toFixed(2)} €
            </p>
            {/* Show communication/mededeling */}
            {effectiveCommunication && (
              <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2 max-w-[200px] break-words">
                {!communicationQr?.trim() && fallbackReference && (
                  <span className="text-amber-600 dark:text-amber-400">⚠ </span>
                )}
                {effectiveCommunication.substring(0, 50)}
                {effectiveCommunication.length > 50 && '...'}
              </p>
            )}
          </div>

          {/* Mark as paid checkbox */}
          {onPaiementManuelChange && !isAlreadyPaid && (
            <label className="mt-4 flex items-center gap-2 cursor-pointer group">
              <div className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                isPaiementManuel
                  ? "bg-green-500 border-green-500"
                  : "border-gray-300 dark:border-dark-border dark:border-gray-600 group-hover:border-green-400"
              )}>
                {isPaiementManuel && <Check className="h-3.5 w-3.5 text-white" />}
              </div>
              <input
                type="checkbox"
                checked={isPaiementManuel || false}
                onChange={(e) => onPaiementManuelChange(e.target.checked)}
                className="sr-only"
              />
              <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                Paiement effectué
              </span>
            </label>
          )}

          {/* Success indicator */}
          {!isPaiementManuel && (
            <div className="mt-3 flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" />
              <span>Scannez avec votre app bancaire</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center py-6">
          {/* Disabled QR placeholder */}
          <div className="relative">
            <div className="bg-gray-200 dark:bg-dark-bg-secondary p-4 rounded-lg opacity-50">
              <QrCode className="h-[148px] w-[148px] text-gray-400 dark:text-dark-text-muted" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white dark:bg-dark-bg-secondary rounded-full p-2 shadow">
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              </div>
            </div>
          </div>

          {/* Reason why disabled */}
          <div className="mt-4 text-center">
            <p className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">
              QR code non disponible
            </p>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              {qrStatus.reason}
            </p>
          </div>

          {/* Hints based on reason */}
          {!iban && (
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2 text-center max-w-xs">
              Le bénéficiaire doit avoir un IBAN renseigné dans son profil.
            </p>
          )}
          {status !== 'approuve' && !isAlreadyPaid && (
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2 text-center max-w-xs">
              La demande doit être approuvée avant de pouvoir générer le QR code.
            </p>
          )}
        </div>
      )}

      {/* EPC Info */}
      <p className="text-xs text-gray-400 dark:text-dark-text-muted text-center mt-4">
        EPC QR Code · SEPA Credit Transfer
      </p>
    </div>
  );
}

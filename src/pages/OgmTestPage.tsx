/**
 * OGM Test Page
 *
 * Test page for Belgian structured communication (OGM) implementation.
 * Allows generating test OGMs, creating EPC QR codes with OGM on line 10,
 * and testing OGM parsing from bank remittance text.
 *
 * Route: /parametres/ogm-test
 */

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Plus,
  Search,
  ClipboardCopy,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

// OGM utilities
import {
  formatOgmDisplay,
  extractOgmFromRemittance,
  validateOgm,
} from '@/utils/ogm';

// OGM service
import {
  generateNextOgm,
  createPaymentReference,
  listPaymentReferences,
  type PaymentReference,
  type OgmStatus,
} from '@/services/ogmService';

// EPC QR
import { generateEpcPayload, formatIbanDisplay, type EpcQrCodeData } from '@/utils/epcQrCode';

// ============================================================
// TYPES
// ============================================================

interface BankSettings {
  iban: string;
  beneficiaryName: string;
  bic?: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function OgmTestPage() {
  const { clubId, appUser } = useAuth();
  const navigate = useNavigate();

  // Bank settings
  const [bankSettings, setBankSettings] = useState<BankSettings | null>(null);
  const [bankLoading, setBankLoading] = useState(true);

  // OGM generation
  const [generatedOgm, setGeneratedOgm] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('Test paiement 3 plongées 25/01/2026');
  const [generating, setGenerating] = useState(false);

  // QR code
  const [qrPayload, setQrPayload] = useState<string | null>(null);

  // Parser tester
  const [parserInput, setParserInput] = useState('');
  const [parserResult, setParserResult] = useState<{
    ogm: string | null;
    freeText: string;
  } | null>(null);

  // Payment references list
  const [references, setReferences] = useState<PaymentReference[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);

  // Copied state
  const [copiedOgm, setCopiedOgm] = useState<string | null>(null);

  // ============================================================
  // LOAD BANK SETTINGS
  // ============================================================

  useEffect(() => {
    async function loadBankSettings() {
      if (!clubId) {
        setBankLoading(false);
        return;
      }
      try {
        const settingsRef = doc(db, 'clubs', clubId, 'settings', 'bank');
        const settingsDoc = await getDoc(settingsRef);

        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setBankSettings({
            iban: data.iban || '',
            beneficiaryName: data.beneficiaryName || '',
            bic: data.bic || '',
          });
        } else {
          toast.error('Paramètres bancaires non configurés');
        }
      } catch (error) {
        logger.error('Erreur chargement paramètres bancaires:', error);
        toast.error('Erreur lors du chargement des paramètres bancaires');
      } finally {
        setBankLoading(false);
      }
    }
    loadBankSettings();
  }, [clubId]);

  // ============================================================
  // LOAD PAYMENT REFERENCES
  // ============================================================

  const loadReferences = useCallback(async () => {
    if (!clubId) return;
    setRefsLoading(true);
    try {
      const refs = await listPaymentReferences(clubId, undefined, 20);
      setReferences(refs);
    } catch (error) {
      logger.error('Erreur chargement payment references:', error);
      toast.error('Erreur lors du chargement des références');
    } finally {
      setRefsLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  // ============================================================
  // GENERATE OGM + QR
  // ============================================================

  const handleGenerateOgm = async () => {
    if (!clubId || !appUser || !bankSettings) return;

    setGenerating(true);
    try {
      // 1. Generate unique OGM
      const ogm = await generateNextOgm(clubId);
      setGeneratedOgm(ogm);

      // 2. Create payment reference
      await createPaymentReference(clubId, {
        payload_text: freeText || 'Test paiement 3 plongées 25/01/2026',
        context_type: 'TEST',
        amount_cents: 100, // €1.00
        created_by: appUser.id || 'unknown',
      });

      // 3. Generate EPC QR payload
      const epcData: EpcQrCodeData = {
        beneficiaryName: bankSettings.beneficiaryName,
        iban: bankSettings.iban,
        amount: 1.00,
        bic: bankSettings.bic || undefined,
        reference: ogm,                                    // Line 10: OGM
        description: freeText || 'Test paiement 3 plongées 25/01/2026',      // Line 11: Free text
      };
      const payload = generateEpcPayload(epcData);
      setQrPayload(payload);

      // 4. Refresh list
      await loadReferences();

      toast.success(`VCS généré: ${formatOgmDisplay(ogm)}`);
    } catch (error) {
      logger.error('Erreur génération OGM:', error);
      toast.error('Erreur lors de la génération du VCS');
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // OGM PARSER
  // ============================================================

  const handleParse = () => {
    if (!parserInput.trim()) {
      setParserResult(null);
      return;
    }
    const result = extractOgmFromRemittance(parserInput);
    setParserResult(result);
  };

  // ============================================================
  // COPY HELPER
  // ============================================================

  const copyToClipboard = async (text: string, ogmId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOgm(ogmId);
      setTimeout(() => setCopiedOgm(null), 2000);
    } catch {
      toast.error('Erreur copie');
    }
  };

  // ============================================================
  // STATUS BADGE
  // ============================================================

  const statusBadge = (status: OgmStatus) => {
    const styles: Record<OgmStatus, string> = {
      NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      MATCHED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      EXPIRED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      CANCELLED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', styles[status] || styles.NEW)}>
        {status}
      </span>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (bankLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/parametres')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            Test VCS (Communication Structurée)
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
            Page de test pour les communications structurées belges sur la ligne 10 du QR EPC
          </p>
        </div>
      </div>

      {/* Bank settings info */}
      {bankSettings ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Bénéficiaire : {bankSettings.beneficiaryName}
          </p>
          <p className="text-sm font-mono text-blue-600 dark:text-blue-400 mt-1">
            IBAN: {formatIbanDisplay(bankSettings.iban)}
          </p>
          {bankSettings.bic && (
            <p className="text-xs text-blue-500 dark:text-blue-500 mt-1">
              BIC: {bankSettings.bic}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm font-medium">
              Paramètres bancaires non configurés. Allez dans Paramètres → Banque.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 1: Generate OGM + QR */}
      {/* ============================================================ */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Générer VCS + QR Code
        </h2>

        <div className="space-y-4">
          {/* Free text input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Description interne (non envoyée dans le QR — référence interne uniquement)
            </label>
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Ex: Remb. plongée 25/01/2026"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                         bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary
                         focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              maxLength={140}
            />
            <p className="text-xs text-gray-400 mt-1">{freeText.length}/140 caractères</p>
          </div>

          {/* Amount info */}
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary">
            <span>Montant fixe:</span>
            <span className="font-bold text-calypso-blue">1,00 €</span>
            <span className="text-gray-400">(test)</span>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerateOgm}
            disabled={generating || !bankSettings}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors",
              generating || !bankSettings
                ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                : "bg-calypso-blue hover:bg-calypso-blue/90"
            )}
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Générer un nouveau VCS + QR
          </button>

          {/* Generated OGM + QR display */}
          {generatedOgm && qrPayload && (
            <div className="mt-6 flex flex-col md:flex-row gap-6 items-start">
              {/* QR Code */}
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <QRCodeSVG
                    value={qrPayload}
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">EPC QR Code · SEPA Credit Transfer</p>
              </div>

              {/* Details */}
              <div className="flex-1 space-y-3">
                {/* OGM display */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                    Ligne 10 — Communication structurée (VCS)
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-mono font-bold text-blue-800 dark:text-blue-300">
                      {formatOgmDisplay(generatedOgm)}
                    </p>
                    <button
                      onClick={() => copyToClipboard(formatOgmDisplay(generatedOgm), generatedOgm)}
                      className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                      title="Copier"
                    >
                      {copiedOgm === generatedOgm ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <ClipboardCopy className="h-4 w-4 text-blue-500" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Internal description */}
                <div className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted font-medium mb-1">
                    Description interne (non envoyée à la banque)
                  </p>
                  <p className="text-sm text-gray-800 dark:text-dark-text-primary">
                    {freeText || 'Test paiement 3 plongées 25/01/2026'}
                  </p>
                </div>

                {/* Raw payload (collapsible) */}
                <details className="text-xs">
                  <summary className="text-gray-400 cursor-pointer hover:text-gray-600">
                    Voir payload brut (12 lignes EPC)
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg overflow-x-auto font-mono text-xs">
                    {qrPayload.split('\n').map((line, i) => (
                      <div key={i}>
                        <span className="text-gray-500">{String(i + 1).padStart(2, ' ')}.</span> {line || '(vide)'}
                      </div>
                    ))}
                  </pre>
                </details>

                {/* Instructions */}
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                  <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">
                    Procédure de test
                  </p>
                  <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal list-inside">
                    <li>Scannez ce QR code avec BNP Easy Banking</li>
                    <li>Payez 1,00 EUR</li>
                    <li>Attendez 24-48h (compensation bancaire)</li>
                    <li>Lancez la synchronisation Ponto</li>
                    <li>Vérifiez que le VCS apparaît dans remittanceInformation</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: OGM Parser Tester */}
      {/* ============================================================ */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <Search className="h-5 w-5" />
          Testeur d'extraction VCS
        </h2>
        <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-4">
          Collez ici un texte bancaire (remittanceInformation) pour tester si le VCS est correctement extrait.
        </p>

        <div className="space-y-4">
          <textarea
            value={parserInput}
            onChange={(e) => setParserInput(e.target.value)}
            placeholder="Ex : +++100/0000/00640+++&#10;ou : 100000000640"
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                       bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary
                       focus:ring-2 focus:ring-calypso-blue focus:border-transparent
                       font-mono text-sm"
            rows={3}
          />

          <button
            onClick={handleParse}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 dark:bg-gray-700
                       text-white font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            <Search className="h-4 w-4" />
            Analyser
          </button>

          {/* Parser results */}
          {parserResult && (
            <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg space-y-3">
              {parserResult.ogm ? (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                      VCS trouvé !
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">VCS (12 chiffres)</p>
                      <p className="font-mono text-sm font-bold">{parserResult.ogm}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Format d'affichage</p>
                      <p className="font-mono text-sm font-bold text-blue-600">
                        {formatOgmDisplay(parserResult.ogm)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Validation</p>
                      <p className="text-sm">
                        {validateOgm(parserResult.ogm) ? (
                          <span className="text-green-600">✓ Mod97 OK</span>
                        ) : (
                          <span className="text-red-600">✗ Mod97 ERREUR</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Texte libre</p>
                      <p className="text-sm text-gray-700 dark:text-dark-text-secondary">
                        {parserResult.freeText || '(aucun)'}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                    Aucun VCS valide trouvé
                  </span>
                </div>
              )}

              {parserResult.freeText && !parserResult.ogm && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Texte complet comme communication libre</p>
                  <p className="text-sm text-gray-700 dark:text-dark-text-secondary font-mono">
                    {parserResult.freeText}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick test examples */}
          <div className="border-t pt-4">
            <p className="text-xs text-gray-400 mb-2">Exemples rapides :</p>
            <div className="flex flex-wrap gap-2">
              {[
                '+++100/0000/00197+++',
                '***100/0000/00197***',
                '100000000197',
                'Cotisation annuelle',
                'Paiement plongée janvier',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setParserInput(example);
                    const result = extractOgmFromRemittance(example);
                    setParserResult(result);
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-dark-bg-tertiary rounded
                             hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors
                             text-gray-600 dark:text-dark-text-secondary font-mono"
                >
                  {example.substring(0, 40)}{example.length > 40 ? '...' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: Payment References Overview */}
      {/* ============================================================ */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Références de paiement
          </h2>
          <button
            onClick={loadReferences}
            disabled={refsLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg
                       bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200
                       dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refsLoading && "animate-spin")} />
            Rafraîchir
          </button>
        </div>

        {references.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-dark-text-muted text-center py-8">
            Aucune référence de paiement trouvée. Générez un premier VCS ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-dark-border text-left">
                  <th className="pb-2 font-medium text-gray-500">VCS</th>
                  <th className="pb-2 font-medium text-gray-500">Communication</th>
                  <th className="pb-2 font-medium text-gray-500">Type</th>
                  <th className="pb-2 font-medium text-gray-500">Montant</th>
                  <th className="pb-2 font-medium text-gray-500">Statut</th>
                  <th className="pb-2 font-medium text-gray-500">Créé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {references.map((ref) => (
                  <tr key={ref.ogm} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {ref.ogm_display}
                        </span>
                        <button
                          onClick={() => copyToClipboard(ref.ogm_display, ref.ogm)}
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          {copiedOgm === ref.ogm ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <ClipboardCopy className="h-3 w-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 text-gray-700 dark:text-dark-text-secondary max-w-[200px] truncate">
                      {ref.payload_text}
                    </td>
                    <td className="py-2">
                      <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary">
                        {ref.context_type}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {ref.amount_cents ? `€${(ref.amount_cents / 100).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2">{statusBadge(ref.status)}</td>
                    <td className="py-2 text-xs text-gray-400">
                      {ref.created_at?.toDate?.()
                        ? ref.created_at.toDate().toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION 4: How it works */}
      {/* ============================================================ */}
      <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl p-6 text-sm text-gray-600 dark:text-dark-text-secondary space-y-3">
        <h3 className="font-semibold text-gray-800 dark:text-dark-text-primary">
          Comment ça fonctionne ?
        </h3>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            Un virement belge utilise soit une <strong>communication structurée</strong> (VCS, 12 chiffres
            avec contrôle mod97), soit une <strong>communication libre</strong> (texte). Jamais les deux.
          </li>
          <li>
            Le QR EPC envoie le VCS sur la <strong>ligne 10</strong> (structured reference).
            La ligne 11 (texte libre) reste vide. Les banques ne modifient JAMAIS une communication structurée.
          </li>
          <li>
            Lors de l'<strong>import Ponto</strong>, le VCS est extrait du champ remittanceInformation
            et sauvegardé séparément.
          </li>
          <li>
            Lors de la <strong>réconciliation</strong>, on cherche par VCS dans payment_references.
            Correspondance trouvée → 100% de confiance, liaison automatique.
          </li>
        </ol>
        <p className="text-xs text-gray-400 mt-2">
          Collection : clubs/{'{clubId}'}/payment_references/{'{ogm_digits}'}
          · Compteur : clubs/{'{clubId}'}/settings/ogm_counter
        </p>
      </div>
    </div>
  );
}

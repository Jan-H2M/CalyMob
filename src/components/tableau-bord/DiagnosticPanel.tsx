/**
 * Panneau de diagnostic pour identifier les écarts entre le dashboard et la banque
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { startOfDay, endOfDay } from 'date-fns';
import { FiscalYear } from '@/types';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface DiagnosticPanelProps {
  clubId: string;
  fiscalYear: FiscalYear;
}

interface TransactionIssue {
  id: string;
  date: string;
  montant: number;
  contrepartie: string;
  compte: string;
  issue: string;
}

export function DiagnosticPanel({ clubId, fiscalYear }: DiagnosticPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Données attendues (du CSV bancaire)
  const EXPECTED_DATA = {
    transactions: 955,
    revenus: 57291.66,
    depenses: 68559.97,
    solde_debut: 16009.57,
    solde_final: 4741.26
  };

  const { data: diagnostic } = useQuery({
    queryKey: ['diagnostic', clubId, fiscalYear.year],
    queryFn: async () => {
      const normalizedCurrentAccount = fiscalYear.account_numbers?.bank_current?.replace(/\s/g, '');

      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const q = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date)))
      );

      const snapshot = await getDocs(q);

      let counted = { count: 0, revenus: 0, depenses: 0 };
      let excluded = { count: 0, revenus: 0, depenses: 0 };
      const issues: TransactionIssue[] = [];

      // Compter les transactions par IBAN
      const accountBreakdown: Record<string, { count: number; revenus: number; depenses: number }> = {};

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;
        const date = data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A';

        // Statistiques par compte
        const compte = data.numero_compte || 'UNKNOWN';
        if (!accountBreakdown[compte]) {
          accountBreakdown[compte] = { count: 0, revenus: 0, depenses: 0 };
        }
        accountBreakdown[compte].count++;
        if (montant > 0) {
          accountBreakdown[compte].revenus += montant;
        } else {
          accountBreakdown[compte].depenses += Math.abs(montant);
        }

        // Reproduire la logique du dashboard
        let shouldExclude = false;
        let issueReason = '';

        // 1. Exclure les transactions ventilées (parents)
        if (data.is_parent) {
          shouldExclude = true;
          issueReason = 'Transaction parent (ventilée)';
        }

        // 2. Filtrer par compte courant
        if (!shouldExclude && normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) {
            shouldExclude = true;
            issueReason = `Autre compte: ${data.numero_compte}`;
          }
        }

        if (shouldExclude) {
          excluded.count++;
          if (montant > 0) {
            excluded.revenus += montant;
          } else {
            excluded.depenses += Math.abs(montant);
          }

          issues.push({
            id: doc.id,
            date,
            montant,
            contrepartie: data.nom_contrepartie || 'N/A',
            compte: data.numero_compte || 'N/A',
            issue: issueReason
          });
        } else {
          counted.count++;
          if (montant > 0) {
            counted.revenus += montant;
          } else {
            counted.depenses += Math.abs(montant);
          }
        }
      });

      const solde_calcule = EXPECTED_DATA.solde_debut + counted.revenus - counted.depenses;

      return {
        total_firestore: snapshot.size,
        counted,
        excluded,
        issues,
        accountBreakdown,
        discrepancies: {
          transactions: counted.count - EXPECTED_DATA.transactions,
          revenus: counted.revenus - EXPECTED_DATA.revenus,
          depenses: counted.depenses - EXPECTED_DATA.depenses,
          solde: solde_calcule - EXPECTED_DATA.solde_final
        }
      };
    },
    enabled: !!clubId && !!fiscalYear
  });

  if (!diagnostic) return null;

  const hasIssues = Math.abs(diagnostic.discrepancies.solde) > 0.01;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          {hasIssues ? (
            <AlertCircle className="w-5 h-5 text-orange-600" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-600" />
          )}
          <h3 className="font-semibold text-gray-900">
            Diagnostic comptable
          </h3>
          {hasIssues && (
            <span className="text-sm text-orange-600 font-medium">
              Écart détecté: {diagnostic.discrepancies.solde.toFixed(2)} €
            </span>
          )}
        </div>
        <span className="text-sm text-gray-500">
          {isExpanded ? 'Masquer' : 'Afficher'} les détails
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Comparaison Firestore vs CSV */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-xs text-blue-600 font-medium">Transactions comptées</div>
              <div className="text-2xl font-bold text-blue-900">{diagnostic.counted.count}</div>
              <div className="text-xs text-blue-600">Attendu: {EXPECTED_DATA.transactions}</div>
              {diagnostic.discrepancies.transactions !== 0 && (
                <div className="text-xs font-medium text-orange-600 mt-1">
                  Écart: {diagnostic.discrepancies.transactions > 0 ? '+' : ''}{diagnostic.discrepancies.transactions}
                </div>
              )}
            </div>

            <div className="bg-green-50 p-3 rounded">
              <div className="text-xs text-green-600 font-medium">Revenus</div>
              <div className="text-2xl font-bold text-green-900">{diagnostic.counted.revenus.toFixed(2)} €</div>
              <div className="text-xs text-green-600">Attendu: {EXPECTED_DATA.revenus.toFixed(2)} €</div>
              {Math.abs(diagnostic.discrepancies.revenus) > 0.01 && (
                <div className="text-xs font-medium text-orange-600 mt-1">
                  Écart: {diagnostic.discrepancies.revenus > 0 ? '+' : ''}{diagnostic.discrepancies.revenus.toFixed(2)} €
                </div>
              )}
            </div>

            <div className="bg-red-50 p-3 rounded">
              <div className="text-xs text-red-600 font-medium">Dépenses</div>
              <div className="text-2xl font-bold text-red-900">{diagnostic.counted.depenses.toFixed(2)} €</div>
              <div className="text-xs text-red-600">Attendu: {EXPECTED_DATA.depenses.toFixed(2)} €</div>
              {Math.abs(diagnostic.discrepancies.depenses) > 0.01 && (
                <div className="text-xs font-medium text-orange-600 mt-1">
                  Écart: {diagnostic.discrepancies.depenses > 0 ? '+' : ''}{diagnostic.discrepancies.depenses.toFixed(2)} €
                </div>
              )}
            </div>
          </div>

          {/* Répartition par compte */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Répartition par compte</h4>
            <div className="space-y-2">
              {Object.entries(diagnostic.accountBreakdown).map(([compte, stats]) => (
                <div key={compte} className="bg-gray-50 p-2 rounded text-sm">
                  <div className="font-mono text-xs text-gray-600">{compte}</div>
                  <div className="flex gap-4 text-xs text-gray-700">
                    <span>{stats.count} transactions</span>
                    <span className="text-green-600">+{stats.revenus.toFixed(2)} €</span>
                    <span className="text-red-600">-{stats.depenses.toFixed(2)} €</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transactions exclues */}
          {diagnostic.excluded.count > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Transactions exclues ({diagnostic.excluded.count})
              </h4>
              <div className="bg-yellow-50 p-3 rounded text-sm">
                <div className="flex gap-4">
                  <span className="text-green-600">Revenus exclus: {diagnostic.excluded.revenus.toFixed(2)} €</span>
                  <span className="text-red-600">Dépenses exclues: {diagnostic.excluded.depenses.toFixed(2)} €</span>
                </div>
              </div>

              {/* Première 10 transactions exclues */}
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                {diagnostic.issues.slice(0, 10).map((issue, idx) => (
                  <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono">{issue.date}</span>
                      <span className={issue.montant > 0 ? 'text-green-600' : 'text-red-600'}>
                        {issue.montant.toFixed(2)} €
                      </span>
                    </div>
                    <div className="text-gray-600">{issue.contrepartie}</div>
                    <div className="text-orange-600 font-medium">{issue.issue}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

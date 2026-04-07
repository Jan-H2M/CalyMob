import { logger } from '@/utils/logger';
/**
 * IBAN Lookup Modal
 * Searches for IBANs in transactions and lets the user select one
 */

import { useState, useEffect } from 'react';
import { X, Search, CreditCard, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { searchIbansForMember, IbanMatch } from '@/services/ibanLookupService';
import { formatIBAN } from '@/utils/fieldMapper';
import { formatDate } from '@/utils/formatters';

interface IbanLookupModalProps {
  clubId: string;
  firstName: string;
  lastName: string;
  currentIban?: string;
  onSelect: (iban: string) => void;
  onClose: () => void;
}

export function IbanLookupModal({
  clubId,
  firstName,
  lastName,
  currentIban,
  onSelect,
  onClose
}: IbanLookupModalProps) {
  const [matches, setMatches] = useState<IbanMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await searchIbansForMember(clubId, firstName, lastName);
        setMatches(results);
      } catch (err) {
        logger.error('Error searching IBANs:', err);
        setError('Erreur lors de la recherche');
      } finally {
        setLoading(false);
      }
    };

    search();
  }, [clubId, firstName, lastName]);

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-600 bg-green-100';
    if (score >= 80) return 'text-blue-600 bg-blue-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 95) return 'Excellent';
    if (score >= 80) return 'Bon';
    if (score >= 60) return 'Possible';
    return 'Faible';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-paper rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                Recherche IBAN
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                {firstName} {lastName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-hover rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-3" />
              <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Recherche dans les transactions...
              </p>
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-8 w-8 text-gray-400 dark:text-dark-text-muted mb-3" />
              <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Aucun IBAN correspondant trouve dans les transactions
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                {matches.length} IBAN(s) trouve(s) dans les transactions. Cliquez pour selectionner.
              </p>

              {matches.map((match, index) => (
                <button
                  key={match.iban}
                  onClick={() => onSelect(match.iban)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                    currentIban === match.iban
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-dark-border hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* IBAN */}
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          {formatIBAN(match.iban)}
                        </span>
                        {currentIban === match.iban && (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>

                      {/* Transaction name */}
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
                        Nom dans transaction: <span className="font-medium">{match.contrepartieNom}</span>
                      </p>

                      {/* Stats */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-dark-text-muted">
                        <span>{match.transactionCount} transaction(s)</span>
                        <span>Du {formatDate(match.firstSeen)} au {formatDate(match.lastSeen)}</span>
                      </div>
                    </div>

                    {/* Score badge */}
                    <div className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(match.score)}`}>
                      {match.score}% - {getScoreLabel(match.score)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t dark:border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-hover rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

import { CheckCircle, XCircle, Calendar, FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { InventoryAudit, InventoryAuditItem } from '@/types/inventory';

interface Props {
  audit: InventoryAudit;
  items: InventoryAuditItem[];
  previousAudits?: InventoryAudit[];
}

export function AuditSummary({ audit, items, previousAudits = [] }: Props) {
  const missingItems = items.filter(i => i.date_controle && !i.retrouve);
  const foundItems = items.filter(i => i.retrouve);
  const conditionChanges = foundItems.filter(i => i.etat_final && i.etat_final !== i.etat_initial);

  // Group missing items by type
  const missingByType: Record<string, InventoryAuditItem[]> = {};
  missingItems.forEach(item => {
    const type = item.typeName || 'Autre';
    if (!missingByType[type]) missingByType[type] = [];
    missingByType[type].push(item);
  });

  // Get previous year's audit for comparison (verrouille or fermee = completed)
  const previousYearAudit = previousAudits
    .filter(a => a.year < audit.year && (a.statut === 'verrouille' || a.statut === 'fermee'))
    .sort((a, b) => b.year - a.year)[0];

  // Calculate trend
  const getTrend = (current: number, previous: number | undefined) => {
    if (previous === undefined) return null;
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'same';
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
            Résumé: {audit.nom}
          </h2>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-4 w-4 mr-1" />
            Terminé
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
            <p className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">
              {audit.total_items}
            </p>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Total articles</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {foundItems.length}
            </p>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Retrouvés</p>
          </div>
          <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">
              {missingItems.length}
            </p>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Manquants</p>
          </div>
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {conditionChanges.length}
            </p>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">États modifiés</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Du {audit.date_debut.toDate().toLocaleDateString('fr-FR')}
            {audit.date_fin && ` au ${audit.date_fin.toDate().toLocaleDateString('fr-FR')}`}
          </span>
        </div>
      </div>

      {/* Historical Comparison */}
      {previousAudits.length > 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">
            Comparaison avec les années précédentes
          </h3>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Année</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Retrouvés</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Manquants</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Taux</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {/* Current year - highlighted */}
                <tr className="bg-blue-50 dark:bg-blue-900/20">
                  <td className="px-4 py-3 font-semibold text-blue-700 dark:text-blue-400">
                    {audit.year} (actuel)
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {audit.total_items}
                    <TrendIndicator
                      trend={getTrend(audit.total_items, previousYearAudit?.total_items)}
                      isPositiveGood={true}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">
                    {foundItems.length}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 font-medium">
                    {missingItems.length}
                    <TrendIndicator
                      trend={getTrend(missingItems.length, previousYearAudit?.items_manquants)}
                      isPositiveGood={false}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {audit.total_items > 0
                      ? `${Math.round((foundItems.length / audit.total_items) * 100)}%`
                      : '-'}
                  </td>
                </tr>

                {/* Previous years */}
                {previousAudits
                  .filter(a => a.statut === 'verrouille' || a.statut === 'fermee')
                  .sort((a, b) => b.year - a.year)
                  .slice(0, 5)
                  .map(prevAudit => {
                    const prevFound = prevAudit.total_items - prevAudit.items_manquants;
                    const prevRate = prevAudit.total_items > 0
                      ? Math.round((prevFound / prevAudit.total_items) * 100)
                      : 0;

                    return (
                      <tr key={prevAudit.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                        <td className="px-4 py-3 text-gray-700 dark:text-dark-text-primary">
                          {prevAudit.year}
                        </td>
                        <td className="px-4 py-3 text-right">{prevAudit.total_items}</td>
                        <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                          {prevFound}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                          {prevAudit.items_manquants}
                        </td>
                        <td className="px-4 py-3 text-right">{prevRate}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {previousYearAudit && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                <strong>Par rapport à {previousYearAudit.year}:</strong>{' '}
                {audit.total_items - previousYearAudit.total_items > 0 ? (
                  <span className="text-green-600">+{audit.total_items - previousYearAudit.total_items} articles</span>
                ) : audit.total_items - previousYearAudit.total_items < 0 ? (
                  <span className="text-red-600">{audit.total_items - previousYearAudit.total_items} articles</span>
                ) : (
                  <span>même nombre d'articles</span>
                )}
                {', '}
                {missingItems.length - previousYearAudit.items_manquants < 0 ? (
                  <span className="text-green-600">{missingItems.length - previousYearAudit.items_manquants} manquants</span>
                ) : missingItems.length - previousYearAudit.items_manquants > 0 ? (
                  <span className="text-red-600">+{missingItems.length - previousYearAudit.items_manquants} manquants</span>
                ) : (
                  <span>même nombre de manquants</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Missing Items List */}
      {missingItems.length > 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Articles Manquants ({missingItems.length})
          </h3>

          <div className="space-y-4">
            {Object.entries(missingByType).map(([type, typeItems]) => (
              <div key={type}>
                <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  {type} ({typeItems.length})
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {typeItems.map(item => (
                    <div
                      key={item.id}
                      className="px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800"
                    >
                      <span className="font-mono text-sm text-red-700 dark:text-red-400">
                        {item.code}
                      </span>
                      {item.notes && (
                        <p className="text-xs text-red-600 dark:text-red-500 mt-1 truncate">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Condition Changes */}
      {conditionChanges.length > 0 && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Changements d'état ({conditionChanges.length})
          </h3>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Avant</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Après</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {conditionChanges.map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 font-mono text-sm">{item.code}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-dark-text-secondary">{item.typeName}</td>
                    <td className="px-4 py-2">
                      <ConditionLabel condition={item.etat_initial} />
                    </td>
                    <td className="px-4 py-2">
                      <ConditionLabel condition={item.etat_final!} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Good Message */}
      {missingItems.length === 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
            Tous les articles ont été retrouvés !
          </h3>
          <p className="text-green-600 dark:text-green-500 mt-2">
            L'inventaire {audit.year} est complet.
          </p>
        </div>
      )}
    </div>
  );
}

function ConditionLabel({ condition }: { condition: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    excellent: { label: 'Excellent', color: 'text-green-600' },
    bon: { label: 'Bon', color: 'text-blue-600' },
    correct: { label: 'Correct', color: 'text-yellow-600' },
    mauvais: { label: 'Usé', color: 'text-orange-600' },
    hors_service: { label: 'Hors service', color: 'text-red-600' }
  };

  const { label, color } = labels[condition] || { label: condition, color: 'text-gray-600 dark:text-dark-text-secondary' };

  return <span className={`text-sm font-medium ${color}`}>{label}</span>;
}

function TrendIndicator({ trend, isPositiveGood }: { trend: 'up' | 'down' | 'same' | null; isPositiveGood: boolean }) {
  if (trend === null) return null;

  if (trend === 'same') {
    return <Minus className="inline h-3 w-3 ml-1 text-gray-400 dark:text-dark-text-muted" />;
  }

  // Determine if trend is good or bad
  const isGood = (trend === 'up' && isPositiveGood) || (trend === 'down' && !isPositiveGood);

  if (trend === 'up') {
    return (
      <TrendingUp className={`inline h-3 w-3 ml-1 ${isGood ? 'text-green-500' : 'text-red-500'}`} />
    );
  }

  return (
    <TrendingDown className={`inline h-3 w-3 ml-1 ${isGood ? 'text-green-500' : 'text-red-500'}`} />
  );
}

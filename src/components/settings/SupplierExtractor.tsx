import { logger } from '@/utils/logger';
/**
 * SupplierExtractor - Extraction automatique des fournisseurs depuis les transactions
 *
 * Ce composant permet de:
 * 1. Analyser toutes les transactions de dépenses
 * 2. Extraire les bénéficiaires uniques
 * 3. Filtrer les membres et fournisseurs existants
 * 4. Créer les nouveaux fournisseurs en batch
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  runExtraction,
  createSuppliers,
  ExtractionResult,
  BeneficiaryCandidate,
  CreationResult,
} from '@/services/supplierExtractorService';
import {
  Search,
  Download,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Users,
  Building2,
  CreditCard,
  Calendar,
  TrendingDown,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

interface SupplierExtractorProps {
  onClose: () => void;
  onSuppliersCreated?: () => void;
}

type SortKey = 'nom' | 'nombre_transactions' | 'montant_total';
type SortDirection = 'asc' | 'desc';

export function SupplierExtractor({ onClose, onSuppliersCreated }: SupplierExtractorProps) {
  const { appUser } = useAuth();

  // State
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creationResult, setCreationResult] = useState<CreationResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'nombre_transactions',
    direction: 'desc',
  });
  const [showExcluded, setShowExcluded] = useState(false);

  // Handlers
  const handleExtract = async () => {
    if (!appUser) return;

    setLoading(true);
    setExtractionResult(null);
    setSelectedIds(new Set());
    setCreationResult(null);

    try {
      const result = await runExtraction(appUser.clubId);
      setExtractionResult(result);

      // Par défaut, sélectionner tous les candidats valides
      const allValidIds = new Set(result.valid_candidates.map((c) => getKey(c)));
      setSelectedIds(allValidIds);

      toast.success(`${result.valid_candidates.length} fournisseurs potentiels trouvés`);
    } catch (error) {
      logger.error('Extraction error:', error);
      toast.error(error.message || 'Erreur lors de l\'extraction');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!appUser || !extractionResult) return;

    const selectedCandidates = extractionResult.valid_candidates.filter((c) =>
      selectedIds.has(getKey(c))
    );

    if (selectedCandidates.length === 0) {
      toast.error('Aucun fournisseur sélectionné');
      return;
    }

    const confirmMessage = `Créer ${selectedCandidates.length} fournisseur(s) ?`;
    if (!confirm(confirmMessage)) return;

    setCreating(true);

    try {
      const result = await createSuppliers(selectedCandidates, appUser.clubId, appUser.id);
      setCreationResult(result);

      if (result.created > 0) {
        toast.success(`${result.created} fournisseur(s) créé(s)`);
        onSuppliersCreated?.();
      }

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} erreur(s) lors de la création`);
      }
    } catch (error) {
      logger.error('Creation error:', error);
      toast.error(error.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleSelect = (candidate: BeneficiaryCandidate) => {
    const key = getKey(candidate);
    const newSelected = new Set(selectedIds);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (!extractionResult) return;
    const filtered = getFilteredCandidates();
    const allSelected = filtered.every((c) => selectedIds.has(getKey(c)));

    if (allSelected) {
      // Désélectionner tous les filtrés
      const newSelected = new Set(selectedIds);
      filtered.forEach((c) => newSelected.delete(getKey(c)));
      setSelectedIds(newSelected);
    } else {
      // Sélectionner tous les filtrés
      const newSelected = new Set(selectedIds);
      filtered.forEach((c) => newSelected.add(getKey(c)));
      setSelectedIds(newSelected);
    }
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Helpers
  const getKey = (candidate: BeneficiaryCandidate): string => {
    return candidate.iban || candidate.nom;
  };

  const getFilteredCandidates = (): BeneficiaryCandidate[] => {
    if (!extractionResult) return [];

    let candidates = [...extractionResult.valid_candidates];

    // Filtre par recherche
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      candidates = candidates.filter(
        (c) =>
          c.nom.toLowerCase().includes(search) ||
          c.iban.toLowerCase().includes(search)
      );
    }

    // Tri
    candidates.sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.key) {
        case 'nom':
          comparison = a.nom.localeCompare(b.nom);
          break;
        case 'nombre_transactions':
          comparison = a.nombre_transactions - b.nombre_transactions;
          break;
        case 'montant_total':
          comparison = a.montant_total - b.montant_total;
          break;
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return candidates;
  };

  // Using centralized formatters from src/utils/formatters.ts
  const formatMontant = (montant: number): string => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const formatIBAN = (iban: string): string => {
    return iban.replace(/(.{4})/g, '$1 ').trim();
  };

  const filteredCandidates = getFilteredCandidates();
  const allFilteredSelected = filteredCandidates.length > 0 &&
    filteredCandidates.every((c) => selectedIds.has(getKey(c)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                Extraction automatique des fournisseurs
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-1">
                Analysez les transactions pour créer automatiquement les fournisseurs manquants
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Initial state - no extraction yet */}
          {!extractionResult && !loading && (
            <div className="text-center py-12">
              <Download className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-dark-text-muted" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                Analyser les transactions
              </h3>
              <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-6 max-w-md mx-auto">
                Cliquez sur le bouton ci-dessous pour extraire tous les bénéficiaires
                des transactions de dépenses et identifier les nouveaux fournisseurs.
              </p>
              <button
                onClick={handleExtract}
                className="px-6 py-3 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 font-medium"
              >
                Lancer l'analyse
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-calypso-blue animate-spin" />
              <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Analyse des transactions en cours...
              </p>
            </div>
          )}

          {/* Results */}
          {extractionResult && !loading && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary mb-1">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-sm">Bénéficiaires</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                    {extractionResult.stats.unique_beneficiaries}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Candidats valides</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {extractionResult.stats.valid_candidates}
                  </p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Membres exclus</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                    {extractionResult.stats.excluded_members}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">Déjà existants</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {extractionResult.stats.existing_suppliers}
                  </p>
                </div>
              </div>

              {/* Invalid data warning */}
              {extractionResult.stats.invalid_data > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">
                      {extractionResult.stats.invalid_data} bénéficiaire(s) ignoré(s)
                    </span>
                  </div>
                  <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                    {extractionResult.no_iban.length} sans IBAN valide,{' '}
                    {extractionResult.no_name.length} sans nom
                  </p>
                </div>
              )}

              {/* Creation result */}
              {creationResult && (
                <div
                  className={cn(
                    'border rounded-lg p-4',
                    creationResult.success
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {creationResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <span
                      className={cn(
                        'font-medium',
                        creationResult.success
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      )}
                    >
                      {creationResult.created} fournisseur(s) créé(s)
                    </span>
                  </div>
                  {creationResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">
                        Erreurs:
                      </p>
                      <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside">
                        {creationResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>
                            {err.nom}: {err.reason}
                          </li>
                        ))}
                        {creationResult.errors.length > 5 && (
                          <li>... et {creationResult.errors.length - 5} autre(s)</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar */}
              {extractionResult.valid_candidates.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary w-64"
                      />
                    </div>
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-calypso-blue" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      {allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExtract}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Relancer
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              {filteredCandidates.length > 0 ? (
                <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 dark:border-dark-border text-calypso-blue focus:ring-calypso-blue"
                          />
                        </th>
                        <th
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                          onClick={() => handleSort('nom')}
                        >
                          <div className="flex items-center gap-1">
                            Nom
                            {sortConfig.key === 'nom' && (
                              sortConfig.direction === 'asc' ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                          IBAN
                        </th>
                        <th
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                          onClick={() => handleSort('nombre_transactions')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Tx
                            {sortConfig.key === 'nombre_transactions' && (
                              sortConfig.direction === 'asc' ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )
                            )}
                          </div>
                        </th>
                        <th
                          className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                          onClick={() => handleSort('montant_total')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Total
                            {sortConfig.key === 'montant_total' && (
                              sortConfig.direction === 'asc' ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                          Années
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                      {filteredCandidates.map((candidate) => {
                        const key = getKey(candidate);
                        const isSelected = selectedIds.has(key);
                        return (
                          <tr
                            key={key}
                            onClick={() => handleToggleSelect(candidate)}
                            className={cn(
                              'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition',
                              isSelected && 'bg-blue-50 dark:bg-blue-900/20'
                            )}
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(candidate)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-gray-300 dark:border-dark-border text-calypso-blue focus:ring-calypso-blue"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                                {candidate.nom}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-sm font-mono text-gray-600 dark:text-dark-text-secondary">
                                {formatIBAN(candidate.iban)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                                {candidate.nombre_transactions}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                {formatMontant(candidate.montant_total)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                                {candidate.source_annees.join(', ')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : extractionResult.valid_candidates.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-400" />
                  <p className="text-gray-600 dark:text-dark-text-secondary">
                    Tous les bénéficiaires sont déjà enregistrés comme membres ou fournisseurs
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <Search className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-dark-text-muted" />
                  <p className="text-gray-500 dark:text-dark-text-muted">
                    Aucun résultat pour "{searchTerm}"
                  </p>
                </div>
              )}

              {/* Excluded details toggle */}
              {(extractionResult.excluded_members.length > 0 ||
                extractionResult.existing_suppliers.length > 0) && (
                <div className="border border-gray-200 dark:border-dark-border rounded-lg">
                  <button
                    onClick={() => setShowExcluded(!showExcluded)}
                    className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                  >
                    <span>Voir les bénéficiaires exclus</span>
                    {showExcluded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {showExcluded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Members */}
                      {extractionResult.excluded_members.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2 flex items-center gap-2">
                            <Users className="w-4 h-4 text-orange-500" />
                            Membres ({extractionResult.excluded_members.length})
                          </h4>
                          <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                            {extractionResult.excluded_members.map((c) => (
                              <div
                                key={getKey(c)}
                                className="text-sm text-orange-700 dark:text-orange-400"
                              >
                                {c.nom}
                                {c.matched_member_name && (
                                  <span className="text-orange-500 dark:text-orange-500">
                                    {' '}
                                    ({c.matched_member_name})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Existing suppliers */}
                      {extractionResult.existing_suppliers.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-500" />
                            Fournisseurs existants ({extractionResult.existing_suppliers.length})
                          </h4>
                          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                            {extractionResult.existing_suppliers.map((c) => (
                              <div
                                key={getKey(c)}
                                className="text-sm text-blue-700 dark:text-blue-400"
                              >
                                {c.nom}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-dark-border flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-dark-text-muted">
            {extractionResult && selectedIds.size > 0 && (
              <span>
                {selectedIds.size} fournisseur(s) sélectionné(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
            >
              Fermer
            </button>
            {extractionResult && selectedIds.size > 0 && !creationResult && (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Créer {selectedIds.size} fournisseur(s)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

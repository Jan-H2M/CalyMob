import { logger } from '@/utils/logger';
/**
 * KnownIbansSettings - IBAN Database Management
 *
 * Permet de gérer les IBANs connus pour la catégorisation automatique.
 * Un IBAN connu = catégorisation automatique sans confirmation.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  Search,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  Loader2,
  Building2,
  Tag,
  Download,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/utils/utils';
import { useAuth } from '@/contexts/AuthContext';
import { KnownIban } from '@/types/settings.types';
import {
  collection,
  query,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { CategorizationService } from '@/services/categorizationService';

// ============================================================================
// TYPES
// ============================================================================

interface EditableIban extends Partial<KnownIban> {
  isNew?: boolean;
}

interface SuggestedIban {
  iban: string;
  name: string;
  accountCode: string;
  category: string;
  transactionCount: number;
  selected: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

function formatIban(iban: string): string {
  const normalized = normalizeIban(iban);
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}

function validateIban(iban: string): boolean {
  const normalized = normalizeIban(iban);
  // Basic validation: starts with 2 letters, followed by 2 digits, then alphanumeric
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(normalized);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function KnownIbansSettings() {
  const { user, clubId } = useAuth();

  // State
  const [ibans, setIbans] = useState<KnownIban[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingIban, setEditingIban] = useState<EditableIban | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Import from transactions state
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [suggestedIbans, setSuggestedIbans] = useState<SuggestedIban[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [importing, setImporting] = useState(false);

  // Account codes for dropdown
  const accountCodes = useMemo(() =>
    AccountCodeService.isReady()
      ? AccountCodeService.getActiveCodes()
      : calypsoAccountCodes
  , []);
  const categories = useMemo(() => CategorizationService.getAllCategories(), []);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    if (!clubId) return;
    loadIbans();
  }, [clubId]);

  async function loadIbans() {
    if (!clubId) return;

    setLoading(true);
    try {
      const ibansRef = collection(db, 'clubs', clubId, 'known_ibans');
      const q = query(ibansRef, orderBy('name', 'asc'));
      const snapshot = await getDocs(q);

      const loadedIbans: KnownIban[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as KnownIban));

      setIbans(loadedIbans);
    } catch (error) {
      logger.error('Error loading known IBANs:', error);
      toast.error('Erreur lors du chargement des IBANs');
    } finally {
      setLoading(false);
    }
  }

  // Load IBAN suggestions from transaction history
  async function loadSuggestionsFromTransactions() {
    if (!clubId) return;

    setLoadingSuggestions(true);
    try {
      // Load transactions with IBANs
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const txSnapshot = await getDocs(txRef);

      // Count IBANs and their most common code
      const ibanStats = new Map<string, {
        name: string;
        codes: Map<string, number>;
        count: number;
      }>();

      txSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const iban = data.contrepartie_iban;
        const code = data.code_comptable;
        const name = data.contrepartie_nom;

        if (iban && code && name) {
          const normalizedIban = normalizeIban(iban);

          if (!ibanStats.has(normalizedIban)) {
            ibanStats.set(normalizedIban, {
              name: name,
              codes: new Map(),
              count: 0
            });
          }

          const stat = ibanStats.get(normalizedIban)!;
          stat.count++;
          stat.codes.set(code, (stat.codes.get(code) || 0) + 1);
        }
      });

      // Filter: only IBANs with 3+ transactions and not already in known_ibans
      const existingIbans = new Set(ibans.map(i => normalizeIban(i.iban)));

      const suggestions: SuggestedIban[] = [];

      ibanStats.forEach((stat, iban) => {
        if (stat.count >= 3 && !existingIbans.has(iban)) {
          // Find most common code
          let bestCode = '';
          let bestCount = 0;
          stat.codes.forEach((count, code) => {
            if (count > bestCount) {
              bestCode = code;
              bestCount = count;
            }
          });

          // Find category from account code
          const codeObj = accountCodes.find(c => c.code === bestCode);
          const category = codeObj?.categories?.[0] || '';

          suggestions.push({
            iban,
            name: stat.name,
            accountCode: bestCode,
            category,
            transactionCount: stat.count,
            selected: true // Pre-select all
          });
        }
      });

      // Sort by transaction count (most frequent first)
      suggestions.sort((a, b) => b.transactionCount - a.transactionCount);

      setSuggestedIbans(suggestions);
      setShowImportPanel(true);

      if (suggestions.length === 0) {
        toast('Aucun IBAN fréquent trouvé (min. 3 transactions)', { icon: 'ℹ️' });
      }
    } catch (error) {
      logger.error('Error loading IBAN suggestions:', error);
      toast.error('Erreur lors de l\'analyse des transactions');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  // Import selected IBANs
  async function handleImportSelected() {
    if (!clubId || !user) return;

    const selected = suggestedIbans.filter(s => s.selected);
    if (selected.length === 0) {
      toast.error('Sélectionnez au moins un IBAN');
      return;
    }

    setImporting(true);
    try {
      let imported = 0;

      for (const suggestion of selected) {
        const docId = `iban_${suggestion.iban}`;

        const ibanData: Omit<KnownIban, 'id'> = {
          iban: suggestion.iban,
          name: suggestion.name,
          category: suggestion.category,
          accountCode: suggestion.accountCode,
          autoCategorize: true,
          transactionCount: suggestion.transactionCount,
          notes: `Importé automatiquement (${suggestion.transactionCount} transactions)`,
          createdBy: user.uid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };

        await setDoc(doc(db, 'clubs', clubId, 'known_ibans', docId), ibanData);
        imported++;
      }

      toast.success(`${imported} IBAN${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}`);
      setShowImportPanel(false);
      setSuggestedIbans([]);
      await loadIbans();
    } catch (error) {
      logger.error('Error importing IBANs:', error);
      toast.error('Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  }

  // Toggle suggestion selection
  function toggleSuggestion(iban: string) {
    setSuggestedIbans(prev =>
      prev.map(s => s.iban === iban ? { ...s, selected: !s.selected } : s)
    );
  }

  // Select/deselect all
  function toggleAllSuggestions(selected: boolean) {
    setSuggestedIbans(prev => prev.map(s => ({ ...s, selected })));
  }

  // ============================================================================
  // FILTERING
  // ============================================================================

  const filteredIbans = useMemo(() => {
    if (!searchTerm.trim()) return ibans;

    const term = searchTerm.toLowerCase();
    return ibans.filter(iban =>
      iban.name.toLowerCase().includes(term) ||
      iban.iban.toLowerCase().includes(term) ||
      iban.category?.toLowerCase().includes(term) ||
      iban.accountCode?.toLowerCase().includes(term)
    );
  }, [ibans, searchTerm]);

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  function handleAddNew() {
    setEditingIban({
      isNew: true,
      iban: '',
      name: '',
      category: '',
      accountCode: '',
      autoCategorize: true,
      transactionCount: 0,
      notes: ''
    });
  }

  function handleEdit(iban: KnownIban) {
    setEditingIban({ ...iban, isNew: false });
  }

  function handleCancelEdit() {
    setEditingIban(null);
  }

  async function handleSave() {
    if (!editingIban || !clubId || !user) return;

    // Validation
    if (!editingIban.iban || !validateIban(editingIban.iban)) {
      toast.error('IBAN invalide');
      return;
    }
    if (!editingIban.name?.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    if (!editingIban.accountCode) {
      toast.error('Le code comptable est requis');
      return;
    }

    setSaving(true);
    try {
      const normalizedIban = normalizeIban(editingIban.iban);
      const docId = editingIban.id || `iban_${normalizedIban}`;

      const ibanData: Omit<KnownIban, 'id'> = {
        iban: normalizedIban,
        name: editingIban.name.trim(),
        category: editingIban.category || '',
        accountCode: editingIban.accountCode,
        autoCategorize: editingIban.autoCategorize ?? true,
        transactionCount: editingIban.transactionCount || 0,
        notes: editingIban.notes || '',
        updatedAt: Timestamp.now(),
        createdBy: editingIban.isNew ? user.uid : (editingIban.createdBy || user.uid),
        createdAt: editingIban.isNew ? Timestamp.now() : (editingIban.createdAt || Timestamp.now())
      };

      await setDoc(doc(db, 'clubs', clubId, 'known_ibans', docId), ibanData);

      toast.success(editingIban.isNew ? 'IBAN ajouté' : 'IBAN mis à jour');
      setEditingIban(null);
      await loadIbans();
    } catch (error) {
      logger.error('Error saving IBAN:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(iban: KnownIban) {
    if (!clubId || !iban.id) return;

    if (!confirm(`Supprimer "${iban.name}" de la liste des IBANs connus ?`)) {
      return;
    }

    setDeletingId(iban.id);
    try {
      await deleteDoc(doc(db, 'clubs', clubId, 'known_ibans', iban.id));
      toast.success('IBAN supprimé');
      await loadIbans();
    } catch (error) {
      logger.error('Error deleting IBAN:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Link
              to="/parametres/automatisation"
              className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-indigo-600" />
                IBANs Connus
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-muted">
                Gérez les IBANs pour la catégorisation automatique
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info box */}
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium">Comment ça marche ?</p>
              <p className="mt-1">
                Les IBANs connus sont automatiquement catégorisés avec 100% de confiance.
                Idéal pour les paiements récurrents (assurances, fournisseurs, etc.).
              </p>
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par nom, IBAN, catégorie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-dark-text-primary dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={loadSuggestionsFromTransactions}
            disabled={loadingSuggestions}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {loadingSuggestions ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Importer depuis transactions
          </button>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            Ajouter manuellement
          </button>
        </div>

        {/* Import Panel - Suggestions from transactions */}
        {showImportPanel && suggestedIbans.length > 0 && (
          <div className="mb-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" />
                <h3 className="font-medium text-emerald-900 dark:text-emerald-100">
                  {suggestedIbans.length} IBAN{suggestedIbans.length > 1 ? 's' : ''} fréquent{suggestedIbans.length > 1 ? 's' : ''} détecté{suggestedIbans.length > 1 ? 's' : ''}
                </h3>
              </div>
              <button
                onClick={() => setShowImportPanel(false)}
                className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Select all / none */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => toggleAllSuggestions(true)}
                className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Tout sélectionner
              </button>
              <button
                onClick={() => toggleAllSuggestions(false)}
                className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Tout désélectionner
              </button>
            </div>

            {/* Suggestions list */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {suggestedIbans.map(suggestion => {
                const codeObj = accountCodes.find(c => c.code === suggestion.accountCode);
                const categoryObj = categories.find(c => c.id === suggestion.category);

                return (
                  <label
                    key={suggestion.iban}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                      suggestion.selected
                        ? "bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700"
                        : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-dark-border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={suggestion.selected}
                      onChange={() => toggleSuggestion(suggestion.iban)}
                      className="w-4 h-4 text-emerald-600 border-gray-300 dark:border-dark-border rounded focus:ring-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white truncate">
                          {suggestion.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted rounded">
                          {suggestion.transactionCount}x
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-dark-text-muted mt-0.5 flex flex-wrap gap-2">
                        <code className="font-mono">{formatIban(suggestion.iban)}</code>
                        <span>→</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {codeObj?.code || suggestion.accountCode}
                        </span>
                        {categoryObj && (
                          <span className="text-gray-400 dark:text-dark-text-muted">({categoryObj.nom})</span>
                        )}
                      </div>
                    </div>
                    {suggestion.selected && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>

            {/* Import button */}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800">
              <button
                onClick={() => setShowImportPanel(false)}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleImportSelected}
                disabled={importing || suggestedIbans.filter(s => s.selected).length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Importer ({suggestedIbans.filter(s => s.selected).length})
              </button>
            </div>
          </div>
        )}

        {/* Edit form */}
        {editingIban && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-dark-border dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-4">
              {editingIban.isNew ? 'Nouvel IBAN' : 'Modifier IBAN'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* IBAN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  IBAN *
                </label>
                <input
                  type="text"
                  value={editingIban.iban || ''}
                  onChange={(e) => setEditingIban({ ...editingIban, iban: e.target.value })}
                  placeholder="BE68 5390 0754 7034"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Nom / Bénéficiaire *
                </label>
                <input
                  type="text"
                  value={editingIban.name || ''}
                  onChange={(e) => setEditingIban({ ...editingIban, name: e.target.value })}
                  placeholder="Ethias Assurances"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Catégorie
                </label>
                <select
                  value={editingIban.category || ''}
                  onChange={(e) => setEditingIban({ ...editingIban, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Sélectionner --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nom} ({cat.type === 'depense' ? 'Dépense' : 'Revenu'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Account Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Code comptable *
                </label>
                <select
                  value={editingIban.accountCode || ''}
                  onChange={(e) => setEditingIban({ ...editingIban, accountCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Sélectionner --</option>
                  {accountCodes.map(code => (
                    <option key={code.code} value={code.code}>
                      {code.code} - {code.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Notes (optionnel)
                </label>
                <input
                  type="text"
                  value={editingIban.notes || ''}
                  onChange={(e) => setEditingIban({ ...editingIban, notes: e.target.value })}
                  placeholder="Ex: Prime annuelle, Location mensuelle..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Auto-categorize toggle */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingIban.autoCategorize ?? true}
                    onChange={(e) => setEditingIban({ ...editingIban, autoCategorize: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 dark:border-dark-border rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                    Catégoriser automatiquement (sans confirmation)
                  </span>
                </label>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-dark-border dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : filteredIbans.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                {searchTerm ? 'Aucun résultat' : 'Aucun IBAN connu'}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-muted">
                {searchTerm
                  ? 'Essayez une autre recherche'
                  : 'Ajoutez des IBANs pour la catégorisation automatique'
                }
              </p>
              {!searchTerm && (
                <button
                  onClick={handleAddNew}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un IBAN
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Bénéficiaire
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      IBAN
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Catégorie
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Auto
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredIbans.map((iban) => {
                    const category = categories.find(c => c.id === iban.category);
                    const code = accountCodes.find(c => c.code === iban.accountCode);

                    return (
                      <tr
                        key={iban.id}
                        className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
                            <div>
                              <div className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                                {iban.name}
                              </div>
                              {iban.notes && (
                                <div className="text-xs text-gray-500 dark:text-dark-text-muted">
                                  {iban.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs font-mono text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
                            {formatIban(iban.iban)}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          {category ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full"
                              style={{
                                backgroundColor: `${category.couleur}20`,
                                color: category.couleur
                              }}
                            >
                              <Tag className="h-3 w-3" />
                              {category.nom}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-dark-text-muted">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs font-mono text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
                            {iban.accountCode}
                          </code>
                          {code && (
                            <div className="text-xs text-gray-500 dark:text-dark-text-muted truncate max-w-[150px]">
                              {code.label}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {iban.autoCategorize ? (
                            <Check className="h-4 w-4 text-green-600 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-gray-400 dark:text-dark-text-muted mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
                            {iban.transactionCount || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(iban)}
                              className="p-1.5 text-gray-500 dark:text-dark-text-muted hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(iban)}
                              disabled={deletingId === iban.id}
                              className="p-1.5 text-gray-500 dark:text-dark-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                              title="Supprimer"
                            >
                              {deletingId === iban.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats footer */}
        {!loading && filteredIbans.length > 0 && (
          <div className="mt-4 text-sm text-gray-500 dark:text-dark-text-muted text-center">
            {filteredIbans.length} IBAN{filteredIbans.length > 1 ? 's' : ''} connu{filteredIbans.length > 1 ? 's' : ''}
            {searchTerm && ` (sur ${ibans.length} total)`}
          </div>
        )}
      </div>
    </div>
  );
}

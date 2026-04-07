import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import {
  FolderTree,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Search,
  Check,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Edit2,
  X,
  Calculator,
  FileSpreadsheet,
  Wallet
} from 'lucide-react';
import { BilanCode, AccountCode } from '@/types';
import {
  getBilanCodes,
  saveBilanCodes,
  resetBilanCodesToDefault,
  getChildCodes,
  getCodeDepth,
  isLeafCode
} from '@/services/bilanCodeService';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface BilanCodesConfigProps {
  onClose?: () => void;
}

export function BilanCodesConfig({ onClose }: BilanCodesConfigProps) {
  const { clubId } = useAuth();
  const [codes, setCodes] = useState<BilanCode[]>([]);
  const [allAccountCodes, setAllAccountCodes] = useState<AccountCode[]>([]);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCodeName, setEditingCodeName] = useState('');
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [codeSearchTerm, setCodeSearchTerm] = useState('');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);

  // Charger les données
  useEffect(() => {
    const loadData = async () => {
      if (!clubId) return;

      try {
        const loadedCodes = await getBilanCodes(clubId);
        setCodes(loadedCodes);
        const codes = AccountCodeService.isReady()
          ? AccountCodeService.getAllCodes()
          : calypsoAccountCodes;
        setAllAccountCodes(codes);

        // Expand root codes by default
        const rootCodes = loadedCodes.filter(c => !c.parentId);
        setExpandedCodes(new Set(rootCodes.map(c => c.id)));

        // Sélectionner le premier code par défaut
        if (loadedCodes.length > 0) {
          setSelectedCodeId(loadedCodes[0].id);
        }
      } catch (error) {
        logger.error('Erreur chargement codes de bilan:', error);
        toast.error('Erreur lors du chargement des codes de bilan');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [clubId]);

  // Code sélectionné
  const selectedCode = useMemo(() => {
    return codes.find(c => c.id === selectedCodeId) || null;
  }, [codes, selectedCodeId]);

  // Codes comptables déjà assignés à un code de bilan
  const assignedAccountCodes = useMemo(() => {
    const assigned = new Map<string, string>();
    codes.forEach(bilanCode => {
      bilanCode.accountCodes?.forEach(ac => {
        assigned.set(ac, bilanCode.id);
      });
    });
    return assigned;
  }, [codes]);

  // Codes comptables non assignés
  const unassignedCodes = useMemo(() => {
    return allAccountCodes.filter(ac => !assignedAccountCodes.has(ac.code));
  }, [allAccountCodes, assignedAccountCodes]);

  // Codes filtrés pour la vue détail
  const filteredAccountCodes = useMemo(() => {
    let filtered = allAccountCodes;

    // Filtrer par recherche
    if (codeSearchTerm) {
      const search = codeSearchTerm.toLowerCase();
      filtered = filtered.filter(ac =>
        ac.code.toLowerCase().includes(search) ||
        ac.label.toLowerCase().includes(search)
      );
    }

    // Filtrer par non assignés
    if (showOnlyUnassigned) {
      filtered = filtered.filter(ac => !assignedAccountCodes.has(ac.code));
    }

    return filtered.sort((a, b) => a.code.localeCompare(b.code));
  }, [allAccountCodes, codeSearchTerm, showOnlyUnassigned, assignedAccountCodes]);

  // Toggle expand/collapse d'un code parent
  const toggleExpand = (codeId: string) => {
    const newExpanded = new Set(expandedCodes);
    if (newExpanded.has(codeId)) {
      newExpanded.delete(codeId);
    } else {
      newExpanded.add(codeId);
    }
    setExpandedCodes(newExpanded);
  };

  // Ajouter un nouveau code
  const handleAddCode = (parentId?: string) => {
    const parent = parentId ? codes.find(c => c.id === parentId) : null;
    const siblings = parentId
      ? codes.filter(c => c.parentId === parentId)
      : codes.filter(c => !c.parentId);

    // Générer le nouveau code
    let newCodeStr: string;
    if (parentId) {
      const nextIndex = siblings.length + 1;
      newCodeStr = `${parentId}.${String(nextIndex).padStart(2, '0')}`;
    } else {
      const nextIndex = siblings.length + 1;
      newCodeStr = String(nextIndex).padStart(2, '0');
    }

    const maxOrder = Math.max(...codes.map(c => c.order), 0);

    const newCode: BilanCode = {
      id: newCodeStr,
      code: newCodeStr,
      name: 'Nouveau code',
      section: parent?.section || 'actif',
      order: maxOrder + 1,
      parentId: parentId,
      calculationType: 'manual',
      openingSource: 'manual',
      closingSource: 'manual',
      accountCodes: []
    };

    setCodes([...codes, newCode]);
    setSelectedCodeId(newCode.id);
    setEditingCodeId(newCode.id);
    setEditingCodeName('Nouveau code');
    setHasChanges(true);

    // Expand parent if exists
    if (parentId) {
      setExpandedCodes(new Set([...expandedCodes, parentId]));
    }
  };

  // Supprimer un code
  const handleDeleteCode = (codeId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Check if has children
    const children = getChildCodes(codes, codeId);
    if (children.length > 0) {
      toast.error('Impossible de supprimer un code qui a des enfants');
      return;
    }

    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce code ?')) {
      const newCodes = codes.filter(c => c.id !== codeId);
      setCodes(newCodes);
      if (selectedCodeId === codeId) {
        setSelectedCodeId(newCodes[0]?.id || null);
      }
      setHasChanges(true);
    }
  };

  // Renommer un code
  const handleSaveCodeName = () => {
    if (editingCodeId && editingCodeName.trim()) {
      setCodes(codes.map(c =>
        c.id === editingCodeId ? { ...c, name: editingCodeName.trim() } : c
      ));
      setHasChanges(true);
    }
    setEditingCodeId(null);
    setEditingCodeName('');
  };

  // Ajouter/retirer un code comptable d'un code de bilan
  const toggleAccountCode = (accountCode: string) => {
    if (!selectedCodeId) return;

    // Check if already assigned to another bilan code
    const existingAssignment = assignedAccountCodes.get(accountCode);
    if (existingAssignment && existingAssignment !== selectedCodeId) {
      toast.error(`Ce code est déjà assigné à ${codes.find(c => c.id === existingAssignment)?.name}`);
      return;
    }

    setCodes(codes.map(c => {
      if (c.id !== selectedCodeId) return c;

      const currentCodes = c.accountCodes || [];
      const hasCode = currentCodes.includes(accountCode);
      return {
        ...c,
        accountCodes: hasCode
          ? currentCodes.filter(ac => ac !== accountCode)
          : [...currentCodes, accountCode]
      };
    }));
    setHasChanges(true);
  };

  // Changer le type de calcul
  const handleChangeCalculationType = (type: BilanCode['calculationType']) => {
    if (!selectedCodeId) return;

    setCodes(codes.map(c =>
      c.id === selectedCodeId ? { ...c, calculationType: type } : c
    ));
    setHasChanges(true);
  };

  // Sauvegarder
  const handleSave = async () => {
    if (!clubId) return;

    setIsSaving(true);
    try {
      await saveBilanCodes(clubId, codes);
      setHasChanges(false);
      toast.success('Codes de bilan sauvegardés');
    } catch (error) {
      logger.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Réinitialiser aux valeurs par défaut
  const handleReset = async () => {
    if (!clubId) return;

    if (window.confirm('Êtes-vous sûr de vouloir réinitialiser aux codes par défaut ? Tous vos changements seront perdus.')) {
      try {
        const defaultCodes = await resetBilanCodesToDefault(clubId);
        setCodes(defaultCodes);
        setSelectedCodeId(defaultCodes[0]?.id || null);
        setHasChanges(false);
        toast.success('Codes réinitialisés aux valeurs par défaut');
      } catch (error) {
        logger.error('Erreur réinitialisation:', error);
        toast.error('Erreur lors de la réinitialisation');
      }
    }
  };

  // Rendu d'un code dans l'arbre
  const renderCodeItem = (code: BilanCode, depth: number = 0) => {
    const children = getChildCodes(codes, code.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedCodes.has(code.id);
    const isSelected = selectedCodeId === code.id;
    const isEditing = editingCodeId === code.id;

    return (
      <div key={code.id}>
        <div
          onClick={() => setSelectedCodeId(code.id)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-4",
            isSelected
              ? "bg-calypso-blue/10 dark:bg-calypso-blue/20 border-l-calypso-blue"
              : "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary border-l-transparent"
          )}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          {/* Expand/Collapse button */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(code.id);
              }}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* Section icon */}
          {code.section === 'actif' ? (
            <Wallet className={cn("h-4 w-4", isSelected ? "text-calypso-blue" : "text-green-500")} />
          ) : (
            <FileSpreadsheet className={cn("h-4 w-4", isSelected ? "text-calypso-blue" : "text-orange-500")} />
          )}

          {/* Code */}
          <span className="font-mono text-xs text-gray-500 dark:text-dark-text-muted w-16">
            {code.code}
          </span>

          {/* Name */}
          {isEditing ? (
            <input
              type="text"
              value={editingCodeName}
              onChange={(e) => setEditingCodeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveCodeName();
                if (e.key === 'Escape') {
                  setEditingCodeId(null);
                  setEditingCodeName('');
                }
              }}
              onBlur={handleSaveCodeName}
              className="flex-1 px-2 py-0.5 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingCodeId(code.id);
                setEditingCodeName(code.name);
              }}
            >
              {code.name}
            </span>
          )}

          {/* Calculation type badge */}
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded",
            code.calculationType === 'sum_children' && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
            code.calculationType === 'sum_transactions' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
            code.calculationType === 'manual' && "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary dark:bg-gray-800 dark:text-dark-text-muted",
            code.calculationType === 'calculated' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          )}>
            {code.calculationType === 'sum_children' && 'Σ enfants'}
            {code.calculationType === 'sum_transactions' && 'Σ trans.'}
            {code.calculationType === 'manual' && 'manuel'}
            {code.calculationType === 'calculated' && 'calc.'}
          </span>

          {/* Account codes count */}
          {code.accountCodes && code.accountCodes.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-dark-text-muted bg-gray-100 dark:bg-dark-bg-tertiary px-1.5 py-0.5 rounded">
              {code.accountCodes.length}
            </span>
          )}

          {/* Delete button */}
          {!hasChildren && (
            <button
              onClick={(e) => handleDeleteCode(code.id, e)}
              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
              title="Supprimer le code"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderCodeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
      </div>
    );
  }

  // Root codes (no parent)
  const actifRootCodes = codes.filter(c => c.section === 'actif' && !c.parentId).sort((a, b) => a.order - b.order);
  const passifRootCodes = codes.filter(c => c.section === 'passif' && !c.parentId).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Header avec actions */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Codes de Bilan
          </h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Définissez la structure hiérarchique du Bilan: codes Actif et Passif avec leurs sous-codes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Réinitialiser
          </button>
          <button
            onClick={() => handleAddCode()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter un code
          </button>
        </div>
      </div>

      {/* Layout split: Arbre à gauche, Détails à droite */}
      <div className="flex flex-col md:flex-row gap-4 h-auto md:h-[600px]">
        {/* Arbre des codes (gauche) */}
        <div className="w-2/5 flex flex-col bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          {/* ACTIF Section */}
          <div className="border-b border-gray-200 dark:border-dark-border">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-green-600" />
                <h4 className="text-sm font-medium text-green-700 dark:text-green-400">
                  ACTIF
                </h4>
              </div>
              <button
                onClick={() => handleAddCode()}
                className="text-xs text-green-600 hover:text-green-700 dark:text-green-400"
              >
                + Ajouter
              </button>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {actifRootCodes.map(code => renderCodeItem(code, 0))}
            </div>
          </div>

          {/* PASSIF Section */}
          <div className="flex-1 flex flex-col">
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-orange-600" />
                <h4 className="text-sm font-medium text-orange-700 dark:text-orange-400">
                  PASSIF
                </h4>
              </div>
              <button
                onClick={() => {
                  // Add passif code
                  const passifCodes = codes.filter(c => c.section === 'passif' && !c.parentId);
                  const nextIndex = passifCodes.length + 4; // Start after 03
                  const newCode = String(nextIndex).padStart(2, '0');
                  const maxOrder = Math.max(...codes.map(c => c.order), 0);

                  const newBilanCode: BilanCode = {
                    id: newCode,
                    code: newCode,
                    name: 'Nouveau code',
                    section: 'passif',
                    order: maxOrder + 1,
                    calculationType: 'manual',
                    openingSource: 'manual',
                    closingSource: 'manual',
                    accountCodes: []
                  };

                  setCodes([...codes, newBilanCode]);
                  setSelectedCodeId(newBilanCode.id);
                  setEditingCodeId(newBilanCode.id);
                  setEditingCodeName('Nouveau code');
                  setHasChanges(true);
                }}
                className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400"
              >
                + Ajouter
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {passifRootCodes.map(code => renderCodeItem(code, 0))}
            </div>
          </div>

          {/* Indicateur codes non assignés */}
          {unassignedCodes.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {unassignedCodes.length} codes comptables non assignés
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Détail du code (droite) */}
        <div className="flex-1 flex flex-col bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          {selectedCode ? (
            <>
              {/* Header du code sélectionné */}
              <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calculator className="h-5 w-5 text-calypso-blue" />
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {selectedCode.code} - {selectedCode.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        {selectedCode.section === 'actif' ? 'Actif' : 'Passif'} •{' '}
                        {selectedCode.accountCodes?.length || 0} codes comptables liés
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingCodeId(selectedCode.id);
                        setEditingCodeName(selectedCode.name);
                      }}
                      className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-calypso-blue transition-colors"
                      title="Renommer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {selectedCode.parentId && (
                      <button
                        onClick={() => handleAddCode(selectedCode.id)}
                        className="text-xs text-calypso-blue hover:underline"
                      >
                        + Sous-code
                      </button>
                    )}
                  </div>
                </div>

                {/* Type de calcul */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-dark-text-muted">Type de calcul:</span>
                  <select
                    value={selectedCode.calculationType}
                    onChange={(e) => handleChangeCalculationType(e.target.value as BilanCode['calculationType'])}
                    className="text-xs border border-gray-300 dark:border-dark-border rounded px-2 py-1 bg-white dark:bg-dark-bg-tertiary"
                  >
                    <option value="manual">Manuel</option>
                    <option value="sum_transactions">Somme des transactions</option>
                    <option value="sum_children">Somme des enfants</option>
                    <option value="calculated">Calculé (spécial)</option>
                  </select>
                </div>
              </div>

              {/* Codes comptables (seulement pour sum_transactions) */}
              {selectedCode.calculationType === 'sum_transactions' && (
                <>
                  <div className="p-3 border-b border-gray-200 dark:border-dark-border space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                      <input
                        type="text"
                        placeholder="Rechercher un code comptable..."
                        value={codeSearchTerm}
                        onChange={(e) => setCodeSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-dark-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showOnlyUnassigned}
                          onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
                          className="rounded border-gray-300 dark:border-dark-border text-calypso-blue focus:ring-calypso-blue"
                        />
                        Afficher uniquement les non assignés
                      </label>
                      <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                        {filteredAccountCodes.length} codes affichés
                      </span>
                    </div>
                  </div>

                  {/* Liste des codes comptables */}
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-dark-bg-tertiary sticky top-0">
                        <tr>
                          <th className="w-10 px-3 py-2"></th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                            Code
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                            Description
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase w-32">
                            Assigné à
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                        {filteredAccountCodes.map((ac) => {
                          const isInSelected = selectedCode.accountCodes?.includes(ac.code) || false;
                          const assignedTo = assignedAccountCodes.get(ac.code);
                          const isInOther = assignedTo && assignedTo !== selectedCodeId;

                          return (
                            <tr
                              key={ac.code}
                              onClick={() => !isInOther && toggleAccountCode(ac.code)}
                              className={cn(
                                "transition-colors",
                                isInSelected
                                  ? "bg-calypso-blue/5 dark:bg-calypso-blue/10"
                                  : isInOther
                                    ? "bg-gray-50 dark:bg-dark-bg-tertiary opacity-60 cursor-not-allowed"
                                    : "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary cursor-pointer"
                              )}
                            >
                              <td className="px-3 py-2">
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                    isInSelected
                                      ? "bg-calypso-blue border-calypso-blue"
                                      : isInOther
                                        ? "bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-dark-border dark:border-gray-500"
                                        : "border-gray-300 dark:border-dark-border hover:border-calypso-blue"
                                  )}
                                >
                                  {isInSelected && <Check className="h-3 w-3 text-white" />}
                                  {isInOther && <X className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className={cn(
                                  "font-mono text-sm",
                                  isInSelected
                                    ? "text-calypso-blue font-medium"
                                    : "text-gray-700 dark:text-dark-text-primary"
                                )}>
                                  {ac.code}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                                  {ac.label}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {assignedTo && (
                                  <span className={cn(
                                    "text-xs px-2 py-0.5 rounded",
                                    isInSelected
                                      ? "bg-calypso-blue/20 text-calypso-blue"
                                      : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted"
                                  )}>
                                    {codes.find(c => c.id === assignedTo)?.code}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {filteredAccountCodes.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-dark-text-muted">
                        <Search className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm">Aucun code trouvé</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Message pour autres types de calcul */}
              {selectedCode.calculationType !== 'sum_transactions' && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-dark-text-muted p-8">
                  {selectedCode.calculationType === 'sum_children' && (
                    <>
                      <FolderTree className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm text-center">
                        Ce code est calculé comme la somme de ses enfants.<br />
                        Ajoutez des sous-codes pour le remplir.
                      </p>
                      <button
                        onClick={() => handleAddCode(selectedCode.id)}
                        className="mt-4 text-sm text-calypso-blue hover:underline"
                      >
                        + Ajouter un sous-code
                      </button>
                    </>
                  )}
                  {selectedCode.calculationType === 'manual' && (
                    <>
                      <Edit2 className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm text-center">
                        Ce code nécessite une saisie manuelle.<br />
                        Les valeurs seront saisies lors de l'export du bilan.
                      </p>
                    </>
                  )}
                  {selectedCode.calculationType === 'calculated' && (
                    <>
                      <Calculator className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm text-center">
                        Ce code utilise un calcul spécial.<br />
                        (ex: Résultat de l'exercice = Total P&L)
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-dark-text-muted">
              <FolderTree className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Sélectionnez un code pour voir ses détails</p>
            </div>
          )}
        </div>
      </div>

      {/* Barre de sauvegarde flottante */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg z-50">
          <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
            Modifications non sauvegardées
          </span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import {
  FolderOpen,
  Plus,
  Trash2,
  GripVertical,
  RotateCcw,
  Save,
  X,
  Search,
  Check,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { ReportGroup, AccountCode } from '@/types';
import { getReportGroups, saveReportGroups, resetReportGroupsToDefault } from '@/services/reportGroupService';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface ReportGroupsConfigProps {
  onClose?: () => void;
}

export function ReportGroupsConfig({ onClose }: ReportGroupsConfigProps) {
  const { clubId } = useAuth();
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [allAccountCodes, setAllAccountCodes] = useState<AccountCode[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [codeSearchTerm, setCodeSearchTerm] = useState('');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);

  // Charger les données
  useEffect(() => {
    const loadData = async () => {
      if (!clubId) return;

      try {
        const loadedGroups = await getReportGroups(clubId);
        setGroups(loadedGroups);
        const codes = AccountCodeService.isReady()
          ? AccountCodeService.getAllCodes()
          : calypsoAccountCodes;
        setAllAccountCodes(codes);
        // Sélectionner le premier groupe par défaut
        if (loadedGroups.length > 0) {
          setSelectedGroupId(loadedGroups[0].id);
        }
      } catch (error) {
        logger.error('Erreur chargement groupes:', error);
        toast.error('Erreur lors du chargement des groupes');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [clubId]);

  // Groupe sélectionné
  const selectedGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  // Codes non assignés
  const unassignedCodes = useMemo(() => {
    const assignedCodes = new Set(groups.flatMap(g => g.accountCodes));
    return allAccountCodes.filter(ac => !assignedCodes.has(ac.code));
  }, [groups, allAccountCodes]);

  // Codes filtrés pour la vue détail
  const filteredCodes = useMemo(() => {
    let codes = allAccountCodes;

    // Filtrer par recherche
    if (codeSearchTerm) {
      const search = codeSearchTerm.toLowerCase();
      codes = codes.filter(ac =>
        ac.code.toLowerCase().includes(search) ||
        ac.label.toLowerCase().includes(search)
      );
    }

    // Filtrer par non assignés
    if (showOnlyUnassigned) {
      const assignedCodes = new Set(groups.flatMap(g => g.accountCodes));
      codes = codes.filter(ac => !assignedCodes.has(ac.code));
    }

    return codes.sort((a, b) => a.code.localeCompare(b.code));
  }, [allAccountCodes, codeSearchTerm, showOnlyUnassigned, groups]);

  // Ajouter un nouveau groupe
  const handleAddGroup = () => {
    const newId = `group_${Date.now()}`;
    const newGroup: ReportGroup = {
      id: newId,
      name: 'Nouveau groupe',
      order: groups.length + 1,
      accountCodes: []
    };
    setGroups([...groups, newGroup]);
    setSelectedGroupId(newId);
    setEditingGroupId(newId);
    setEditingGroupName('Nouveau groupe');
    setHasChanges(true);
  };

  // Supprimer un groupe
  const handleDeleteGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) {
      const newGroups = groups.filter(g => g.id !== groupId);
      setGroups(newGroups);
      if (selectedGroupId === groupId) {
        setSelectedGroupId(newGroups[0]?.id || null);
      }
      setHasChanges(true);
    }
  };

  // Renommer un groupe
  const handleSaveGroupName = () => {
    if (editingGroupId && editingGroupName.trim()) {
      setGroups(groups.map(g =>
        g.id === editingGroupId ? { ...g, name: editingGroupName.trim() } : g
      ));
      setHasChanges(true);
    }
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  // Ajouter/retirer un code comptable d'un groupe
  const toggleAccountCode = (code: string) => {
    if (!selectedGroupId) return;

    setGroups(groups.map(g => {
      if (g.id !== selectedGroupId) return g;

      const hasCode = g.accountCodes.includes(code);
      return {
        ...g,
        accountCodes: hasCode
          ? g.accountCodes.filter(c => c !== code)
          : [...g.accountCodes, code]
      };
    }));
    setHasChanges(true);
  };

  // Vérifier si un code est dans le groupe sélectionné
  const isCodeInSelectedGroup = (code: string) => {
    return selectedGroup?.accountCodes.includes(code) || false;
  };

  // Vérifier si un code est dans un autre groupe
  const getCodeGroup = (code: string) => {
    return groups.find(g => g.accountCodes.includes(code));
  };

  // Drag & Drop pour réordonner les groupes
  const handleDragStart = (e: React.DragEvent, groupId: string) => {
    setDraggedGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    if (!draggedGroupId || draggedGroupId === targetGroupId) return;

    const draggedIndex = groups.findIndex(g => g.id === draggedGroupId);
    const targetIndex = groups.findIndex(g => g.id === targetGroupId);

    const newGroups = [...groups];
    const [draggedGroup] = newGroups.splice(draggedIndex, 1);
    newGroups.splice(targetIndex, 0, draggedGroup);

    const reorderedGroups = newGroups.map((g, index) => ({ ...g, order: index + 1 }));
    setGroups(reorderedGroups);
    setDraggedGroupId(null);
    setHasChanges(true);
  };

  // Sauvegarder
  const handleSave = async () => {
    if (!clubId) return;

    setIsSaving(true);
    try {
      await saveReportGroups(clubId, groups);
      setHasChanges(false);
      toast.success('Groupes de rapport sauvegardés');
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

    if (window.confirm('Êtes-vous sûr de vouloir réinitialiser aux groupes par défaut ? Tous vos changements seront perdus.')) {
      try {
        const defaultGroups = await resetReportGroupsToDefault(clubId);
        setGroups(defaultGroups);
        setSelectedGroupId(defaultGroups[0]?.id || null);
        setHasChanges(false);
        toast.success('Groupes réinitialisés aux valeurs par défaut');
      } catch (error) {
        logger.error('Erreur réinitialisation:', error);
        toast.error('Erreur lors de la réinitialisation');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header avec actions */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Groupes de Rapport
          </h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Définissez les groupes du Compte de Résultats (P&L) pour organiser les revenus et dépenses dans les rapports
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
            onClick={handleAddGroup}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter un groupe
          </button>
        </div>
      </div>

      {/* Layout split: Liste groupes à gauche, Détails à droite */}
      <div className="flex flex-col md:flex-row gap-4 h-auto md:h-[600px]">
        {/* Liste des groupes (gauche) */}
        <div className="w-1/3 flex flex-col bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
            <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              Groupes ({groups.length})
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto">
            {groups
              .sort((a, b) => a.order - b.order)
              .map((group) => (
                <div
                  key={group.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, group.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, group.id)}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-3 border-b border-gray-100 dark:border-dark-border cursor-pointer transition-colors",
                    selectedGroupId === group.id
                      ? "bg-calypso-blue/10 dark:bg-calypso-blue/20 border-l-4 border-l-calypso-blue"
                      : "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary border-l-4 border-l-transparent",
                    draggedGroupId === group.id && "opacity-50"
                  )}
                >
                  <div className="cursor-grab text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300">
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <FolderOpen className={cn(
                    "h-4 w-4 flex-shrink-0",
                    selectedGroupId === group.id ? "text-calypso-blue" : "text-gray-400 dark:text-dark-text-muted"
                  )} />

                  {editingGroupId === group.id ? (
                    <input
                      type="text"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveGroupName();
                        if (e.key === 'Escape') {
                          setEditingGroupId(null);
                          setEditingGroupName('');
                        }
                      }}
                      onBlur={handleSaveGroupName}
                      className="flex-1 px-2 py-0.5 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingGroupId(group.id);
                        setEditingGroupName(group.name);
                      }}
                    >
                      {group.name}
                    </span>
                  )}

                  <span className="text-xs text-gray-500 dark:text-dark-text-muted bg-gray-100 dark:bg-dark-bg-tertiary px-1.5 py-0.5 rounded">
                    {group.accountCodes.length}
                  </span>

                  <button
                    onClick={(e) => handleDeleteGroup(group.id, e)}
                    className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Supprimer le groupe"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <ChevronRight className={cn(
                    "h-4 w-4 text-gray-400 dark:text-dark-text-muted transition-transform",
                    selectedGroupId === group.id && "text-calypso-blue"
                  )} />
                </div>
              ))}
          </div>

          {/* Indicateur codes non assignés */}
          {unassignedCodes.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {unassignedCodes.length} codes non assignés
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Détail du groupe (droite) */}
        <div className="flex-1 flex flex-col bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          {selectedGroup ? (
            <>
              {/* Header du groupe sélectionné */}
              <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-calypso-blue" />
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {selectedGroup.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        {selectedGroup.accountCodes.length} codes comptables
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingGroupId(selectedGroup.id);
                      setEditingGroupName(selectedGroup.name);
                    }}
                    className="text-xs text-calypso-blue hover:underline"
                  >
                    Renommer
                  </button>
                </div>
              </div>

              {/* Filtres et recherche */}
              <div className="p-3 border-b border-gray-200 dark:border-dark-border space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher un code ou une description..."
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
                    {filteredCodes.length} codes affichés
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
                        Groupe
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                    {filteredCodes.map((ac) => {
                      const isInSelected = isCodeInSelectedGroup(ac.code);
                      const codeGroup = getCodeGroup(ac.code);
                      const isInOtherGroup = codeGroup && codeGroup.id !== selectedGroupId;

                      return (
                        <tr
                          key={ac.code}
                          onClick={() => !isInOtherGroup && toggleAccountCode(ac.code)}
                          className={cn(
                            "transition-colors",
                            isInSelected
                              ? "bg-calypso-blue/5 dark:bg-calypso-blue/10"
                              : isInOtherGroup
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
                                  : isInOtherGroup
                                    ? "bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-dark-border dark:border-gray-500"
                                    : "border-gray-300 dark:border-dark-border hover:border-calypso-blue"
                              )}
                            >
                              {isInSelected && <Check className="h-3 w-3 text-white" />}
                              {isInOtherGroup && <X className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />}
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
                            {codeGroup && (
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded",
                                isInSelected
                                  ? "bg-calypso-blue/20 text-calypso-blue"
                                  : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted"
                              )}>
                                {codeGroup.name}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredCodes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-dark-text-muted">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Aucun code trouvé</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-dark-text-muted">
              <FolderOpen className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Sélectionnez un groupe pour voir ses codes</p>
              <button
                onClick={handleAddGroup}
                className="mt-4 text-sm text-calypso-blue hover:underline"
              >
                Ou créez un nouveau groupe
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barre de sauvegarde flottante */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg">
          <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
            Modifications non sauvegardées
          </span>
          <button
            onClick={() => {
              // Recharger
              window.location.reload();
            }}
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

import React, { useState, useEffect } from 'react';
import { X, Search, Users, Check, ChevronUp, ChevronDown, Euro, UserPlus, ChevronRight } from 'lucide-react';
import { Membre, Operation } from '../../types';
import { getMembres } from '../../services/membreService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn, formatMontant } from '../../utils/utils';
import { computeRegistrationPrice } from '../../utils/tariffUtils';
import { getValueList } from '../../services/valueListService';
import type { ValueList } from '../../types/valueList.types';
import { FonctionBadge } from './FonctionBadge';
import { logger } from '@/utils/logger';

export interface MemberWithFonction {
  memberId: string;
  fonction: string;
}

export interface GuestData {
  prenom: string;
  nom: string;
  prix: number;
}

interface MemberSelectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMembers: (membersWithFonction: MemberWithFonction[]) => Promise<void>;
  existingParticipantIds: string[];
  eventName?: string;
  operation?: Operation; // Pour calculer les prix
  onAddGuest?: (guest: GuestData) => Promise<void>; // Optional callback for adding guests
}

export const MemberSelectionPanel: React.FC<MemberSelectionPanelProps> = ({
  isOpen,
  onClose,
  onSelectMembers,
  existingParticipantIds,
  eventName,
  operation,
  onAddGuest
}) => {
  const { clubId } = useAuth();
  const [members, setMembers] = useState<Membre[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Membre[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [valueList, setValueList] = useState<ValueList | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<'prenom' | 'nom'>('prenom');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Guest form state
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [guestPrenom, setGuestPrenom] = useState('');
  const [guestNom, setGuestNom] = useState('');
  const [guestPrix, setGuestPrix] = useState('');
  const [savingGuest, setSavingGuest] = useState(false);

  // Load value list when component mounts or clubId changes
  useEffect(() => {
    if (!clubId) return;

    async function loadFonctionList() {
      try {
        const list = await getValueList(clubId, 'fonction');
        setValueList(list);
      } catch (error) {
        logger.error('Error loading fonction value list:', error);
      }
    }

    loadFonctionList();
  }, [clubId]);

  // Reset when panel opens
  useEffect(() => {
    if (!isOpen) return;

    setSelectedIds(new Set());
    setSearchTerm('');
    // Reset guest form
    setIsGuestFormOpen(false);
    setGuestPrenom('');
    setGuestNom('');
    setGuestPrix('');
  }, [isOpen]);

  // Load members when panel opens
  useEffect(() => {
    if (isOpen && clubId) {
      loadMembers();
    }
  }, [isOpen, clubId]);

  // Filter and sort members based on search and sort settings
  useEffect(() => {
    let filtered = members;

    // Apply search filter
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filtered = members.filter(member => {
        const fullName = `${member.prenom} ${member.nom}`.toLowerCase();
        const email = member.email?.toLowerCase() || '';
        const telephone = member.telephone?.toLowerCase() || '';
        return fullName.includes(term) || email.includes(term) || telephone.includes(term);
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      const aValue = (a[sortBy] || '').toLowerCase();
      const bValue = (b[sortBy] || '').toLowerCase();

      if (sortOrder === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });

    setFilteredMembers(sorted);
  }, [searchTerm, members, sortBy, sortOrder]);

  const loadMembers = async () => {
    if (!clubId) return;

    setIsLoading(true);
    try {
      const allMembers = await getMembres(clubId);
      // Filter out members already participating
      const availableMembers = allMembers.filter(
        member => !existingParticipantIds.includes(member.id)
      );
      setMembers(availableMembers);
      setFilteredMembers(availableMembers);
    } catch (error) {
      logger.error('Error loading members:', error);
      toast.error('Erreur lors du chargement des membres');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (column: 'prenom' | 'nom') => {
    if (sortBy === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const toggleSelection = (memberId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredMembers.map(m => m.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      toast.error('Veuillez sélectionner au moins un membre');
      return;
    }

    // Build array of members with their fonction from clubStatuten
    const membersWithFonction: MemberWithFonction[] = Array.from(selectedIds).map(memberId => {
      const member = members.find(m => m.id === memberId);

      // Déterminer la fonction prioritaire depuis clubStatuten
      let fonction = 'membre';
      if (member?.clubStatuten && Array.isArray(member.clubStatuten)) {
        if (member.clubStatuten.includes('Encadrants')) {
          fonction = 'encadrant';
        } else if (member.clubStatuten.includes('CA')) {
          fonction = 'ca';
        } else if (member.clubStatuten.includes('Accueil')) {
          fonction = 'accueil';
        } else if (member.clubStatuten.includes('Membre')) {
          fonction = 'membre';
        }
      }

      return {
        memberId,
        fonction
      };
    });

    setSaving(true);
    try {
      await onSelectMembers(membersWithFonction);
      toast.success(`${selectedIds.size} membre${selectedIds.size > 1 ? 's' : ''} ajouté${selectedIds.size > 1 ? 's' : ''}`);
      onClose();
    } catch (error) {
      logger.error('Error adding members:', error);
      toast.error('Erreur lors de l\'ajout des membres');
    } finally {
      setSaving(false);
    }
  };

  // Handle adding a guest
  const handleAddGuest = async () => {
    if (!onAddGuest) return;

    const trimmedPrenom = guestPrenom.trim();
    const trimmedNom = guestNom.trim();
    const parsedPrix = parseFloat(guestPrix.replace(',', '.'));

    if (!trimmedPrenom) {
      toast.error('Veuillez saisir le prénom');
      return;
    }
    if (!trimmedNom) {
      toast.error('Veuillez saisir le nom');
      return;
    }
    if (isNaN(parsedPrix) || parsedPrix < 0) {
      toast.error('Veuillez saisir un prix valide');
      return;
    }

    setSavingGuest(true);
    try {
      await onAddGuest({
        prenom: trimmedPrenom,
        nom: trimmedNom,
        prix: parsedPrix
      });
      toast.success(`Invité ${trimmedPrenom} ${trimmedNom} ajouté`);
      // Reset form
      setGuestPrenom('');
      setGuestNom('');
      setGuestPrix('');
      setIsGuestFormOpen(false);
      onClose();
    } catch (error) {
      logger.error('Error adding guest:', error);
      toast.error('Erreur lors de l\'ajout de l\'invité');
    } finally {
      setSavingGuest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/50"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed inset-y-0 left-0 z-[160] w-full max-w-2xl bg-white dark:bg-dark-bg-primary shadow-2xl flex flex-col animate-slide-in-left">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-blue-100" />
              <div>
                <h2 className="text-xl font-semibold">Ajouter des participants</h2>
                {eventName && (
                  <p className="text-sm text-blue-100 mt-1">{eventName}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-blue-200" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par nom, email ou téléphone..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/15 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Guest Form (collapsible) - only show if onAddGuest callback is provided */}
        {onAddGuest && (
          <div className="border-b border-gray-200 dark:border-dark-border">
            <button
              onClick={() => setIsGuestFormOpen(!isGuestFormOpen)}
              className="w-full px-6 py-3 flex items-center justify-between bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-orange-600" />
                <span className="font-medium text-orange-700 dark:text-orange-400">Ajouter un invité</span>
              </div>
              <ChevronRight className={cn(
                "h-5 w-5 text-orange-600 transition-transform",
                isGuestFormOpen && "rotate-90"
              )} />
            </button>

            {isGuestFormOpen && (
              <div className="px-6 py-4 bg-orange-50/50 dark:bg-orange-900/10 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Prénom *
                    </label>
                    <input
                      type="text"
                      value={guestPrenom}
                      onChange={(e) => setGuestPrenom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-tertiary focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="Prénom"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Nom *
                    </label>
                    <input
                      type="text"
                      value={guestNom}
                      onChange={(e) => setGuestNom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-tertiary focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="Nom"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Prix *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={guestPrix}
                        onChange={(e) => setGuestPrix(e.target.value)}
                        className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-tertiary focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="0.00"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted">€</span>
                    </div>
                  </div>
                  <button
                    onClick={handleAddGuest}
                    disabled={savingGuest || !guestPrenom.trim() || !guestNom.trim() || !guestPrix.trim()}
                    className={cn(
                      "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
                      savingGuest || !guestPrenom.trim() || !guestNom.trim() || !guestPrix.trim()
                        ? "bg-gray-300 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                        : "bg-orange-600 text-white hover:bg-orange-700"
                    )}
                  >
                    {savingGuest ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Ajout...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Ajouter l'invité
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
              {selectedIds.size > 0 ? (
                <span className="font-medium text-blue-600">
                  {selectedIds.size} membre{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
                </span>
              ) : (
                <span>{filteredMembers.length} membre{filteredMembers.length > 1 ? 's' : ''} disponible{filteredMembers.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex gap-3">
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-sm text-gray-600 dark:text-dark-text-secondary hover:text-gray-800 dark:hover:text-dark-text-primary underline"
                >
                  Tout désélectionner
                </button>
              )}
              <button
                onClick={selectAll}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
                disabled={filteredMembers.length === 0}
              >
                Tout sélectionner
              </button>
            </div>
          </div>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucun membre trouvé</p>
              <p className="text-sm mt-1">
                {searchTerm ? 'Essayez d\'ajuster votre recherche' : 'Tous les membres sont déjà inscrits'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary sticky top-0 z-10 border-b border-gray-200 dark:border-dark-border">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <div className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center mx-auto cursor-pointer transition-colors",
                      selectedIds.size === filteredMembers.length && filteredMembers.length > 0
                        ? "border-blue-500 bg-blue-600"
                        : "border-gray-300 dark:border-dark-border"
                    )}
                      onClick={selectedIds.size === filteredMembers.length ? clearSelection : selectAll}
                    >
                      {selectedIds.size === filteredMembers.length && filteredMembers.length > 0 && (
                        <Check className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-dark-text-primary cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                    onClick={() => handleSort('prenom')}
                  >
                    <div className="flex items-center gap-2">
                      <span>Prénom</span>
                      {sortBy === 'prenom' && (
                        sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-dark-text-primary cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                    onClick={() => handleSort('nom')}
                  >
                    <div className="flex items-center gap-2">
                      <span>Nom</span>
                      {sortBy === 'nom' && (
                        sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-dark-text-primary">
                    Fonction
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-dark-text-primary">
                    Prix
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {filteredMembers.map((member) => {
                  const isSelected = selectedIds.has(member.id);

                  // Déterminer la fonction prioritaire depuis clubStatuten
                  // Priorité: Encadrants > CA > Membre
                  let fonction = 'membre';
                  if (member.clubStatuten && Array.isArray(member.clubStatuten)) {
                    if (member.clubStatuten.includes('Encadrants')) {
                      fonction = 'encadrant';
                    } else if (member.clubStatuten.includes('CA')) {
                      fonction = 'ca';
                    } else if (member.clubStatuten.includes('Membre')) {
                      fonction = 'membre';
                    }
                  }

                  const price = operation ? computeRegistrationPrice(operation, fonction) : 0;

                  // Get fonction color from value list
                  const fonctionItem = valueList?.items.find(item => item.value === fonction);
                  const fonctionColor = fonctionItem?.color;

                  return (
                    <tr
                      key={member.id}
                      className={cn(
                        "transition-colors",
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div
                          onClick={() => toggleSelection(member.id)}
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center mx-auto transition-colors cursor-pointer",
                            isSelected
                              ? "border-blue-500 bg-blue-600"
                              : "border-gray-300 dark:border-dark-border"
                          )}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                      </td>
                      <td
                        onClick={() => toggleSelection(member.id)}
                        className="px-4 py-2.5 text-gray-900 dark:text-dark-text-primary cursor-pointer"
                      >
                        {member.prenom}
                      </td>
                      <td
                        onClick={() => toggleSelection(member.id)}
                        className="px-4 py-2.5 text-gray-900 dark:text-dark-text-primary cursor-pointer"
                      >
                        {member.nom}
                      </td>
                      <td className="px-4 py-2.5">
                        {fonction !== 'membre' && (
                          <FonctionBadge
                            fonction={fonction}
                            color={fonctionColor}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-dark-text-primary">
                        <div className="flex items-center gap-1">
                          <Euro className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
                          <span className="font-medium">{formatMontant(price)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary p-6">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={selectedIds.size === 0 || saving}
              className={cn(
                "px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
                selectedIds.size === 0 || saving
                  ? "bg-gray-300 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Ajout en cours...
                </>
              ) : (
                <>
                  Ajouter {selectedIds.size > 0 && `(${selectedIds.size})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

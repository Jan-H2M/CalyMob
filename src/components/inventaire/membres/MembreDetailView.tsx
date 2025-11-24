import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Award, Calendar, Trash2 } from 'lucide-react';
import { getMembreById, createMembre, updateMembre, deleteMembre } from '@/services/membreService';
import { Membre, MemberStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { cn } from '@/utils/utils';

interface Props {
  member: Membre;
  isCreateMode: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function MembreDetailView({ member, isCreateMode, onClose, onSave }: Props) {
  const { clubId } = useAuth();
  const [formData, setFormData] = useState<Partial<Membre>>({
    nom: member.nom || '',
    prenom: member.prenom || '',
    email: member.email || '',
    telephone: member.telephone || '',
    niveau_plongee: member.niveau_plongee || '',
    lifras_id: member.lifras_id || '',
    date_adhesion: member.date_adhesion,
    member_status: member.member_status || 'active'
  });
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  useEffect(() => {
    if (!isCreateMode && member.id) {
      loadMemberData();
    }
  }, [member.id, isCreateMode]);

  const loadMemberData = async () => {
    if (!clubId || !member.id) return;

    try {
      // TODO: Implement getMemberStats, getMemberLoans, getMemberSales in membreService
      // For now, just skip loading stats/loans/sales
      console.log('Stats/loans/sales loading not yet implemented in membreService');
    } catch (error) {
      console.error('Erreur chargement données membre:', error);
    }
  };

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !clubId || !member.id) return;

    try {
      // Validation
      if (field === 'nom' && (!value || !value.trim())) {
        toast.error('Le nom est obligatoire');
        return;
      }
      if (field === 'prenom' && (!value || !value.trim())) {
        toast.error('Le prénom est obligatoire');
        return;
      }
      if (field === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value || !emailRegex.test(value)) {
          toast.error('Email invalide');
          return;
        }
      }

      await updateMembre(clubId, member.id, { [field]: value });
      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleCreate = async () => {
    if (!clubId) return;

    // Validation
    if (!formData.nom || !formData.prenom || !formData.email) {
      toast.error('Nom, prénom et email sont obligatoires');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Email invalide');
      return;
    }

    setSaving(true);

    try {
      await createMembre(clubId, {
        nom: formData.nom!,
        prenom: formData.prenom!,
        email: formData.email!,
        telephone: formData.telephone,
        niveau_plongee: formData.niveau_plongee,
        lifras_id: formData.lifras_id,
        date_adhesion: formData.date_adhesion,
        member_status: formData.member_status || 'active',
        has_app_access: false,
        is_diver: true,
        has_lifras: !!formData.lifras_id
      });
      toast.success('Membre créé');
      onSave();
    } catch (error: any) {
      console.error('Erreur sauvegarde membre:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!clubId || !member.id) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir désactiver le membre "${member.nom} ${member.prenom}" ?\n\n` +
      `Le membre sera marqué comme inactif mais ses données seront conservées.`
    );

    if (!confirmed) return;

    try {
      await deleteMembre(clubId, member.id);
      toast.success('Membre désactivé');
      onSave();
    } catch (error: any) {
      console.error('Erreur suppression membre:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      const date = new Date(dateStr);
      setFormData({ ...formData, date_adhesion: Timestamp.fromDate(date) });
    } else {
      setFormData({ ...formData, date_adhesion: undefined });
    }
  };

  const handleDateBlur = () => {
    if (!isCreateMode && formData.date_adhesion) {
      handleFieldSave('date_adhesion', formData.date_adhesion);
    }
  };

  const handleStatutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatut = e.target.value as MemberStatus;
    setFormData({ ...formData, member_status: newStatut });
    if (!isCreateMode) {
      handleFieldSave('member_status', newStatut);
    }
  };

  const dateValue = formData.date_adhesion
    ? new Date(formData.date_adhesion.toDate()).toISOString().split('T')[0]
    : '';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50",
        "transform transition-transform duration-300 ease-in-out flex flex-col"
      )}>
        {/* Compact Header */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  {isCreateMode ? 'Nouveau membre' : `${member.nom} ${member.prenom}`}
                </h2>
                {!isCreateMode && member.date_adhesion && (() => {
                  const oneYearAgo = new Date();
                  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                  const isDebutant = member.date_adhesion > oneYearAgo;
                  return isDebutant && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">Débutant (&lt;1 an d'ancienneté)</p>
                  );
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isCreateMode && member.member_status === 'active' && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  title="Désactiver le membre"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Désactiver</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-md transition-colors"
                title="Fermer"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Informations personnelles */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">
                Informations personnelles
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Nom *
                  </label>
                  <input
                    type="text"
                    value={formData.nom || ''}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    onBlur={() => handleFieldSave('nom', formData.nom)}
                    disabled={isCreateMode}
                    placeholder="Dupont"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Prénom *
                  </label>
                  <input
                    type="text"
                    value={formData.prenom || ''}
                    onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                    onBlur={() => handleFieldSave('prenom', formData.prenom)}
                    disabled={isCreateMode}
                    placeholder="Jean"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      onBlur={() => handleFieldSave('email', formData.email)}
                      disabled={isCreateMode}
                      placeholder="jean.dupont@example.com"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Téléphone
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.telephone || ''}
                      onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                      onBlur={() => handleFieldSave('telephone', formData.telephone)}
                      disabled={isCreateMode}
                      placeholder="+32 123 45 67 89"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Niveau de plongée
                  </label>
                  <div className="relative">
                    <Award className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.niveau_plongee || ''}
                      onChange={(e) => setFormData({ ...formData, niveau_plongee: e.target.value })}
                      onBlur={() => handleFieldSave('niveau_plongee', formData.niveau_plongee)}
                      disabled={isCreateMode}
                      placeholder="P1, P2, P3, Moniteur..."
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    LifrasID
                  </label>
                  <input
                    type="text"
                    value={formData.lifras_id || ''}
                    onChange={(e) => setFormData({ ...formData, lifras_id: e.target.value })}
                    onBlur={() => handleFieldSave('lifras_id', formData.lifras_id)}
                    disabled={isCreateMode}
                    placeholder="12345678"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Date d'adhésion
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={dateValue}
                      onChange={handleDateChange}
                      onBlur={handleDateBlur}
                      disabled={isCreateMode}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Statut
                  </label>
                  <select
                    value={formData.member_status}
                    onChange={handleStatutChange}
                    disabled={isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                    <option value="archived">Archivé</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Statistics (only if not creating) */}
            {!isCreateMode && stats && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">
                  Statistiques
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                    <div className="text-sm text-gray-500 dark:text-dark-text-secondary mb-1">Prêts totaux</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.nbPrets}</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="text-sm text-blue-700 dark:text-blue-300 mb-1">Prêts actifs</div>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.nbPretsActifs}</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="text-sm text-green-700 dark:text-green-300 mb-1">Achats</div>
                    <div className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.nbAchats}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Only show in create mode */}
        {isCreateMode && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-dark-border px-6 py-4">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formData.nom || !formData.prenom || !formData.email}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

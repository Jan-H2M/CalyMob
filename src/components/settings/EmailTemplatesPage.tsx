/**
 * Email Templates Page
 * List view for managing email templates
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  listTemplates,
  deleteTemplate,
  duplicateTemplate,
} from '@/services/emailTemplateService';
import { initializeUserEmailTemplates } from '@/services/templateInitializationService';
import type { EmailTemplate } from '@/types/emailTemplates';
import { Mail, Plus, Edit, Trash2, Copy, Search, Filter, ChevronLeft, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmailTemplateEditor } from './EmailTemplateEditor';

type EmailTemplateType = 'pending_demands' | 'accounting_codes' | 'account_activated' | 'password_reset' | 'events' | 'transactions' | 'members' | 'custom';

const EMAIL_TYPE_LABELS: Record<EmailTemplateType, string> = {
  pending_demands: 'Demandes en attente',
  accounting_codes: 'Codes comptables',
  account_activated: 'Activation de compte',
  password_reset: 'Réinitialisation mot de passe',
  events: 'Événements',
  transactions: 'Transactions',
  members: 'Membres',
  custom: 'Personnalisé',
};

export function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { clubId, user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<EmailTemplateType | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [initializing, setInitializing] = useState(false);

  // Load templates
  useEffect(() => {
    if (clubId) {
      loadTemplates();
    }
  }, [clubId]);

  // Apply filters
  useEffect(() => {
    let filtered = templates;

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((t) => t.emailType === selectedType);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    setFilteredTemplates(filtered);
  }, [templates, selectedType, searchQuery]);

  async function loadTemplates() {
    if (!clubId) return;

    try {
      setLoading(true);
      const data = await listTemplates(clubId);
      setTemplates(data);
      setFilteredTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Erreur lors du chargement des templates');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(templateId: string) {
    if (!clubId) return;

    const confirmed = window.confirm(
      'Êtes-vous sûr de vouloir supprimer ce template ? Cette action est irréversible.'
    );

    if (!confirmed) return;

    try {
      await deleteTemplate(clubId, templateId);
      toast.success('Template supprimé');
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Erreur lors de la suppression');
    }
  }

  async function handleDuplicate(templateId: string) {
    if (!clubId || !user) return;

    try {
      const newId = await duplicateTemplate(clubId, templateId, user.uid);
      toast.success('Template dupliqué');
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Erreur lors de la duplication');
    }
  }

  function handleEdit(template: EmailTemplate) {
    setSelectedTemplate(template);
    setShowEditor(true);
  }

  function handleCreate() {
    setSelectedTemplate(null);
    setShowEditor(true);
  }

  async function handleInitializeDefaults() {
    if (!clubId || !user) return;

    try {
      setInitializing(true);
      const result = await initializeUserEmailTemplates(clubId, user.uid);

      if (result.success) {
        toast.success(
          `${result.created} template(s) créé(s), ${result.skipped} déjà existant(s)`
        );
        loadTemplates();
      } else {
        toast.error(
          `Erreur lors de l'initialisation: ${result.errors.join(', ')}`
        );
      }
    } catch (error: any) {
      console.error('Error initializing templates:', error);
      toast.error('Erreur lors de l\'initialisation des templates');
    } finally {
      setInitializing(false);
    }
  }

  // Check if user management templates exist
  const hasUserTemplates = templates.some(
    (t) => t.emailType === 'account_activated' || t.emailType === 'password_reset'
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600 dark:text-dark-text-secondary">
          Chargement des templates...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
          <button
            onClick={() => navigate('/parametres')}
            className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
          >
            Paramètres
          </button>
          <ChevronLeft className="h-4 w-4 rotate-180" />
          <button
            onClick={() => navigate('/parametres/communication')}
            className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
          >
            Communication
          </button>
          <ChevronLeft className="h-4 w-4 rotate-180" />
          <span className="text-gray-900 dark:text-dark-text-primary font-medium">
            Templates d'Emails
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
              <Mail className="h-7 w-7" />
              Templates d'emails
            </h1>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              Gérez vos templates d'emails automatiques
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!hasUserTemplates && (
              <button
                onClick={handleInitializeDefaults}
                disabled={initializing}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Download className="h-5 w-5" />
                {initializing ? 'Initialisation...' : 'Initialiser templates utilisateurs'}
              </button>
            )}
            <button
              onClick={handleCreate}
              className="bg-calypso-blue hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Nouveau template
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as EmailTemplateType | 'all')}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua"
            >
              <option value="all">Tous les types</option>
              {Object.entries(EMAIL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-12 text-center">
          <Mail className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-dark-text-secondary mb-2">
            {searchQuery || selectedType !== 'all'
              ? 'Aucun template trouvé avec ces filtres'
              : 'Aucun template créé'}
          </p>
          {!searchQuery && selectedType === 'all' && (
            <button
              onClick={handleCreate}
              className="mt-4 text-calypso-blue dark:text-calypso-aqua hover:underline"
            >
              Créer votre premier template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-5 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-1 flex items-center gap-2">
                    {template.name}
                    {template.isDefault && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded">
                        Par défaut
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    {template.description}
                  </p>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    template.isActive
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {template.isActive ? 'Actif' : 'Inactif'}
                </div>
              </div>

              {/* Type Badge */}
              <div className="mb-3">
                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                  {EMAIL_TYPE_LABELS[template.emailType as EmailTemplateType] || template.emailType}
                </span>
              </div>

              {/* Stats */}
              <div className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4 space-y-1">
                <div>Utilisé: {template.usageCount || 0} fois</div>
                {template.lastUsed && (
                  <div>
                    Dernier envoi:{' '}
                    {new Date(template.lastUsed).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => handleEdit(template)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-calypso-blue dark:text-calypso-aqua hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                >
                  <Edit className="h-4 w-4" />
                  Modifier
                </button>
                <button
                  onClick={() => handleDuplicate(template.id)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Dupliquer"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EmailTemplateEditor Modal */}
      {showEditor && (
        <EmailTemplateEditor
          template={selectedTemplate}
          onClose={() => {
            setShowEditor(false);
            setSelectedTemplate(null);
          }}
          onSave={() => {
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}

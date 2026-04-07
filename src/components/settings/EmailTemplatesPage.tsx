import { logger } from '@/utils/logger';
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
import type { EmailTemplate, EmailTemplateType } from '@/types/emailTemplates';
import { EMAIL_TYPE_LABELS } from '@/types/emailTemplates';
import { Mail, Plus, Edit, Trash2, Copy, Search, Filter, ChevronLeft, Download, Wand2, Layers, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmailTemplateEditor } from './EmailTemplateEditor';
import { migrateTransactionsTemplates } from '@/scripts/migrateTransactionsTemplateZones';

/**
 * Check if a template has editable zones
 * Zone markers format: <!--ZONE:id:Label-->content<!--/ZONE:id-->
 */
function hasEditableZones(htmlContent: string): boolean {
  return htmlContent.includes('<!--ZONE:') && htmlContent.includes('<!--/ZONE:');
}

/**
 * Count the number of editable zones in a template
 */
function countZones(htmlContent: string): number {
  const matches = htmlContent.match(/<!--ZONE:/g);
  return matches ? matches.length : 0;
}

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
  const [migrating, setMigrating] = useState(false);

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
      logger.error('Error loading templates:', error);
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
      logger.error('Error deleting template:', error);
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
      logger.error('Error duplicating template:', error);
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
    } catch (error) {
      logger.error('Error initializing templates:', error);
      toast.error('Erreur lors de l\'initialisation des templates');
    } finally {
      setInitializing(false);
    }
  }

  async function handleMigrateZones() {
    if (!clubId) return;

    const confirmed = window.confirm(
      'Cette action va ajouter des zones modifiables aux templates de type "transactions".\n\n' +
      'Les templates existants seront mis à jour pour permettre l\'édition de certaines sections avant envoi.\n\n' +
      'Continuer ?'
    );

    if (!confirmed) return;

    try {
      setMigrating(true);
      const result = await migrateTransactionsTemplates(clubId);

      if (result.success) {
        toast.success(
          `Migration terminée: ${result.templatesUpdated} template(s) mis à jour, ${result.templatesSkipped} ignoré(s)`
        );
        loadTemplates();
      } else {
        toast.error(
          `Erreurs lors de la migration: ${result.errors.join(', ')}`
        );
      }
    } catch (error: unknown) {
      logger.error('Error migrating templates:', error);
      toast.error('Erreur lors de la migration des templates');
    } finally {
      setMigrating(false);
    }
  }

  // Check if default templates exist (user management + expense notifications + automated communication)
  const hasAllDefaultTemplates =
    templates.some((t) => t.emailType === 'account_activated') &&
    templates.some((t) => t.emailType === 'password_reset') &&
    templates.some((t) => t.emailType === 'expense_submitted') &&
    templates.some((t) => t.emailType === 'expense_approved') &&
    templates.some((t) => t.emailType === 'expense_reimbursed') &&
    templates.some((t) => t.emailType === 'pending_demands') &&
    templates.some((t) => t.emailType === 'accounting_codes') &&
    templates.some((t) => t.emailType === 'bank_validation_pending');

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
            {!hasAllDefaultTemplates && (
              <button
                onClick={handleInitializeDefaults}
                disabled={initializing}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Download className="h-5 w-5" />
                {initializing ? 'Initialisation...' : 'Initialiser templates par défaut'}
              </button>
            )}
            {/* Migration button for adding zone markers to transactions templates */}
            {templates.some((t) => t.emailType === 'transactions') && (
              <button
                onClick={handleMigrateZones}
                disabled={migrating}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                title="Ajouter des zones modifiables aux templates de transactions"
              >
                <Wand2 className="h-5 w-5" />
                {migrating ? 'Migration...' : 'Activer zones éditables'}
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
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
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
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
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
          <Mail className="h-16 w-16 text-gray-300 dark:text-dark-text-secondary mx-auto mb-4" />
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
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-text-secondary uppercase tracking-wider">
                  Nom
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-dark-text-secondary uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-dark-text-secondary uppercase tracking-wider">
                  <span className="flex items-center justify-center gap-1">
                    Zones
                    <span className="group relative">
                      <Info className="h-3 w-3 text-gray-400 dark:text-dark-text-muted cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 font-normal normal-case">
                        Les zones permettent de modifier certaines parties du template avant l'envoi
                      </span>
                    </span>
                  </span>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-dark-text-secondary uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-dark-text-secondary uppercase tracking-wider">
                  Utilisé
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-dark-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {filteredTemplates.map((template) => (
                <tr
                  key={template.id}
                  className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  {/* Name & Description */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {template.name}
                      </span>
                      {template.isDefault && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                          Défaut
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-0.5 truncate max-w-xs">
                      {template.description}
                    </p>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 px-2 py-1 rounded whitespace-nowrap">
                      {EMAIL_TYPE_LABELS[template.emailType as EmailTemplateType] || template.emailType}
                    </span>
                  </td>

                  {/* Zones */}
                  <td className="px-4 py-3 text-center">
                    {hasEditableZones(template.htmlContent) ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                        title={`${countZones(template.htmlContent)} zone(s) modifiable(s)`}
                      >
                        <Layers className="h-3 w-3" />
                        {countZones(template.htmlContent)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-dark-text-muted">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        template.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted'
                      }`}
                    >
                      {template.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>

                  {/* Usage Count */}
                  <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-dark-text-secondary">
                    {template.usageCount || 0}×
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(template)}
                        className="p-1.5 text-calypso-blue dark:text-calypso-aqua hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Modifier"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(template.id)}
                        className="p-1.5 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 rounded transition-colors"
                        title="Dupliquer"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

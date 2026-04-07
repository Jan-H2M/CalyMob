import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import { toast } from 'react-hot-toast';
import {
  Plus,
  Search,
  MessageSquare,
  Smartphone,
  Edit2,
  Copy,
  Trash2,
  Star,
  Filter,
  Loader2,
  Download,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import {
  SMSTemplate,
  SMSTemplateContext,
  SMS_CONTEXT_LABELS,
  SMS_CONTEXT_VARIABLES,
  calculateSMSSegments,
} from '@/types/sms';
import { SettingsHeader } from './SettingsHeader';
import { cn } from '@/utils/utils';

type ChannelFilter = 'all' | 'sms' | 'whatsapp';

export default function SMSTemplatesPage() {
  const { clubId, user } = useAuth();

  // Filter state
  const [selectedContext, setSelectedContext] = useState<SMSTemplateContext | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Data state
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<SMSTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  // Load templates on mount
  useEffect(() => {
    if (clubId) {
      loadAllTemplates();
    }
  }, [clubId]);

  const loadAllTemplates = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Load templates for all contexts
      const contexts: SMSTemplateContext[] = ['demandes', 'evenements', 'paiements', 'general'];
      const allTemplates: SMSTemplate[] = [];

      for (const context of contexts) {
        const contextTemplates = await FirebaseSettingsService.loadSMSTemplates(clubId, context);
        allTemplates.push(...contextTemplates);
      }

      setTemplates(allTemplates);
    } catch (error) {
      logger.error('Error loading templates:', error);
      toast.error('Erreur lors du chargement des templates');
    } finally {
      setLoading(false);
    }
  };

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      // Context filter
      if (selectedContext !== 'all' && t.context !== selectedContext) return false;

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return t.name.toLowerCase().includes(term) ||
               t.template.toLowerCase().includes(term) ||
               t.description?.toLowerCase().includes(term);
      }

      return true;
    });
  }, [templates, selectedContext, channelFilter, searchTerm]);

  // Group templates by context for display
  const templatesByContext = useMemo(() => {
    const grouped: Record<SMSTemplateContext, SMSTemplate[]> = {
      demandes: [],
      evenements: [],
      paiements: [],
      general: [],
    };

    filteredTemplates.forEach(t => {
      if (grouped[t.context]) {
        grouped[t.context].push(t);
      }
    });

    return grouped;
  }, [filteredTemplates]);

  const handleCreateTemplate = () => {
    setEditingTemplate({
      name: '',
      description: '',
      context: selectedContext === 'all' ? 'general' : selectedContext,
      template: 'Calypso: ',
      isActive: true,
      isDefault: false,
    });
    setShowModal(true);
  };

  const handleEditTemplate = (template: SMSTemplate) => {
    setEditingTemplate({ ...template });
    setShowModal(true);
  };

  const handleDuplicateTemplate = (template: SMSTemplate) => {
    setEditingTemplate({
      ...template,
      id: undefined,
      name: `${template.name} (copie)`,
      isDefault: false,
    });
    setShowModal(true);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!clubId) return;

    const confirmed = window.confirm('Êtes-vous sûr de vouloir supprimer ce template ?');
    if (!confirmed) return;

    try {
      await FirebaseSettingsService.deleteSMSTemplate(clubId, templateId);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      toast.success('Template supprimé');
    } catch (error) {
      logger.error('Error deleting template:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleSetDefault = async (template: SMSTemplate) => {
    if (!clubId) return;

    try {
      await FirebaseSettingsService.saveSMSTemplate(clubId, {
        ...template,
        isDefault: true,
      }, user?.uid);

      // Update local state
      setTemplates(prev => prev.map(t => ({
        ...t,
        isDefault: t.id === template.id ? true : (t.context === template.context ? false : t.isDefault),
      })));

      toast.success('Template défini par défaut');
    } catch (error) {
      logger.error('Error setting default:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleSaveTemplate = async (templateData: Partial<SMSTemplate>) => {
    if (!clubId) return;

    try {
      setSaving(true);

      const templateId = await FirebaseSettingsService.saveSMSTemplate(
        clubId,
        templateData,
        user?.uid
      );

      // Reload templates to get updated data
      await loadAllTemplates();

      setShowModal(false);
      setEditingTemplate(null);
      toast.success(templateData.id ? 'Template mis à jour' : 'Template créé');
    } catch (error) {
      logger.error('Error saving template:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleInitializeDefaults = async () => {
    if (!clubId) return;

    const confirmed = window.confirm(
      'Cela va créer les templates par défaut pour chaque contexte. Continuer ?'
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      await FirebaseSettingsService.initializeDefaultSMSTemplates(clubId, user?.uid);
      await loadAllTemplates();
      toast.success('Templates par défaut créés');
    } catch (error) {
      logger.error('Error initializing defaults:', error);
      toast.error('Erreur lors de l\'initialisation');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-6xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Communication', 'Templates SMS/WhatsApp']}
          title="Templates SMS & WhatsApp"
          description="Gérez vos modèles de messages courts pour SMS et WhatsApp"
        />

        {/* Toolbar */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Context Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              <select
                value={selectedContext}
                onChange={(e) => setSelectedContext(e.target.value as SMSTemplateContext | 'all')}
                className="border border-gray-300 dark:border-dark-border rounded-md px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary text-sm"
              >
                <option value="all">Tous les contextes</option>
                {Object.entries(SMS_CONTEXT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Channel Filter */}
            <div className="flex rounded-md border border-gray-300 dark:border-dark-border overflow-hidden">
              <button
                onClick={() => setChannelFilter('all')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  channelFilter === 'all'
                    ? 'bg-calypso-blue text-white'
                    : 'bg-white dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary'
                )}
              >
                Tous
              </button>
              <button
                onClick={() => setChannelFilter('sms')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors border-l border-gray-300 dark:border-dark-border',
                  channelFilter === 'sms'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-white dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary'
                )}
              >
                <Smartphone className="h-4 w-4" /> SMS
              </button>
              <button
                onClick={() => setChannelFilter('whatsapp')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors border-l border-gray-300 dark:border-dark-border',
                  channelFilter === 'whatsapp'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-white dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary'
                )}
              >
                <MessageSquare className="h-4 w-4" /> WhatsApp
              </button>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-10 pr-4 py-1.5 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary text-sm"
                />
              </div>
            </div>

            {/* Add Button */}
            <button
              onClick={handleCreateTemplate}
              className="px-4 py-1.5 bg-calypso-blue text-white rounded-md flex items-center gap-2 text-sm font-medium hover:bg-calypso-blue-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouveau template
            </button>
          </div>
        </div>

        {/* Templates */}
        {filteredTemplates.length === 0 ? (
          <EmptyState onInitialize={handleInitializeDefaults} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => handleEditTemplate(template)}
                onDuplicate={() => handleDuplicateTemplate(template)}
                onDelete={() => handleDeleteTemplate(template.id)}
                onSetDefault={() => handleSetDefault(template)}
              />
            ))}
          </div>
        )}

        {/* Edit Modal */}
        {showModal && editingTemplate && (
          <TemplateEditModal
            template={editingTemplate}
            onSave={handleSaveTemplate}
            onClose={() => { setShowModal(false); setEditingTemplate(null); }}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Empty State Component
 */
function EmptyState({ onInitialize }: { onInitialize: () => void }) {
  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-8 text-center">
      <MessageSquare className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
        Aucun template
      </h3>
      <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-4">
        Commencez par charger les templates par défaut ou créez-en un nouveau.
      </p>
      <button
        onClick={onInitialize}
        className="px-4 py-2 bg-calypso-blue text-white rounded-md flex items-center gap-2 mx-auto text-sm font-medium hover:bg-calypso-blue-dark transition-colors"
      >
        <Download className="h-4 w-4" />
        Charger les templates par défaut
      </button>
    </div>
  );
}

/**
 * Template Card Component
 */
function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault
}: {
  template: SMSTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const segments = calculateSMSSegments(template.template);
  const contextLabel = SMS_CONTEXT_LABELS[template.context];

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow border border-gray-200 dark:border-dark-border hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-dark-border">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                {template.name}
              </h4>
              {template.isDefault && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs flex items-center gap-1 shrink-0">
                  <Star className="h-3 w-3" /> Défaut
                </span>
              )}
            </div>
            {template.description && (
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-1 line-clamp-1">
                {template.description}
              </p>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded text-xs">
            {contextLabel}
          </span>
          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs flex items-center gap-1">
            <Smartphone className="h-3 w-3" /> SMS
          </span>
          <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded text-xs flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> WhatsApp
          </span>
        </div>
      </div>

      {/* Content Preview */}
      <div className="p-4">
        <p className="text-sm font-mono bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded line-clamp-2 text-gray-700 dark:text-dark-text-primary">
          {template.template}
        </p>
        <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
          <span>{template.template.length} caractères</span>
          <span>{segments} segment{segments > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-between">
        {!template.isDefault ? (
          <button
            onClick={onSetDefault}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Définir par défaut
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-border rounded transition-colors"
            title="Modifier"
          >
            <Edit2 className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-border rounded transition-colors"
            title="Dupliquer"
          >
            <Copy className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Template Edit Modal Component
 */
function TemplateEditModal({
  template,
  onSave,
  onClose,
  saving,
}: {
  template: Partial<SMSTemplate>;
  onSave: (template: Partial<SMSTemplate>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(template);
  const segments = calculateSMSSegments(form.template || '');
  const variables = SMS_CONTEXT_VARIABLES[form.context || 'general'];

  const insertVariable = (key: string) => {
    setForm(prev => ({
      ...prev,
      template: (prev.template || '') + `{${key}}`
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
              {template.id ? 'Modifier le template' : 'Nouveau template'}
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Nom du template *
              </label>
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Rappel de paiement"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Description
              </label>
              <input
                type="text"
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Envoyé 3 jours avant échéance"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
              />
            </div>

            {/* Context */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Contexte *
              </label>
              <select
                value={form.context || 'general'}
                onChange={(e) => setForm({ ...form, context: e.target.value as SMSTemplateContext })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
              >
                {Object.entries(SMS_CONTEXT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Message *
              </label>
              <textarea
                value={form.template || ''}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
                rows={4}
                placeholder="Calypso: {nom}, votre paiement de {montant} EUR..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary font-mono text-sm"
              />
              <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                <span>{(form.template || '').length} caractères</span>
                <span>
                  {segments} segment{segments > 1 ? 's' : ''} SMS
                  <span className="text-gray-400 dark:text-dark-text-muted ml-1">(~{(segments * 0.07).toFixed(2)} EUR)</span>
                </span>
              </div>
            </div>

            {/* Variables */}
            <div className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
              <p className="text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-2">
                Variables disponibles (cliquez pour insérer):
              </p>
              <div className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="px-2 py-1 bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded text-xs font-mono hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 transition-colors"
                    title={`${v.label} (ex: ${v.example})`}
                  >
                    {`{${v.key}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault || false}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="h-4 w-4 text-calypso-blue border-gray-300 dark:border-dark-border rounded focus:ring-calypso-blue"
              />
              <label htmlFor="isDefault" className="text-sm text-gray-700 dark:text-dark-text-primary">
                Définir comme template par défaut pour ce contexte
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-md transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => onSave(form)}
              disabled={saving || !form.name || !form.template}
              className={cn(
                'px-4 py-2 bg-calypso-blue text-white rounded-md flex items-center gap-2 transition-colors',
                'hover:bg-calypso-blue-dark',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Sauvegarde...' : template.id ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Email Template Editor
 * Modal form for creating/editing email templates
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createTemplate,
  updateTemplate,
  renderTemplate,
} from '@/services/emailTemplateService';
import type {
  EmailTemplate,
  EmailTemplateType,
  EmailTemplateVariable,
  EmailTemplateStyles,
} from '@/types/emailTemplates';
import {
  getVariablesForType,
  getDefaultTemplateForType,
  getSampleDataForType,
  DEFAULT_TEMPLATE_STYLES,
} from '@/types/emailTemplates';
import { X, Eye, Code, Save, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import EmailTemplateAiChatbox from './EmailTemplateAiChatbox';

interface Props {
  template: EmailTemplate | null; // null = create mode
  onClose: () => void;
  onSave: () => void;
}

type TabType = 'content' | 'ai' | 'styling' | 'preview';

const EMAIL_TYPE_OPTIONS: { value: EmailTemplateType; label: string }[] = [
  { value: 'pending_demands', label: 'Demandes en attente' },
  { value: 'accounting_codes', label: 'Codes comptables quotidiens' },
  { value: 'account_activated', label: 'Activation de compte' },
  { value: 'password_reset', label: 'Réinitialisation mot de passe' },
  { value: 'events', label: 'Événements' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'members', label: 'Membres' },
  { value: 'custom', label: 'Personnalisé' },
];

export function EmailTemplateEditor({ template, onClose, onSave }: Props) {
  const { clubId, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('content');
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [emailType, setEmailType] = useState<EmailTemplateType>(
    template?.emailType || 'pending_demands'
  );
  const [subject, setSubject] = useState(template?.subject || '');
  const [htmlContent, setHtmlContent] = useState(
    template?.htmlContent || getDefaultTemplateForType(template?.emailType || 'pending_demands')
  );
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [styles, setStyles] = useState<EmailTemplateStyles>(
    template?.styles || DEFAULT_TEMPLATE_STYLES
  );


  // Variables for selected email type
  const [variables, setVariables] = useState<EmailTemplateVariable[]>(
    getVariablesForType(emailType)
  );

  // Preview state
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState('');

  // Update variables when email type changes
  useEffect(() => {
    setVariables(getVariablesForType(emailType));

    // Load default template when creating a new template (not editing)
    if (!template) {
      const defaultTemplate = getDefaultTemplateForType(emailType);
      setHtmlContent(defaultTemplate);
    }
  }, [emailType, template]);

  // Generate preview when switching to preview tab
  useEffect(() => {
    if (activeTab === 'preview') {
      generatePreview();
    }
  }, [activeTab, htmlContent, subject, styles]);

  function generatePreview() {
    const sampleData = getSampleDataForType(emailType);
    if (!sampleData) {
      setPreviewError('Aucune donnée de test disponible pour ce type');
      setPreviewHtml('');
      return;
    }

    const tempTemplate: EmailTemplate = {
      id: 'preview',
      name,
      description,
      emailType,
      subject,
      htmlContent,
      variables,
      styles,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user?.uid || '',
      isActive,
      usageCount: 0,
    };

    const result = renderTemplate(tempTemplate, sampleData.data);

    if (result.success && result.html) {
      setPreviewHtml(result.html);
      setPreviewError('');
    } else {
      setPreviewError(result.error || 'Erreur de rendu');
      setPreviewHtml('');
    }
  }

  async function handleSave() {
    if (!clubId || !user) return;

    // Validation
    if (!name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }

    if (!subject.trim()) {
      toast.error('Le sujet est obligatoire');
      return;
    }

    if (!htmlContent.trim()) {
      toast.error('Le contenu HTML est obligatoire');
      return;
    }

    try {
      setSaving(true);

      const templateData = {
        name: name.trim(),
        description: description.trim(),
        emailType,
        subject: subject.trim(),
        htmlContent: htmlContent.trim(),
        variables,
        styles,
        isActive,
      };

      if (template) {
        // Update existing
        await updateTemplate(clubId, template.id, templateData, user.uid);
        toast.success('Template mis à jour');
      } else {
        // Create new
        await createTemplate(clubId, templateData, user.uid);
        toast.success('Template créé');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  function insertVariable(variableName: string) {
    const cursorInsert = `{{${variableName}}}`;
    setHtmlContent((prev) => prev + cursorInsert);
    toast.success(`Variable {{${variableName}}} ajoutée`);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-[95vw] w-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
            {template ? 'Modifier le template' : 'Nouveau template'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-dark-border px-6">
          <button
            onClick={() => setActiveTab('content')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'content'
                ? 'border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            }`}
          >
            <Code className="h-4 w-4" />
            Contenu
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'ai'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            ✨ Assistent IA
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            }`}
          >
            <Eye className="h-4 w-4" />
            Aperçu
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'content' && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                    Nom du template *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Rappel Demandes Détaillé"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                    Type d'email *
                  </label>
                  <select
                    value={emailType}
                    onChange={(e) => setEmailType(e.target.value as EmailTemplateType)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua"
                  >
                    {EMAIL_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Email quotidien avec liste des demandes en attente"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Sujet de l'email *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: {{demandesCount}} demande(s) de remboursement en attente"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua font-mono text-sm"
                />
              </div>

              {/* HTML Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Contenu HTML *
                </label>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={15}
                  placeholder="HTML avec variables Handlebars..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua font-mono text-sm"
                />
              </div>

              {/* Variables Reference */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Variables disponibles
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {variables.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => insertVariable(v.name)}
                      className="text-left px-3 py-2 bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors group"
                      title={v.description}
                    >
                      <div className="font-mono text-sm text-calypso-blue dark:text-calypso-aqua group-hover:underline">
                        {`{{${v.name}}}`}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-dark-text-secondary mt-1">
                        {v.description}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-3">
                  💡 Cliquez sur une variable pour l'insérer dans le contenu HTML
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 text-calypso-blue focus:ring-calypso-blue border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-dark-text-secondary">
                  Template actif (peut être utilisé dans les jobs)
                </label>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="h-full">
              <EmailTemplateAiChatbox
                emailType={emailType}
                variables={variables}
                styles={styles}
                subject={subject}
                htmlContent={htmlContent}
                onHtmlUpdate={(html) => {
                  setHtmlContent(html);
                }}
                onApplyHtml={(html) => {
                  setHtmlContent(html);
                  setActiveTab('content');
                  toast.success('Template appliqué! Les champs ont été remplis automatiquement.');
                }}
                onApplyMetadata={(metadata) => {
                  // Remplir automatiquement les champs si vides
                  if (!name.trim()) setName(metadata.name);
                  if (!description.trim()) setDescription(metadata.description);
                  if (!subject.trim()) setSubject(metadata.subject);
                }}
              />
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="space-y-4">
              {previewError ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-700 dark:text-red-400">{previewError}</p>
                </div>
              ) : previewHtml ? (
                <div>
                  <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      ℹ️ Aperçu généré avec des données de test
                    </p>
                  </div>
                  <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[600px] bg-white"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-600 dark:text-dark-text-secondary py-12">
                  Génération de l'aperçu...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-calypso-blue hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Save className="h-5 w-5" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

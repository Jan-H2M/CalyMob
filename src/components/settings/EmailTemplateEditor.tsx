import { logger } from '@/utils/logger';
/**
 * Email Template Editor
 * Modal form for creating/editing email templates
 * Uses AI-powered generation as the primary editing method
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createTemplate,
  updateTemplate,
  renderTemplate,
  sendTestEmailFromEditor,
} from '@/services/emailTemplateService';
import { BrandingService } from '@/services/brandingService';
import type {
  EmailTemplate,
  EmailTemplateType,
  EmailTemplateVariable,
  EmailTemplateStyles,
} from '@/types/emailTemplates';
import type { BrandingPreset } from '@/types/branding';
import {
  EMAIL_TYPE_LABELS,
  getVariablesForType,
  getDefaultTemplateForType,
  getSampleDataForType,
  DEFAULT_TEMPLATE_STYLES,
} from '@/types/emailTemplates';
import { X, Eye, Code, Save, AlertCircle, Sparkles, Send, Loader2, Palette, ChevronDown, BookOpen, Copy, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import EmailTemplateAiChatbox from './EmailTemplateAiChatbox';
import { EmailTemplateZonesTab } from './EmailTemplateZonesTab';
import { EMAIL_QUICK_PROMPTS, QuickPrompt } from '@/constants/emailQuickPrompts';

interface Props {
  template: EmailTemplate | null; // null = create mode
  onClose: () => void;
  onSave: () => void;
}

type TabType = 'zones' | 'ai' | 'examples' | 'code' | 'preview';

export function EmailTemplateEditor({ template, onClose, onSave }: Props) {
  const { clubId, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('zones');
  const [saving, setSaving] = useState(false);

  // Branding state
  const [brandingPresets, setBrandingPresets] = useState<BrandingPreset[]>([]);
  const [selectedBrandingId, setSelectedBrandingId] = useState<string | null>(
    template?.brandingId || null
  );
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [brandingSelectorOpen, setBrandingSelectorOpen] = useState(false);

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
  const [sendingTest, setSendingTest] = useState(false);

  // Load branding presets on mount
  useEffect(() => {
    if (clubId) {
      loadBrandingPresets();
    }
  }, [clubId]);

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

  // Close branding selector when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setBrandingSelectorOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  async function loadBrandingPresets() {
    if (!clubId || !user?.uid) return;

    try {
      setLoadingBranding(true);
      let presets = await BrandingService.loadBrandingPresets(clubId);

      // If no presets, migrate legacy branding
      if (presets.length === 0) {
        await BrandingService.migrateLegacyBranding(clubId, user.uid);
        presets = await BrandingService.loadBrandingPresets(clubId);
      }

      setBrandingPresets(presets);

      // Select default if nothing selected
      if (!selectedBrandingId && presets.length > 0) {
        const defaultPreset = presets.find(p => p.isDefault) || presets[0];
        setSelectedBrandingId(defaultPreset.id);
      }
    } catch (error) {
      logger.error('Error loading branding presets:', error);
    } finally {
      setLoadingBranding(false);
    }
  }

  // Get selected branding preset
  const selectedBranding = brandingPresets.find(p => p.id === selectedBrandingId) || null;

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

  async function handleSendTest() {
    if (!clubId) {
      toast.error('Club ID manquant');
      return;
    }

    if (!subject.trim()) {
      toast.error('Le sujet est obligatoire pour envoyer un test');
      return;
    }

    if (!htmlContent.trim()) {
      toast.error('Le contenu HTML est obligatoire pour envoyer un test');
      return;
    }

    setSendingTest(true);
    try {
      const sampleData = getSampleDataForType(emailType);
      const result = await sendTestEmailFromEditor(
        clubId,
        subject,
        htmlContent,
        sampleData?.data || {}
      );

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      logger.error('Error sending test email:', error);
      toast.error('Erreur lors de l\'envoi du test');
    } finally {
      setSendingTest(false);
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

      // Helper to remove undefined values recursively (Firestore doesn't accept undefined)
      const removeUndefined = (obj: unknown): unknown => {
        if (obj === null) return null;
        if (obj === undefined) return null;
        if (Array.isArray(obj)) {
          return obj.map(item => removeUndefined(item)).filter(item => item !== undefined);
        }
        if (typeof obj === 'object') {
          const cleaned: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const cleanedValue = removeUndefined(value);
            if (cleanedValue !== undefined) {
              cleaned[key] = cleanedValue;
            }
          }
          return cleaned;
        }
        return obj;
      };

      // Build template data
      const templateData: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || '',
        emailType,
        subject: subject.trim(),
        htmlContent: htmlContent.trim(),
        variables: removeUndefined(variables),
        styles: removeUndefined(styles),
        isActive,
        brandingId: selectedBrandingId || null,
      };

      logger.debug('Saving template:', {
        name: templateData.name,
        brandingId: templateData.brandingId,
        htmlLength: (templateData.htmlContent as string).length
      });

      if (template) {
        // Update existing
        await updateTemplate(clubId, template.id, templateData, user.uid);
        toast.success('Template mis a jour');
      } else {
        // Create new
        await createTemplate(clubId, templateData as never, user.uid);
        toast.success('Template cree');
      }

      onSave();
      onClose();
    } catch (error) {
      logger.error('Error saving template:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  function insertVariable(variableName: string) {
    const cursorInsert = `{{${variableName}}}`;
    setHtmlContent((prev) => prev + cursorInsert);
    toast.success(`Variable {{${variableName}}} ajoutee`);
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
            className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Metadata Bar */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                Nom du template *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Rappel Demandes"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                Type d'email *
              </label>
              <select
                value={emailType}
                onChange={(e) => setEmailType(e.target.value as EmailTemplateType)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
              >
                {Object.entries(EMAIL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                Sujet de l'email *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: {{demandesCount}} demande(s) en attente"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary font-mono"
              />
            </div>

            {/* Branding Selector */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                Style de branding
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBrandingSelectorOpen(!brandingSelectorOpen);
                }}
                disabled={loadingBranding}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary flex items-center justify-between gap-2 hover:border-gray-400 transition-colors"
              >
                {loadingBranding ? (
                  <span className="text-gray-400 dark:text-dark-text-muted">Chargement...</span>
                ) : selectedBranding ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border border-gray-300 dark:border-dark-border"
                      style={{ backgroundColor: selectedBranding.primaryColor }}
                    />
                    <span className="truncate">{selectedBranding.name}</span>
                    {selectedBranding.isDefault && (
                      <span className="text-xs text-gray-400 dark:text-dark-text-muted">(defaut)</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400 dark:text-dark-text-muted flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Choisir un style
                  </span>
                )}
                <ChevronDown className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              </button>

              {/* Dropdown */}
              {brandingSelectorOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {brandingPresets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setSelectedBrandingId(preset.id);
                        setBrandingSelectorOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary ${
                        selectedBrandingId === preset.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-full border border-gray-300 dark:border-dark-border flex-shrink-0"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                          {preset.name}
                        </div>
                        {preset.description && (
                          <div className="text-xs text-gray-500 dark:text-dark-text-muted truncate">
                            {preset.description}
                          </div>
                        )}
                      </div>
                      {preset.isDefault && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">Defaut</span>
                      )}
                    </button>
                  ))}
                  {brandingPresets.length === 0 && (
                    <div className="px-3 py-4 text-sm text-gray-500 dark:text-dark-text-muted text-center">
                      Aucun style de branding disponible
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-dark-border px-6">
          <button
            onClick={() => setActiveTab('zones')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'zones'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            }`}
          >
            <Layers className="h-4 w-4" />
            Zones
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'ai'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Generation IA
          </button>
          <button
            onClick={() => setActiveTab('examples')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'examples'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Exemples de prompts
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            }`}
          >
            <Eye className="h-4 w-4" />
            Apercu
          </button>
          <button
            onClick={() => setActiveTab('code')}
            data-tab="code"
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'code'
                ? 'border-gray-600 text-gray-600 dark:text-dark-text-secondary'
                : 'border-transparent text-gray-400 dark:text-dark-text-muted dark:text-dark-text-tertiary hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-secondary'
            }`}
          >
            <Code className="h-4 w-4" />
            Code HTML
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Zones Tab - Editable zones management */}
          {activeTab === 'zones' && (
            <EmailTemplateZonesTab
              htmlContent={htmlContent}
              emailType={emailType}
              variables={variables}
              onHtmlUpdate={setHtmlContent}
            />
          )}

          {/* AI Tab - Primary editing method */}
          {activeTab === 'ai' && (
            <div className="h-full">
              <EmailTemplateAiChatbox
                emailType={emailType}
                variables={variables}
                styles={styles}
                subject={subject}
                htmlContent={htmlContent}
                branding={selectedBranding}
                onHtmlUpdate={(html) => {
                  logger.debug('[EmailTemplateEditor] onHtmlUpdate called, new HTML length:', html.length);
                  setHtmlContent(html);
                }}
                onApplyHtml={(html) => {
                  setHtmlContent(html);
                  toast.success('Template applique!');
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

          {/* Examples Tab - All quick prompts */}
          {activeTab === 'examples' && (
            <div className="space-y-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
                  Bibliotheque d'exemples de prompts
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Copiez un prompt et collez-le dans l'onglet "Generation IA" pour creer votre template.
                  Ces exemples sont optimises pour chaque type d'email.
                </p>
              </div>

              {Object.entries(EMAIL_QUICK_PROMPTS).map(([type, prompts]) => {
                if (!prompts || prompts.length === 0) return null;
                const typeLabel = EMAIL_TYPE_LABELS[type as EmailTemplateType] || type;

                return (
                  <div key={type} className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border">
                      <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary">
                        {typeLabel}
                      </h4>
                    </div>
                    <div className="p-4 space-y-4">
                      {prompts.map((prompt: QuickPrompt, index: number) => (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{prompt.icon}</span>
                              <div>
                                <h5 className="font-medium text-gray-900 dark:text-dark-text-primary">
                                  {prompt.label}
                                </h5>
                                {prompt.description && (
                                  <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                                    {prompt.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(prompt.prompt);
                                toast.success('Prompt copie!');
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-lg transition-colors"
                            >
                              <Copy className="h-4 w-4" />
                              Copier
                            </button>
                          </div>

                          <div className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary rounded-lg p-3 mb-3">
                            <p className="text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary mb-1">
                              Sujet suggere:
                            </p>
                            <code className="text-sm text-purple-600 dark:text-purple-400 font-mono">
                              {prompt.suggestedSubject}
                            </code>
                          </div>

                          <div className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary mb-2">
                              Prompt:
                            </p>
                            <pre className="text-sm text-gray-700 dark:text-dark-text-primary whitespace-pre-wrap font-mono leading-relaxed">
                              {prompt.prompt}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Code Tab - Advanced users only */}
          {activeTab === 'code' && (
            <div className="space-y-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Mode avance : Editez directement le code HTML du template
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Email quotidien avec liste des demandes en attente"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                />
              </div>

              {/* HTML Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Contenu HTML *
                </label>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={20}
                  placeholder="HTML avec variables Handlebars..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary font-mono text-sm"
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
                  Cliquez sur une variable pour l'inserer dans le contenu HTML
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 text-calypso-blue focus:ring-calypso-blue border-gray-300 dark:border-dark-border rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-dark-text-primary">
                  Template actif (peut etre utilise dans les jobs)
                </label>
              </div>
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
                  <div className="mb-4 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      Apercu genere avec des donnees de test
                    </p>
                    <button
                      onClick={handleSendTest}
                      disabled={sendingTest}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {sendingTest ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Envoi...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Envoyer un test
                        </>
                      )}
                    </button>
                  </div>
                  <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[50vh] md:h-[600px] bg-white"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-600 dark:text-dark-text-secondary py-12">
                  Generation de l'apercu...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 rounded-lg transition-colors"
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

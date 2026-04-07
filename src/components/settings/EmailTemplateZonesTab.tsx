import { logger } from '@/utils/logger';
/**
 * Email Template Zones Tab
 * Allows creating and managing editable zones in email templates
 */

import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  Layers,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  FormInput,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { RichTextEditor } from '../common/RichTextEditor';
import {
  parseZonesFromHtml,
  removeZone,
  addZone,
  updateZoneContent,
  updateZoneLabel
} from '@/services/emailTemplateService';
import { generateZoneWithAi } from '@/services/emailTemplateAiService';
import type { EditableZone, EmailTemplateType, EmailTemplateVariable } from '@/types/emailTemplates';

interface EmailTemplateZonesTabProps {
  htmlContent: string;
  emailType: EmailTemplateType;
  variables: EmailTemplateVariable[];
  onHtmlUpdate: (html: string) => void;
}

type AddMode = 'ai' | 'manual';

export function EmailTemplateZonesTab({
  htmlContent,
  emailType,
  variables,
  onHtmlUpdate,
}: EmailTemplateZonesTabProps) {
  // Parse existing zones from HTML
  const existingZones = useMemo(() => parseZonesFromHtml(htmlContent), [htmlContent]);

  // State for adding zones
  const [addMode, setAddMode] = useState<AddMode>('ai');
  const [isGenerating, setIsGenerating] = useState(false);

  // AI mode state
  const [aiPrompt, setAiPrompt] = useState('');

  // Manual mode state
  const [manualZoneId, setManualZoneId] = useState('');
  const [manualZoneLabel, setManualZoneLabel] = useState('');
  const [manualZoneContent, setManualZoneContent] = useState('<p>Contenu par defaut...</p>');
  const [manualInsertAfter, setManualInsertAfter] = useState<string>('');

  // Zone editing state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingLabel, setEditingLabel] = useState('');

  // Expanded zones for viewing content
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  // Handle AI zone generation
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Veuillez decrire la zone a ajouter');
      return;
    }

    if (!htmlContent.trim() || htmlContent.length < 50) {
      toast.error('Le template doit d\'abord avoir du contenu HTML avant d\'ajouter des zones');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateZoneWithAi({
        userMessage: aiPrompt,
        currentHtmlContent: htmlContent,
        emailType,
        variables,
        existingZones,
      });

      onHtmlUpdate(result.html);
      setAiPrompt('');
      toast.success(`Zone "${result.zoneName}" ajoutee avec succes!`);
    } catch (error) {
      logger.error('Error generating zone:', error);
      toast.error(error.message || 'Erreur lors de la generation de la zone');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle manual zone addition
  const handleManualAdd = () => {
    if (!manualZoneId.trim()) {
      toast.error('La reference (ID) est obligatoire');
      return;
    }

    if (!manualZoneLabel.trim()) {
      toast.error('Le label est obligatoire');
      return;
    }

    // Check if zone ID already exists
    if (existingZones.some(z => z.id === manualZoneId.trim())) {
      toast.error(`Une zone avec l'ID "${manualZoneId}" existe deja`);
      return;
    }

    // Validate zone ID (only alphanumeric and underscore)
    const zoneIdPattern = /^\w+$/;
    if (!zoneIdPattern.test(manualZoneId.trim())) {
      toast.error('La reference ne peut contenir que des lettres, chiffres et underscores');
      return;
    }

    const newHtml = addZone(
      htmlContent,
      {
        id: manualZoneId.trim(),
        label: manualZoneLabel.trim(),
        content: manualZoneContent,
      },
      manualInsertAfter || undefined
    );

    onHtmlUpdate(newHtml);

    // Reset form
    setManualZoneId('');
    setManualZoneLabel('');
    setManualZoneContent('<p>Contenu par defaut...</p>');
    setManualInsertAfter('');

    toast.success(`Zone "${manualZoneLabel}" ajoutee!`);
  };

  // Handle zone deletion
  const handleDeleteZone = (zoneId: string) => {
    const zone = existingZones.find(z => z.id === zoneId);
    if (!zone) return;

    if (confirm(`Supprimer la zone "${zone.label}" ? Le contenu sera preserve mais ne sera plus editable.`)) {
      const newHtml = removeZone(htmlContent, zoneId);
      onHtmlUpdate(newHtml);
      toast.success(`Zone "${zone.label}" supprimee`);
    }
  };

  // Handle zone editing
  const handleStartEdit = (zone: EditableZone) => {
    setEditingZoneId(zone.id);
    setEditingContent(zone.content);
    setEditingLabel(zone.label);
  };

  const handleSaveEdit = () => {
    if (!editingZoneId) return;

    let newHtml = htmlContent;

    // Update content if changed
    const originalZone = existingZones.find(z => z.id === editingZoneId);
    if (originalZone && editingContent !== originalZone.content) {
      newHtml = updateZoneContent(newHtml, editingZoneId, editingContent);
    }

    // Update label if changed
    if (originalZone && editingLabel !== originalZone.label) {
      newHtml = updateZoneLabel(newHtml, editingZoneId, editingLabel);
    }

    onHtmlUpdate(newHtml);
    setEditingZoneId(null);
    toast.success('Zone mise a jour');
  };

  const handleCancelEdit = () => {
    setEditingZoneId(null);
    setEditingContent('');
    setEditingLabel('');
  };

  // Toggle zone expansion
  const toggleZoneExpanded = (zoneId: string) => {
    setExpandedZones(prev => {
      const newSet = new Set(prev);
      if (newSet.has(zoneId)) {
        newSet.delete(zoneId);
      } else {
        newSet.add(zoneId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
              Zones editables
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Les zones permettent aux utilisateurs de personnaliser certaines parties de l'email
              lors de l'envoi. Chaque zone a une reference unique et un contenu par defaut
              qui peut etre modifie.
            </p>
          </div>
        </div>
      </div>

      {/* Existing Zones List */}
      <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
            <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary">
              Zones existantes ({existingZones.length})
            </h3>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-dark-border">
          {existingZones.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              <Layers className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-dark-text-secondary" />
              <p>Aucune zone editable dans ce template</p>
              <p className="text-sm mt-1">Utilisez le formulaire ci-dessous pour en ajouter</p>
            </div>
          ) : (
            existingZones.map((zone) => (
              <div key={zone.id} className="p-4">
                {editingZoneId === zone.id ? (
                  // Edit mode
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                          Reference (ID)
                        </label>
                        <input
                          type="text"
                          value={zone.id}
                          disabled
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-dark-border rounded-lg bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                          Label
                        </label>
                        <input
                          type="text"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-1">
                        Contenu
                      </label>
                      <RichTextEditor
                        content={editingContent}
                        onChange={setEditingContent}
                        placeholder="Contenu de la zone..."
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1.5 text-sm bg-calypso-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">
                          <span className="text-purple-500">#</span>
                          {zone.id}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                          {zone.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleZoneExpanded(zone.id)}
                          className="p-1.5 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 rounded transition-colors"
                          title={expandedZones.has(zone.id) ? 'Reduire' : 'Developper'}
                        >
                          {expandedZones.has(zone.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleStartEdit(zone)}
                          className="p-1.5 text-gray-400 dark:text-dark-text-muted hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 rounded transition-colors"
                          title="Modifier"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteZone(zone.id)}
                          className="p-1.5 text-gray-400 dark:text-dark-text-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 rounded transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded content preview */}
                    {expandedZones.has(zone.id) && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border">
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary mb-2">Contenu par defaut:</p>
                        <div
                          className="text-sm text-gray-700 dark:text-dark-text-primary prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(zone.content) }}
                        />
                      </div>
                    )}

                    {/* Collapsed preview */}
                    {!expandedZones.has(zone.id) && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary truncate">
                        {zone.content.replace(/<[^>]*>/g, '').substring(0, 80)}
                        {zone.content.length > 80 && '...'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Zone Section */}
      <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
            <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary">
              Ajouter une zone
            </h3>
          </div>
        </div>

        <div className="p-4">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setAddMode('ai')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                addMode === 'ai'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-2 border-purple-300 dark:border-purple-700'
                  : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Via l'IA
            </button>
            <button
              onClick={() => setAddMode('manual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                addMode === 'manual'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700'
                  : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <FormInput className="h-4 w-4" />
              Manuellement
            </button>
          </div>

          {/* AI Mode */}
          {addMode === 'ai' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Decrivez la zone que vous voulez ajouter
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder="Ex: Ajoute une zone 'signature' a la fin de l'email pour une signature personnalisee"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {!htmlContent.trim() || htmlContent.length < 50 ? (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Creez d'abord le contenu du template (via l'onglet "Generation IA") avant d'ajouter des zones.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleAiGenerate}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generation en cours...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Ajouter la zone
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {addMode === 'manual' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Reference (ID) *
                  </label>
                  <input
                    type="text"
                    value={manualZoneId}
                    onChange={(e) => setManualZoneId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="ex: signature"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">Lettres minuscules, chiffres, underscores</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Label (affiche) *
                  </label>
                  <input
                    type="text"
                    value={manualZoneLabel}
                    onChange={(e) => setManualZoneLabel(e.target.value)}
                    placeholder="ex: Signature"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Contenu par defaut
                </label>
                <RichTextEditor
                  content={manualZoneContent}
                  onChange={setManualZoneContent}
                  placeholder="Contenu par defaut de la zone..."
                />
              </div>

              {existingZones.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Inserer apres (optionnel)
                  </label>
                  <select
                    value={manualInsertAfter}
                    onChange={(e) => setManualInsertAfter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
                  >
                    <option value="">A la fin du template</option>
                    {existingZones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        Apres "{zone.label}" ({zone.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleManualAdd}
                disabled={!manualZoneId.trim() || !manualZoneLabel.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Ajouter la zone
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailTemplateZonesTab;

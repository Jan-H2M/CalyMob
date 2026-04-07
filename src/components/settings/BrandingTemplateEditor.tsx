/**
 * BrandingTemplateEditor - Modal pour ajouter/modifier un template HTML de reference
 */

import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { X, Loader2, Code, Eye, Copy, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import {
  HtmlTemplate,
  DEFAULT_TEMPLATE,
} from '@/types/branding';
import { cn } from '@/utils/utils';

interface BrandingTemplateEditorProps {
  template: HtmlTemplate | null;
  onClose: () => void;
  onSave: () => void;
}

export default function BrandingTemplateEditor({ template, onClose, onSave }: BrandingTemplateEditorProps) {
  const { clubId, user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isEditing = !!template;

  // Form state
  const [formData, setFormData] = useState({
    name: template?.name || DEFAULT_TEMPLATE.name,
    description: template?.description || DEFAULT_TEMPLATE.description || '',
    html: template?.html || DEFAULT_TEMPLATE.html,
  });
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(formData.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Code copie');
    } catch {
      toast.error('Erreur lors de la copie');
    }
  };

  const handleSave = async () => {
    if (!clubId || !user?.uid) return;

    if (!formData.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      setSaving(true);

      if (isEditing && template) {
        await BrandingService.updateTemplate(clubId, template.id, {
          name: formData.name,
          description: formData.description,
          html: formData.html,
        });
        toast.success('Template mis a jour');
      } else {
        await BrandingService.createTemplate(
          clubId,
          {
            name: formData.name,
            description: formData.description,
            html: formData.html,
            createdBy: user.uid,
          },
          user.uid
        );
        toast.success('Template cree');
      }

      onSave();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-5xl w-full h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {isEditing ? 'Modifier le template' : 'Ajouter un template de reference'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Info fields */}
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Nom
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  placeholder="Ocean Waves"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  placeholder="Style ocean avec vagues SVG et degrades bleus"
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
            <button
              onClick={() => setActiveTab('code')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === 'code'
                  ? 'bg-calypso-blue text-white'
                  : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
              )}
            >
              <Code className="h-4 w-4" />
              Code HTML
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === 'preview'
                  ? 'bg-calypso-blue text-white'
                  : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
              )}
            >
              <Eye className="h-4 w-4" />
              Apercu
            </button>

            <div className="flex-1" />

            <button
              onClick={handleCopyHtml}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  Copie
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copier
                </>
              )}
            </button>
          </div>

          {/* Editor / Preview */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'code' ? (
              <textarea
                value={formData.html}
                onChange={e => setFormData({ ...formData, html: e.target.value })}
                className="w-full h-full p-4 font-mono text-sm bg-gray-50 dark:bg-dark-bg-tertiary border-0 resize-none focus:outline-none"
                placeholder="<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <style>
    /* Vos styles ici */
  </style>
</head>
<body>
  <!-- Votre template HTML ici -->
</body>
</html>"
                spellCheck={false}
              />
            ) : (
              <div className="h-full p-4 bg-gray-100 dark:bg-dark-bg-tertiary overflow-auto">
                {formData.html ? (
                  <div className="bg-white rounded-lg shadow overflow-hidden max-w-2xl mx-auto">
                    <iframe
                      ref={iframeRef}
                      srcDoc={formData.html}
                      title="Preview"
                      className="w-full border-0"
                      style={{ minHeight: '500px' }}
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-dark-text-muted">
                    <div className="text-center">
                      <Code className="h-12 w-12 mx-auto mb-2" />
                      <p>Collez votre code HTML dans l'onglet "Code HTML"</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Help text */}
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-900/30 flex-shrink-0">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Ce template servira de reference visuelle pour l'IA lors de la generation d'emails.
              L'IA s'inspirera du style, des couleurs et de la structure pour creer des emails coherents.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

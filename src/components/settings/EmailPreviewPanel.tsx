/**
 * Email Preview Panel
 * Shows email preview, code, or split view
 */

import React, { useState, useEffect } from 'react';
import { Eye, Code2, Columns } from 'lucide-react';
import { EmailCodeViewer } from './EmailCodeViewer';
import { renderTemplate } from '@/services/emailTemplateService';
import type { EmailTemplate, EmailTemplateType } from '@/types/emailTemplates';
import { getSampleDataForType } from '@/types/emailTemplates';

interface Props {
  htmlContent: string;
  subject: string;
  emailType: EmailTemplateType;
  styles: any;
  variables: any[];
}

type ViewMode = 'preview' | 'code' | 'split';

export function EmailPreviewPanel({ htmlContent, subject, emailType, styles, variables }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState('');

  // Generate preview whenever content changes
  useEffect(() => {
    generatePreview();
  }, [htmlContent, subject, emailType, styles]);

  function generatePreview() {
    const sampleData = getSampleDataForType(emailType);
    if (!sampleData) {
      setPreviewError('Aucune donnée de test disponible pour ce type');
      setPreviewHtml('');
      return;
    }

    const tempTemplate: EmailTemplate = {
      id: 'preview',
      name: 'Preview',
      description: 'Preview',
      emailType,
      subject,
      htmlContent,
      variables,
      styles,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      isActive: true,
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

  return (
    <div className="h-full flex flex-col">
      {/* View mode toggle buttons */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
        <button
          onClick={() => setViewMode('preview')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'preview'
              ? 'bg-calypso-blue text-white'
              : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <Eye className="h-4 w-4" />
          Aperçu
        </button>
        <button
          onClick={() => setViewMode('code')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'code'
              ? 'bg-calypso-blue text-white'
              : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <Code2 className="h-4 w-4" />
          Code
        </button>
        <button
          onClick={() => setViewMode('split')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'split'
              ? 'bg-calypso-blue text-white'
              : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <Columns className="h-4 w-4" />
          Split
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' && (
          <div className="h-full p-4">
            {previewError ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-700 dark:text-red-400">{previewError}</p>
              </div>
            ) : previewHtml ? (
              <div>
                <div className="mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
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

        {viewMode === 'code' && (
          <div className="h-full">
            <EmailCodeViewer html={htmlContent} />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="h-full flex gap-4 p-4">
            {/* Preview left */}
            <div className="flex-1 overflow-auto">
              {previewError ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-700 dark:text-red-400">{previewError}</p>
                </div>
              ) : previewHtml ? (
                <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden h-full">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full bg-white"
                    title="Email Preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <div className="text-center text-gray-600 dark:text-dark-text-secondary py-12">
                  Génération de l'aperçu...
                </div>
              )}
            </div>

            {/* Code right */}
            <div className="flex-1 overflow-auto">
              <EmailCodeViewer html={htmlContent} className="h-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

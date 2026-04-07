/**
 * Email Template Visual Editor
 * Professional drag-and-drop email builder using Unlayer
 */

import { useRef, useEffect, useState } from 'react';
import EmailEditor, { EditorRef, EmailEditorProps } from 'react-email-editor';
import type { EmailTemplateVariable } from '@/types/emailTemplates';
import { AlertTriangle, RefreshCw, Code, Check } from 'lucide-react';

interface Props {
  designJson?: Record<string, unknown>;
  htmlContent?: string;
  variables: EmailTemplateVariable[];
  onDesignChange: (data: { designJson: Record<string, unknown>; htmlContent: string }) => void;
}

export function EmailTemplateVisualEditor({
  designJson,
  htmlContent,
  variables,
  onDesignChange,
}: Props) {
  const emailEditorRef = useRef<EditorRef>(null);
  const [isReady, setIsReady] = useState(false);
  const [editorMode, setEditorMode] = useState<'loading' | 'legacy' | 'editor'>('loading');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Copy variable to clipboard with feedback
  const copyVariable = async (varName: string) => {
    const text = `{{${varName}}}`;
    await navigator.clipboard.writeText(text);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 1500);
  };

  // Check if this is a legacy template (has HTML but no Unlayer designJson)
  const isLegacyTemplate = !!(
    htmlContent &&
    htmlContent.trim().length > 0 &&
    (!designJson || !designJson.body)
  );

  // Set initial mode based on template state
  useEffect(() => {
    if (isLegacyTemplate) {
      setEditorMode('legacy');
    }
  }, []);

  // Convert variables to Unlayer merge tags format
  const mergeTags: Record<string, { name: string; value: string }> = {};
  variables.forEach((v) => {
    mergeTags[v.name] = {
      name: v.description || v.name,
      value: `{{${v.name}}}`,
    };
  });

  // Called when editor is ready
  const onReady: EmailEditorProps['onReady'] = () => {
    setIsReady(true);

    // Load existing design if available
    if (designJson && designJson.body) {
      emailEditorRef.current?.editor?.loadDesign(designJson as never);
      setEditorMode('editor');
    } else if (!isLegacyTemplate) {
      setEditorMode('editor');
    }
  };

  // Export design and HTML when changes occur
  const exportDesign = () => {
    if (!emailEditorRef.current?.editor) return;

    emailEditorRef.current.editor.exportHtml((data) => {
      const { design, html } = data;
      onDesignChange({
        designJson: design as Record<string, unknown>,
        htmlContent: html,
      });
    });
  };

  // Auto-export on changes (with debounce via useEffect)
  useEffect(() => {
    if (!isReady || !emailEditorRef.current?.editor) return;

    // Register for design updates
    const editor = emailEditorRef.current.editor;

    // Only export if we're in editor mode (not legacy)
    if (editorMode === 'editor') {
      exportDesign();
    }

    // Listen for changes - use type assertion for Unlayer's event API
    (editor as { addEventListener: (event: string, callback: () => void) => void }).addEventListener('design:updated', exportDesign);

    return () => {
      (editor as { removeEventListener: (event: string, callback: () => void) => void }).removeEventListener('design:updated', exportDesign);
    };
  }, [isReady, editorMode]);

  // Start fresh design (for legacy templates)
  const startFreshDesign = () => {
    setEditorMode('editor');
    // Export the empty/default design
    setTimeout(() => {
      exportDesign();
    }, 100);
  };

  return (
    <div className="h-[600px] relative flex flex-col">
      {/* Variables quick reference - click to copy (TOP) */}
      <div className="flex-shrink-0 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 p-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            Variables:
          </span>
          {variables.map((v) => (
            <button
              key={v.name}
              onClick={() => copyVariable(v.name)}
              className={`px-2 py-0.5 text-xs font-mono border rounded transition-all duration-200 flex items-center gap-1 ${
                copiedVar === v.name
                  ? 'bg-green-100 dark:bg-green-900/50 border-green-400 dark:border-green-600 text-green-700 dark:text-green-300'
                  : 'bg-white dark:bg-dark-bg-secondary border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50'
              }`}
              title={`${v.description} - Cliquez pour copier`}
            >
              {copiedVar === v.name ? (
                <>
                  <Check className="h-3 w-3" />
                  Copié!
                </>
              ) : (
                `{{${v.name}}}`
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Legacy template warning - shown immediately for legacy templates */}
      {editorMode === 'legacy' && (
        <div className="absolute inset-0 z-20 bg-white dark:bg-dark-bg-secondary flex items-center justify-center overflow-auto">
          <div className="max-w-md w-full p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white mb-2">
              Template HTML existant
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mb-4">
              Ce template utilise du HTML personnalisé qui ne peut pas être importé dans l'éditeur visuel.
            </p>

            {/* Preview of existing HTML */}
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto text-left">
              <pre className="text-xs text-gray-700 dark:text-dark-text-primary dark:text-gray-300 whitespace-pre-wrap break-words font-mono">
                {htmlContent?.substring(0, 300)}
                {(htmlContent?.length || 0) > 300 && '...'}
              </pre>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={startFreshDesign}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
              >
                <RefreshCw className="h-5 w-5" />
                Créer nouveau design visuel
              </button>
              <button
                onClick={() => {
                  const codeTab = document.querySelector('[data-tab="code"]') as HTMLButtonElement;
                  if (codeTab) codeTab.click();
                }}
                className="w-full px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
              >
                <Code className="h-5 w-5" />
                Modifier le HTML directement
              </button>
            </div>

            <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-3">
              Le HTML existant reste disponible dans l'onglet "Code"
            </p>
          </div>
        </div>
      )}

      {/* Unlayer Editor */}
      <div className="flex-1 min-h-0">
        <EmailEditor
          ref={emailEditorRef}
          onReady={onReady}
          minHeight="100%"
          options={{
            mergeTags,
            features: {
              textEditor: {
                tables: true,
                emojis: true,
              },
              stockImages: {
                enabled: false as const, // Disable to avoid external dependencies
              },
            },
            appearance: {
              theme: 'light',
              panels: {
                tools: {
                  dock: 'left',
                },
              },
            },
            tools: {
              // Enable standard tools
              text: { enabled: true },
              image: { enabled: true },
              button: { enabled: true },
              divider: { enabled: true },
              html: { enabled: true },
              heading: { enabled: true },
              menu: { enabled: false },
              social: { enabled: false },
              video: { enabled: false },
              timer: { enabled: false },
            },
            locale: 'fr-FR',
          }}
        />
      </div>
    </div>
  );
}

export default EmailTemplateVisualEditor;

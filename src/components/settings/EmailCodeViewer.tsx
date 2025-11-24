/**
 * Email Code Viewer
 * Displays HTML code with syntax highlighting
 */

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Props {
  html: string;
  className?: string;
}

export function EmailCodeViewer({ html, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      toast.success('Code copié dans le presse-papiers');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erreur lors de la copie');
    }
  };

  return (
    <div className={`relative h-full flex flex-col ${className}`}>
      {/* Header avec bouton copier */}
      <div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
        <span className="text-sm text-gray-300 font-mono">HTML Template</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copié
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copier
            </>
          )}
        </button>
      </div>

      {/* Code avec syntax highlighting */}
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          language="html"
          style={vscDarkPlus}
          showLineNumbers
          wrapLines
          customStyle={{
            margin: 0,
            borderRadius: 0,
            height: '100%',
            fontSize: '13px',
          }}
          codeTagProps={{
            style: {
              fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
            },
          }}
        >
          {html}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

/**
 * EditableEmailPreview Component
 * Renders email template with editable zones
 *
 * Shows static parts as read-only HTML and editable zones with RichTextEditor
 */

import React from 'react';
import DOMPurify from 'dompurify';
import { RichTextEditor } from './RichTextEditor';
import type { EditableZone } from '@/types/emailTemplates';
import { Edit3 } from 'lucide-react';

interface EditableEmailPreviewProps {
  staticParts: string[];
  zones: EditableZone[];
  onZoneChange: (zoneId: string, newContent: string) => void;
}

export function EditableEmailPreview({
  staticParts,
  zones,
  onZoneChange,
}: EditableEmailPreviewProps) {
  return (
    <div className="email-preview border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 px-3 py-2 border-b border-gray-300 dark:border-dark-border dark:border-gray-600">
        <span className="text-xs text-gray-500 dark:text-dark-text-muted">
          Aperçu du template (zones modifiables en bleu)
        </span>
      </div>

      {/* Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {staticParts.map((part, index) => (
          <React.Fragment key={`part-${index}`}>
            {/* Static HTML part (read-only) */}
            {part && (
              <div
                className="static-part"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(part) }}
              />
            )}

            {/* Editable zone (if exists at this position) */}
            {index < zones.length && (
              <div className="editable-zone my-3 border-2 border-blue-300 dark:border-blue-600 rounded-lg overflow-hidden bg-blue-50/30 dark:bg-blue-900/10">
                {/* Zone header */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-700">
                  <Edit3 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {zones[index].label}
                  </span>
                  <span className="text-xs text-blue-500 dark:text-blue-400">
                    (modifiable)
                  </span>
                </div>

                {/* Zone editor */}
                <div className="p-2">
                  <RichTextEditor
                    content={zones[index].content}
                    onChange={(html) => onZoneChange(zones[index].id, html)}
                    placeholder={`Contenu de "${zones[index].label}"...`}
                    compact={true}
                  />
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default EditableEmailPreview;

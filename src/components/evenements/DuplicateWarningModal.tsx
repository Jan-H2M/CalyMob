import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Evenement } from '@/types';
import { formatDate } from '@/utils/utils';
import { Timestamp } from 'firebase/firestore';

interface DuplicateInfo {
  filename: string;
  existingEvent: Evenement;
}

interface DuplicateWarningModalProps {
  duplicates: DuplicateInfo[];
  totalFiles: number;
  onCancel: () => void;
  onConfirm: () => void;
}

// Helper pour convertir Timestamp Firestore en Date
function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.toDate && typeof value.toDate === 'function') {
    return value.toDate(); // Firestore Timestamp
  }
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

export function DuplicateWarningModal({
  duplicates,
  totalFiles,
  onCancel,
  onConfirm
}: DuplicateWarningModalProps) {
  const newFilesCount = totalFiles - duplicates.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header avec fond orange */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-dark-bg-secondary/20 rounded-lg">
              <AlertTriangle className="h-7 w-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                ⚠️ ATTENTION : DOUBLON{duplicates.length > 1 ? 'S' : ''} DÉTECTÉ{duplicates.length > 1 ? 'S' : ''}
              </h2>
              <p className="text-orange-100 text-sm mt-0.5">
                {duplicates.length} fichier{duplicates.length > 1 ? 's' : ''} semble{duplicates.length === 1 ? '' : 'nt'} déjà importé{duplicates.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white dark:bg-dark-bg-secondary/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Liste des doublons */}
          <div className="space-y-4 mb-6">
            {duplicates.map((dup, index) => (
              <div
                key={index}
                className="border-2 border-orange-200 bg-orange-50 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-dark-text-primary mb-2 flex items-center gap-2">
                      <span className="text-orange-600">📄</span>
                      {dup.filename}
                    </div>
                    <div className="space-y-1 text-sm text-gray-700 dark:text-dark-text-primary">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">→ Événement existant :</span>
                        <span className="font-semibold">{dup.existingEvent.titre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">→ Date :</span>
                        <span>{formatDate(toDate(dup.existingEvent.date_debut))}</span>
                      </div>
                      {dup.existingEvent.lieu && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">→ Lieu :</span>
                          <span>{dup.existingEvent.lieu}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium">→ Importé le :</span>
                        <span>{formatDate(toDate(dup.existingEvent.created_at))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Résumé */}
          {newFilesCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 text-sm">ℹ️</span>
                <div className="text-sm text-blue-800">
                  <span className="font-semibold">{newFilesCount} fichier{newFilesCount > 1 ? 's' : ''} nouveau{newFilesCount > 1 ? 'x' : ''}</span>
                  {' '}ser{newFilesCount === 1 ? 'a' : 'ont'} également importé{newFilesCount > 1 ? 's' : ''} si vous continuez.
                </div>
              </div>
            </div>
          )}

          {/* Grand avertissement */}
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-orange-600 flex-shrink-0" />
              <p className="text-base font-semibold text-orange-900">
                ⚠️ Importer à nouveau créera des événements en doublon dans votre base de données.
              </p>
            </div>
          </div>

          {/* Message de confirmation */}
          <p className="text-center text-gray-700 dark:text-dark-text-primary font-medium mt-6 mb-2">
            Voulez-vous vraiment continuer l'import ?
          </p>
        </div>

        {/* Footer avec boutons */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-dark-bg-tertiary border-t border-gray-200 dark:border-dark-border flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary font-semibold rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold rounded-lg hover:from-orange-600 hover:to-orange-700 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <AlertTriangle className="h-5 w-5" />
            Importer quand même
          </button>
        </div>
      </div>
    </div>
  );
}

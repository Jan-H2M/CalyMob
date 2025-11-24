import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Trash2, 
  CheckCircle,
  AlertCircle,
  Loader2 
} from 'lucide-react';
import { cn } from '@/utils/utils';

export interface ImportProgress {
  currentFile: number;
  totalFiles: number;
  currentFileName: string;
  imported: number;
  duplicates: number;
  errors: number;
}

interface MultiFileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (files: File[], onProgress?: (progress: ImportProgress) => void) => Promise<void>;
  acceptedFormats?: string;
  title?: string;
}

export function MultiFileImportModal({
  isOpen,
  onClose,
  onImport,
  acceptedFormats = '.csv',
  title = 'Importer des fichiers'
}: MultiFileImportModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFiles = files.filter(file => file.name.toLowerCase().endsWith('.csv'));
    
    if (csvFiles.length !== files.length) {
      alert('Seuls les fichiers CSV sont acceptés');
    }
    
    addFiles(csvFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    setSelectedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name));
      return [...prev, ...uniqueNewFiles];
    });
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0) return;

    setIsImporting(true);
    setProgress({
      currentFile: 0,
      totalFiles: selectedFiles.length,
      currentFileName: '',
      imported: 0,
      duplicates: 0,
      errors: 0
    });

    try {
      await onImport(selectedFiles, (progressUpdate) => {
        setProgress(progressUpdate);
      });
      setSelectedFiles([]);
      setProgress(null);
      onClose();
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
              disabled={isImporting}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Instructions */}
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Instructions:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Glissez-déposez vos fichiers CSV ou cliquez pour les sélectionner</li>
                  <li>Vous pouvez ajouter plusieurs fichiers en une fois</li>
                  <li>Les doublons seront automatiquement détectés et ignorés</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
              isDragging 
                ? "border-calypso-blue bg-blue-50" 
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <Upload className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
            <p className="text-gray-700 dark:text-dark-text-primary font-medium mb-1">
              {isDragging ? "Déposez les fichiers ici" : "Glissez-déposez vos fichiers CSV ici"}
            </p>
            <p className="text-gray-500 dark:text-dark-text-muted text-sm">
              ou <span className="text-calypso-blue font-medium">parcourez</span> pour sélectionner
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedFormats}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">
                  Fichiers sélectionnés ({selectedFiles.length})
                </h3>
                <button
                  onClick={() => setSelectedFiles([])}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Tout supprimer
                </button>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedFiles.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(file.name);
                      }}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-dark-border">
          {/* Progress display during import */}
          {isImporting && progress && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-blue-900">
                  Fichier {progress.currentFile}/{progress.totalFiles}
                </span>
                <span className="text-blue-700">
                  {Math.round((progress.currentFile / progress.totalFiles) * 100)}%
                </span>
              </div>

              {progress.currentFileName && (
                <div className="text-xs text-blue-800 truncate">
                  En cours: {progress.currentFileName}
                </div>
              )}

              {/* Progress bar */}
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${(progress.currentFile / progress.totalFiles) * 100}%` }}
                />
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white dark:bg-dark-bg-secondary rounded px-2 py-1">
                  <div className="text-gray-600 dark:text-dark-text-secondary">Importé</div>
                  <div className="font-bold text-green-600">{progress.imported}</div>
                </div>
                <div className="bg-white dark:bg-dark-bg-secondary rounded px-2 py-1">
                  <div className="text-gray-600 dark:text-dark-text-secondary">Doublons</div>
                  <div className="font-bold text-amber-600">{progress.duplicates}</div>
                </div>
                <div className="bg-white dark:bg-dark-bg-secondary rounded px-2 py-1">
                  <div className="text-gray-600 dark:text-dark-text-secondary">Erreurs</div>
                  <div className="font-bold text-red-600">{progress.errors}</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleImport}
              disabled={selectedFiles.length === 0 || isImporting}
              className="flex-1 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Import en cours...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Importer {selectedFiles.length} fichier{selectedFiles.length > 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { MemberService } from '@/services/memberService';
import { ImportResult } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'upload' | 'preview' | 'mapping' | 'importing' | 'result';

export function MembreImportModal({ isOpen, onClose, onImportComplete }: Props) {
  const { clubId } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: any[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const requiredFields = [
    { key: 'nom', label: 'Nom', required: true },
    { key: 'prenom', label: 'Prénom', required: true },
    { key: 'email', label: 'Email', required: true }
  ];

  const optionalFields = [
    { key: 'telephone', label: 'Téléphone', required: false },
    { key: 'niveau_plongee', label: 'Niveau plongée', required: false },
    { key: 'licence_lifras', label: 'Licence LIFRAS', required: false },
    { key: 'date_adhesion', label: 'Date adhésion', required: false },
    { key: 'statut', label: 'Statut', required: false }
  ];

  const allFields = [...requiredFields, ...optionalFields];

  if (!isOpen) return null;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Vérifier l'extension
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Format de fichier invalide. Utilisez un fichier Excel (.xlsx ou .xls)');
      return;
    }

    setFile(selectedFile);

    try {
      // Prévisualiser le fichier
      const preview = await MemberService.previewImport(selectedFile);
      setPreviewData(preview);

      // Auto-détection des colonnes
      const autoMapping = autoDetectMapping(preview.columns);
      setColumnMapping(autoMapping);

      setStep('preview');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la lecture du fichier');
      console.error('Erreur preview:', error);
    }
  };

  const autoDetectMapping = (columns: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};

    const detectColumn = (field: string, patterns: string[]) => {
      const col = columns.find(c =>
        patterns.some(p => c.toLowerCase().includes(p.toLowerCase()))
      );
      if (col) mapping[field] = col;
    };

    detectColumn('nom', ['nom', 'name', 'last']);
    detectColumn('prenom', ['prenom', 'prénom', 'first']);
    detectColumn('email', ['email', 'e-mail', 'mail']);
    detectColumn('telephone', ['tel', 'phone', 'gsm']);
    detectColumn('niveau_plongee', ['niveau', 'level', 'brevet']);
    detectColumn('licence_lifras', ['lifras', 'licence', 'febras']);
    detectColumn('date_adhesion', ['adhesion', 'adhésion', 'date']);
    detectColumn('statut', ['statut', 'status', 'état']);

    return mapping;
  };

  const handleImport = async () => {
    if (!clubId || !file) return;

    // Vérifier que les champs obligatoires sont mappés
    const missingRequired = requiredFields.filter(f => !columnMapping[f.key]);
    if (missingRequired.length > 0) {
      toast.error(`Champs obligatoires manquants: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }

    setStep('importing');
    setImporting(true);

    try {
      const result = await MemberService.importMembersFromXLS(clubId, file, columnMapping);
      setImportResult(result);
      setStep('result');

      if (result.success) {
        toast.success(`Import réussi: ${result.added} membres ajoutés`);
        onImportComplete();
      } else {
        toast.warning(`Import terminé avec ${result.errors.length} erreur(s)`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'import');
      console.error('Erreur import:', error);
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setPreviewData(null);
    setColumnMapping({});
    setImportResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
              Importer des membres
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text-primary"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                  <Upload className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                  Sélectionnez un fichier Excel
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-6">
                  Formats acceptés: .xlsx, .xls (max 10 Mo)
                </p>

                <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                  <Upload className="h-5 w-5" />
                  <span>Choisir un fichier</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Format du fichier Excel
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <li>• <strong>Colonnes obligatoires:</strong> Nom, Prénom, Email</li>
                  <li>• <strong>Colonnes optionnelles:</strong> Téléphone, Niveau plongée, Licence LIFRAS, Date adhésion, Statut</li>
                  <li>• La première ligne doit contenir les en-têtes de colonnes</li>
                  <li>• Les doublons (même email) seront ignorés</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && previewData && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                  Prévisualisation (5 premières lignes)
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
                  Fichier: {file?.name}
                </p>

                <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                    <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                      <tr>
                        {previewData.columns.map((col, i) => (
                          <th key={i} className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                      {previewData.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell: any, j: number) => (
                            <td key={j} className="px-4 py-2 text-sm text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                              {cell || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mapping */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">
                  Correspondance des colonnes
                </h3>

                <div className="space-y-3">
                  {allFields.map((field) => (
                    <div key={field.key} className="flex items-center gap-4">
                      <div className="w-48">
                        <label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                      <select
                        value={columnMapping[field.key] || ''}
                        onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                      >
                        <option value="">-- Ignorer --</option>
                        {previewData.columns.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                Import en cours...
              </h3>
              <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
                Veuillez patienter pendant l'importation des membres
              </p>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && importResult && (
            <div className="space-y-6">
              <div className="text-center">
                {importResult.success ? (
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                ) : (
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full mb-4">
                    <AlertCircle className="h-8 w-8 text-yellow-600" />
                  </div>
                )}

                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                  {importResult.success ? 'Import terminé avec succès' : 'Import terminé avec des erreurs'}
                </h3>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.added}</div>
                  <div className="text-sm text-green-800 dark:text-green-300">Ajoutés</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                  <div className="text-sm text-blue-800 dark:text-blue-300">Mis à jour</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600">{importResult.skipped}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300">Ignorés</div>
                </div>
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                    Erreurs ({importResult.errors.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto border border-red-200 dark:border-red-800 rounded-lg">
                    <table className="min-w-full divide-y divide-red-200 dark:divide-red-800">
                      <thead className="bg-red-50 dark:bg-red-900/20">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-red-900 dark:text-red-200">Ligne</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-red-900 dark:text-red-200">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-200 dark:divide-red-800">
                        {importResult.errors.map((error, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-sm text-red-900 dark:text-red-200">{error.row}</td>
                            <td className="px-4 py-2 text-sm text-red-800 dark:text-red-300">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-dark-border">
          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
              >
                Retour
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !requiredFields.every(f => columnMapping[f.key])}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Importer
              </button>
            </>
          )}

          {step === 'result' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

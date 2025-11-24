import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Users } from 'lucide-react';
import { Membre } from '@/types';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDocs, query, where, writeBatch, updateDoc } from 'firebase/firestore';

// Type pour le résultat du parsing (compatible avec ancien MembreParseResult)
interface MembreParseResult {
  membres: Membre[];
  success_count: number;
  error_count: number;
  duplicate_count: number;
  errors: string[];
}

interface MembreImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  onImportComplete?: (count: number) => void;
}

export function MembreImportModal({ isOpen, onClose, clubId, onImportComplete }: MembreImportModalProps) {
  const [parseResult, setParseResult] = useState<MembreParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier extension
    if (!file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      toast.error('Format invalide. Veuillez sélectionner un fichier Excel (.xls ou .xlsx)');
      return;
    }

    setIsProcessing(true);
    toast.loading('Envoi du fichier au serveur...');

    try {
      // Convert file to base64
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];

          toast.loading('Analyse du fichier Excel...');

          // Send to serverless function
          const response = await fetch('/api/parse-members-excel', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileData: base64,
              fileName: file.name
            })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Erreur serveur');
          }

          // Map API response to expected format
          const result: MembreParseResult = {
            membres: data.members,
            success_count: data.stats.parsed,
            error_count: data.stats.errors,
            duplicate_count: 0, // Duplicates will be detected during import
            errors: data.errors || []
          };

          setParseResult(result);

          toast.dismiss();

          if (result.success_count > 0) {
            toast.success(`${result.success_count} membres trouvés dans le fichier`);
          }

          if (result.error_count > 0) {
            toast.error(`${result.error_count} erreurs détectées`);
          }

        } catch (error) {
          toast.dismiss();
          toast.error('Erreur lors de l\'analyse du fichier');
          console.error('Parse error:', error);
        } finally {
          setIsProcessing(false);
        }
      };

      reader.onerror = () => {
        toast.dismiss();
        toast.error('Erreur lors de la lecture du fichier');
        setIsProcessing(false);
      };

      reader.readAsDataURL(file);

    } catch (error) {
      toast.dismiss();
      toast.error('Erreur lors de la lecture du fichier');
      console.error('File read error:', error);
      setIsProcessing(false);
    }
  };

  // Helper: Deep equality check
  const isEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return false;

    // Handle dates
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    // Handle Firestore Timestamps
    if (a?.toDate && b?.toDate) {
      return a.toDate().getTime() === b.toDate().getTime();
    }

    return false;
  };

  // Helper: Calculer les changements entre existing et updated
  const calculateChanges = (existing: any, updated: any): Record<string, any> => {
    const editableFields = [
      'nom', 'prenom', 'email', 'adresse', 'code_postal', 'localite',
      'pays', 'telephone', 'phoneNumber', 'gsm', 'ice',
      'certificat_medical_date', 'certificat_medical_validite',
      'date_naissance', 'newsletter', 'niveau_plongee', 'niveau_plongeur',
      'nr_febras', 'displayName', 'lifras_id' // ✅ Add lifras_id to editable fields
    ];

    const changes: Record<string, any> = {};

    for (const field of editableFields) {
      const oldVal = existing[field];
      const newVal = updated[field];

      // Compare values (handle nulls, undefined, dates)
      if (newVal !== undefined && !isEqual(oldVal, newVal)) {
        changes[field] = newVal;
      }
    }

    // Update calculated fields if relevant
    if (changes.niveau_plongee !== undefined) {
      changes.is_diver = !!changes.niveau_plongee;
    }
    if (changes.lifras_id !== undefined) {
      changes.has_lifras = !!changes.lifras_id;
    }
    if (changes.prenom !== undefined || changes.nom !== undefined) {
      changes.displayName = `${updated.prenom} ${updated.nom}`;
    }

    return changes;
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.membres.length === 0) return;

    setIsProcessing(true);
    toast.loading('Analyse des membres...');

    try {
      const membresRef = collection(db, 'clubs', clubId, 'members');

      // ========== ÉTAPE 1: ANALYSE ==========
      // Récupérer TOUS les membres existants
      const existingSnapshot = await getDocs(membresRef);
      const existingByLifrasId = new Map();
      const existingByEmail = new Map();
      const existingByNameKey = new Map();

      existingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const docData = { id: doc.id, ...data };

        // Index par LifrasID
        if (data.lifras_id) {
          existingByLifrasId.set(data.lifras_id, docData);
        }

        // Index par email (case-insensitive, skip placeholders)
        if (data.email && !data.email.includes('@no-email.local')) {
          const emailKey = data.email.toLowerCase().trim();
          existingByEmail.set(emailKey, docData);
        }

        // Index par nom+prenom (case-insensitive)
        if (data.nom && data.prenom) {
          const nameKey = `${data.nom.toLowerCase().trim()}_${data.prenom.toLowerCase().trim()}`;
          existingByNameKey.set(nameKey, docData);
        }
      });

      // Excel LifrasIDs
      const excelLifrasIds = new Set(parseResult.membres.map(m => m.lifras_id));

      // Classifier les membres
      const toAdd = [];
      const toUpdate = [];
      const toDeactivate = [];
      const protectedMembers = [];
      const skippedDuplicates = [];
      const needsConfirmation = [];

      // Analyser les membres du fichier Excel
      for (const membre of parseResult.membres) {
        // DUPLICAAT DETECTIE (priorité: email > nom+prenom > lifrasId)
        let existing = null;
        let matchReason = '';

        // 1. Check email (prioriteit 1)
        if (membre.email && !membre.email.includes('@no-email.local')) {
          const emailKey = membre.email.toLowerCase().trim();
          if (existingByEmail.has(emailKey)) {
            existing = existingByEmail.get(emailKey);
            matchReason = 'email';
          }
        }

        // 2. Check nom+prenom (prioriteit 2) - alleen als geen email match
        if (!existing && membre.nom && membre.prenom) {
          const nameKey = `${membre.nom.toLowerCase().trim()}_${membre.prenom.toLowerCase().trim()}`;
          if (existingByNameKey.has(nameKey)) {
            existing = existingByNameKey.get(nameKey);
            matchReason = 'nom+prenom';
          }
        }

        // 3. Check LifrasID (prioriteit 3) - alleen als geen andere match
        if (!existing && membre.lifras_id) {
          if (existingByLifrasId.has(membre.lifras_id)) {
            existing = existingByLifrasId.get(membre.lifras_id);
            matchReason = 'lifras_id';
          }
        }

        if (!existing) {
          // Nouveau membre - aucun duplicaat
          toAdd.push(membre);
        } else {
          // Membre existe - duplicaat gevonden

          // PROTECTION: Ne pas toucher aux membres avec app access
          if (existing.has_app_access === true) {
            protectedMembers.push({
              ...existing,
              matchReason,
              excelData: membre
            });
            continue;
          }

          // Check if this is a potential issue (different LifrasID but same email/name)
          if (matchReason !== 'lifras_id' && existing.lifras_id !== membre.lifras_id) {
            // MERGE: Member bestaat (via email/naam) maar heeft geen of ander LifrasID
            // → Update bestaande member met LifrasID uit Excel + alle andere data

            const changes = calculateChanges(existing, membre);

            // Altijd LifrasID toevoegen/updaten bij merge
            if (!existing.lifras_id || existing.lifras_id !== membre.lifras_id) {
              changes.lifras_id = membre.lifras_id;
              changes.has_lifras = true;
            }

            if (Object.keys(changes).length > 0) {
              toUpdate.push({
                id: existing.id,
                lifras_id: membre.lifras_id,
                nom: membre.nom,
                prenom: membre.prenom,
                changes,
                matchReason,
                isMerge: true // Flag pour confirmation message
              });
            }

            // Log merge voor tracking
            needsConfirmation.push({
              existing,
              excelData: membre,
              matchReason,
              action: 'merge',
              issue: `MERGE via ${matchReason}: "${membre.email || membre.nom + ' ' + membre.prenom}" - LifrasID ${existing.lifras_id || 'geen'} → ${membre.lifras_id}`
            });

            continue;
          }

          // Calculer les changements (seulement champs éditables)
          const changes = calculateChanges(existing, membre);
          if (Object.keys(changes).length > 0) {
            toUpdate.push({
              id: existing.id,
              lifras_id: membre.lifras_id,
              nom: membre.nom,
              prenom: membre.prenom,
              changes,
              matchReason
            });
          } else {
            skippedDuplicates.push({
              ...existing,
              matchReason
            });
          }
        }
      }

      // Trouver les membres à désactiver (dans Firestore mais PAS dans Excel)
      for (const [lifrasId, existing] of existingByLifrasId.entries()) {
        // Ne désactiver que les membres sans app access
        if (!excelLifrasIds.has(lifrasId) && existing.has_app_access !== true && existing.member_status === 'active') {
          toDeactivate.push(existing);
        }
      }

      toast.dismiss();

      // ========== ÉTAPE 2: CONFIRMATION ==========

      // Si il y a des merges, demander confirmation
      if (needsConfirmation.length > 0) {
        console.info('🔀 Merges détectés:', needsConfirmation);

        const mergeMsg = needsConfirmation
          .map(c => `  • ${c.issue}`)
          .join('\n');

        const shouldContinue = window.confirm(
          `🔀 ${needsConfirmation.length} MERGE(S) DÉTECTÉ(S)\n\n` +
          `Ces membres existent déjà (via email/nom) et recevront leur LifrasID:\n\n` +
          mergeMsg +
          `\n\nLes données existantes seront préservées et complétées avec les infos du fichier Excel.\n\n` +
          `Continuer?`
        );

        if (!shouldContinue) {
          toast.info('Import annulé');
          setIsProcessing(false);
          return;
        }
      }

      // Compter les merges dans toUpdate
      const mergeCount = toUpdate.filter(u => u.isMerge).length;
      const normalUpdateCount = toUpdate.length - mergeCount;

      const confirmed = window.confirm(
        `CONFIRMATION IMPORT\n\n` +
        `✅ Ajouter: ${toAdd.length} nouveaux membres\n` +
        `🔄 Mettre à jour: ${normalUpdateCount} membres\n` +
        `🔀 Merger (+ LifrasID): ${mergeCount} membres\n` +
        `⏭️ Ignorés (déjà identiques): ${skippedDuplicates.length} membres\n` +
        `⏸️ Désactiver: ${toDeactivate.length} membres (non présents dans Excel)\n` +
        `🔒 Protégés: ${protectedMembers.length} membres (ont accès app)\n\n` +
        `Continuer l'import?`
      );

      if (!confirmed) {
        toast.info('Import annulé');
        setIsProcessing(false);
        return;
      }

      // ========== ÉTAPE 3: EXÉCUTION ==========
      toast.loading('Import en cours...');
      const totalOps = toAdd.length + toUpdate.length + toDeactivate.length;
      let completedOps = 0;

      // Utiliser writeBatch pour performance (max 500 ops par batch)
      let batch = writeBatch(db);
      let batchCount = 0;

      // ADD nouveaux membres
      for (const membre of toAdd) {
        const ref = doc(membresRef, membre.id);

        // Firestore ne supporte pas les valeurs undefined - les filtrer
        const membreData = {
          ...membre,
          clubId: clubId,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const cleanedData = Object.fromEntries(
          Object.entries(membreData).filter(([_, value]) => value !== undefined)
        );

        batch.set(ref, cleanedData);

        batchCount++;
        completedOps++;

        if (batchCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          setImportProgress({ current: completedOps, total: totalOps });
        }
      }

      // UPDATE membres existants
      for (const membre of toUpdate) {
        const ref = doc(membresRef, membre.id);
        batch.update(ref, {
          ...membre.changes,
          updatedAt: new Date()
        });

        batchCount++;
        completedOps++;

        if (batchCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          setImportProgress({ current: completedOps, total: totalOps });
        }
      }

      // DEACTIVATE membres manquants
      for (const membre of toDeactivate) {
        const ref = doc(membresRef, membre.id);
        batch.update(ref, {
          member_status: 'inactive',
          'metadata.deactivatedBy': 'excel_import',
          'metadata.deactivatedAt': new Date(),
          updatedAt: new Date()
        });

        batchCount++;
        completedOps++;

        if (batchCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          setImportProgress({ current: completedOps, total: totalOps });
        }
      }

      // Commit final batch
      if (batchCount > 0) {
        await batch.commit();
      }

      toast.dismiss();
      toast.success(
        `Import terminé !\n` +
        `✅ ${toAdd.length} ajoutés\n` +
        `🔄 ${toUpdate.length} mis à jour\n` +
        `⏸️ ${toDeactivate.length} désactivés`,
        { duration: 5000 }
      );

      if (onImportComplete) {
        onImportComplete(toAdd.length);
      }

      // Reset et fermer
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('Import error:', error);
      toast.dismiss();
      toast.error('Erreur lors de l\'import des membres');
    } finally {
      setIsProcessing(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleClose = () => {
    setParseResult(null);
    setImportProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">Import Membres</h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">Importer depuis Excel (iClubSport format)</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
            disabled={isProcessing}
          >
            <X className="w-5 h-5 text-gray-500 dark:text-dark-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Upload Section */}
          {!parseResult && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="membre-excel-upload"
                  disabled={isProcessing}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-blue-50 rounded-full">
                    <FileSpreadsheet className="w-12 h-12 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                      Sélectionner fichier Excel
                    </p>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
                      Format iClubSport (.xls ou .xlsx)
                    </p>
                  </div>
                  <label
                    htmlFor="membre-excel-upload"
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Parcourir
                  </label>
                </div>
              </div>

              {/* Instructions iClubSport */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm font-medium text-teal-900 mb-2">📋 Comment obtenir le fichier Excel ?</p>
                <ol className="text-xs text-teal-700 space-y-1.5 list-decimal list-inside">
                  <li>Va sur <a href="https://www9.iclub.be" target="_blank" rel="noopener noreferrer" className="underline hover:text-teal-900">www9.iclub.be</a></li>
                  <li>Connecte-toi à ton compte Gemini Lifras</li>
                  <li>Ouvre le menu <strong>Clubs → Liste des membres du club</strong></li>
                  <li>Clique sur <strong>Export XLS</strong> en haut à droite pour télécharger le fichier</li>
                </ol>
              </div>
            </div>
          )}

          {/* Preview Section */}
          {parseResult && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Réussis</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{parseResult.success_count}</p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm font-medium text-red-900">Erreurs</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{parseResult.error_count}</p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-900">Doublons</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-600">{parseResult.duplicate_count}</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 dark:bg-dark-bg-tertiary sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">LifrasID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Nom</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Prénom</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">GSM</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Localité</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200">
                      {parseResult.membres.slice(0, 50).map((membre) => (
                        <tr key={membre.id} className="hover:bg-gray-50 dark:bg-dark-bg-tertiary">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">{membre.lifras_id}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">{membre.nom}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">{membre.prenom}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-text-secondary">{membre.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-text-secondary">{membre.gsm || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-text-secondary">{membre.localite || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parseResult.membres.length > 50 && (
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-4 py-2 text-sm text-gray-500 dark:text-dark-text-muted text-center border-t">
                    Affichage de 50/{parseResult.membres.length} membres
                  </div>
                )}
              </div>

              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-red-900 mb-2">Erreurs détectées :</p>
                  <ul className="space-y-1 text-xs text-red-700">
                    {parseResult.errors.slice(0, 20).map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                    {parseResult.errors.length > 20 && (
                      <li className="text-red-500">... et {parseResult.errors.length - 20} autres erreurs</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {importProgress.total > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
                <span>Import en cours...</span>
                <span>{importProgress.current}/{importProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50 dark:bg-dark-bg-tertiary">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 rounded-lg transition-colors"
            disabled={isProcessing}
          >
            Annuler
          </button>

          {parseResult && (
            <button
              onClick={() => {
                setParseResult(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              disabled={isProcessing}
            >
              Changer fichier
            </button>
          )}

          {parseResult && parseResult.success_count > 0 && (
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing}
            >
              <Upload className="w-4 h-4 inline mr-2" />
              Importer {parseResult.success_count} membres
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

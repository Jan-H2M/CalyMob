import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { getFirstName, getLastName, UserOrMembre } from '@/utils/fieldMapper';
import { MembreExcelParser } from '@/services/membreExcelParser';
import { checkDuplicateName } from '@/services/membreService';
import { logger } from '@/utils/logger';

interface MembreImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  onImportComplete?: (count: number) => void;
}

export function MembreImportModal({ isOpen, onClose, clubId, onImportComplete }: MembreImportModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, phase: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
      'nom', 'prenom', 'email', 'adresse',
      'telephone', 'phoneNumber', 'gsm',
      'date_naissance', 'sexe',
      'displayName', 'lifras_id'
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
    if (changes.lifras_id !== undefined) {
      changes.has_lifras = !!changes.lifras_id;
    }
    if (changes.prenom !== undefined || changes.nom !== undefined) {
      const firstName = getFirstName(updated) || '';
      const lastName = getLastName(updated) || '';
      changes.displayName = `${firstName} ${lastName}`.trim();
    }

    return changes;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier extension
    if (!file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      toast.error('Format invalide. Veuillez sélectionner un fichier Excel (.xls ou .xlsx)');
      return;
    }

    // Lancer l'import directement
    await handleImport(file);
  };

  const handleImport = async (file: File) => {
    setIsProcessing(true);
    setImportProgress({ current: 0, total: 0, phase: 'Analyse du fichier...' });

    try {
      // 1. Parser le fichier Excel
      const parseResult = await MembreExcelParser.parseFile(file);

      if (parseResult.success_count === 0) {
        toast.error('Aucun membre valide trouvé dans le fichier');
        setIsProcessing(false);
        return;
      }

      setImportProgress({ current: 0, total: 0, phase: 'Chargement des membres existants...' });

      const membresRef = collection(db, 'clubs', clubId, 'members');

      // 2. Récupérer TOUS les membres existants
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
        const lastName = getLastName(data as UserOrMembre);
        const firstName = getFirstName(data as UserOrMembre);
        if (lastName && firstName) {
          const nameKey = `${lastName.toLowerCase().trim()}_${firstName.toLowerCase().trim()}`;
          existingByNameKey.set(nameKey, docData);
        }
      });

      // Classifier les membres
      const toAdd: any[] = [];
      const toUpdate: any[] = [];
      const matchedExistingIds = new Set<string>(); // Track alle gematchte leden

      setImportProgress({ current: 0, total: parseResult.membres.length, phase: 'Analyse des différences...' });

      // Analyser les membres du fichier Excel
      for (const membre of parseResult.membres) {
        let existing = null;
        let matchReason = '';

        // 1. Check email (priorité 1)
        if (membre.email && !membre.email.includes('@no-email.local')) {
          const emailKey = membre.email.toLowerCase().trim();
          if (existingByEmail.has(emailKey)) {
            existing = existingByEmail.get(emailKey);
            matchReason = 'email';
          }
        }

        // 2. Check nom+prenom (priorité 2)
        const membreLastName = getLastName(membre);
        const membreFirstName = getFirstName(membre);
        if (!existing && membreLastName && membreFirstName) {
          const nameKey = `${membreLastName.toLowerCase().trim()}_${membreFirstName.toLowerCase().trim()}`;
          if (existingByNameKey.has(nameKey)) {
            existing = existingByNameKey.get(nameKey);
            matchReason = 'nom+prenom';
          }
        }

        // 3. Check LifrasID (priorité 3)
        if (!existing && membre.lifras_id) {
          if (existingByLifrasId.has(membre.lifras_id)) {
            existing = existingByLifrasId.get(membre.lifras_id);
            matchReason = 'lifras_id';
          }
        }

        if (!existing) {
          // Nouveau membre
          toAdd.push(membre);
        } else {
          // Track dat dit lid in de Excel lijst staat
          matchedExistingIds.add(existing.id);
          console.log(`[IMPORT] Match: Excel "${getLastName(membre)} ${getFirstName(membre)}" → DB "${existing.nom || existing.lastName}" (id: ${existing.id}, via ${matchReason})`);

          // Membre existe - calculer les changements
          const changes = calculateChanges(existing, membre);

          // Altijd member_status = active zetten (want in de Excel = actief)
          changes.member_status = 'active';

          // Si match par email/nom maar LifrasID verschilt → merge
          if (matchReason !== 'lifras_id' && existing.lifras_id !== membre.lifras_id) {
            if (!existing.lifras_id || existing.lifras_id !== membre.lifras_id) {
              changes.lifras_id = membre.lifras_id;
              changes.has_lifras = true;
            }
          }

          toUpdate.push({ id: existing.id, changes, isMerge: matchReason !== 'lifras_id' });
        }
      }

      // NIEUWE AANPAK: Tel hoeveel er gedeactiveerd worden
      // = alle bestaande leden die NIET in de Excel staan
      const toDeactivateCount = existingSnapshot.docs.filter(doc => !matchedExistingIds.has(doc.id)).length;

      // Vérifier les doublons potentiels pour les nouveaux membres via Firestore query
      setImportProgress({ current: 0, total: toAdd.length, phase: 'Vérification des doublons...' });
      const potentialDuplicates: Array<{ newMember: any; existingMember: any }> = [];

      for (let i = 0; i < toAdd.length; i++) {
        const membre = toAdd[i];
        const lastName = getLastName(membre);
        const firstName = getFirstName(membre);

        if (lastName && firstName) {
          const existingDuplicate = await checkDuplicateName(clubId, lastName, firstName);
          if (existingDuplicate) {
            potentialDuplicates.push({
              newMember: membre,
              existingMember: existingDuplicate
            });
          }
        }

        if (i % 10 === 0) {
          setImportProgress({ current: i, total: toAdd.length, phase: 'Vérification des doublons...' });
        }
      }

      // Si des doublons sont détectés, demander confirmation explicite
      if (potentialDuplicates.length > 0) {
        const duplicateList = potentialDuplicates
          .slice(0, 10) // Montrer max 10 pour lisibilité
          .map(d => `• ${getFirstName(d.newMember)} ${getLastName(d.newMember)}`)
          .join('\n');

        const moreText = potentialDuplicates.length > 10
          ? `\n... et ${potentialDuplicates.length - 10} autre(s)`
          : '';

        const skipDuplicates = window.confirm(
          `⚠️ DOUBLONS DÉTECTÉS\n\n` +
          `${potentialDuplicates.length} membre(s) existent déjà avec le même nom:\n\n` +
          `${duplicateList}${moreText}\n\n` +
          `Cliquer OK pour IGNORER ces doublons et continuer l'import.\n` +
          `Cliquer Annuler pour arrêter l'import.`
        );

        if (!skipDuplicates) {
          toast('Import annulé - vérifiez les doublons', { icon: '⚠️' });
          setIsProcessing(false);
          return;
        }

        // Retirer les doublons de la liste toAdd
        const duplicateIds = new Set(potentialDuplicates.map(d => d.newMember.id));
        const filteredToAdd = toAdd.filter(m => !duplicateIds.has(m.id));
        toAdd.length = 0;
        toAdd.push(...filteredToAdd);
      }

      // 3. Demander confirmation
      const confirmed = window.confirm(
        `CONFIRMATION IMPORT\n\n` +
        `📊 ${parseResult.success_count} membres dans le fichier Excel\n` +
        `📋 ${existingSnapshot.docs.length} membres existants en base\n\n` +
        `✅ Ajouter: ${toAdd.length} nouveaux membres\n` +
        `🔄 Mettre à jour: ${toUpdate.length} membres existants (→ actif)\n` +
        `⏸️ Désactiver: ${toDeactivateCount} membres (absents du fichier)\n\n` +
        `MÉTHODE: D'abord TOUS mis en inactif, puis ceux de l'Excel réactivés.\n\n` +
        `Continuer l'import?`
      );

      if (!confirmed) {
        toast('Import annulé', { icon: 'ℹ️' });
        setIsProcessing(false);
        return;
      }

      // 4. Exécuter l'import - NIEUWE AANPAK:
      // STAP 1: Eerst IEDEREEN op inactive zetten
      // STAP 2: Dan Excel-leden activeren + nieuwe toevoegen
      const totalOps = existingSnapshot.docs.length + toAdd.length + toUpdate.length;
      setImportProgress({ current: 0, total: totalOps, phase: 'Stap 1: Alle leden op inactief zetten...' });

      let batch = writeBatch(db);
      let batchCount = 0;
      let completedOps = 0;
      let deactivatedCount = 0;

      // STAP 1: Zet ALLE bestaande leden op inactive
      // BELANGRIJK: Ook legacy velden resetten zodat isActive() correct werkt!
      console.log(`[IMPORT] Stap 1: ${existingSnapshot.docs.length} leden op inactief zetten`);
      for (const existingDoc of existingSnapshot.docs) {
        const ref = doc(membresRef, existingDoc.id);
        batch.update(ref, {
          member_status: 'inactive',
          actif: false,
          isActive: false,
          updatedAt: new Date()
        });
        batchCount++;
        completedOps++;
        deactivatedCount++;

        if (batchCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          setImportProgress({ current: completedOps, total: totalOps, phase: 'Stap 1: Alle leden op inactief zetten...' });
        }
      }

      // Commit stap 1
      if (batchCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
      console.log(`[IMPORT] Stap 1 voltooid: ${deactivatedCount} leden op inactief gezet`);

      // Log welke leden NIET gematcht zijn (= blijven inactief)
      const unmatchedDocs = existingSnapshot.docs.filter(d => !matchedExistingIds.has(d.id));
      console.log(`[IMPORT] Niet-gematchte leden (${unmatchedDocs.length}):`, unmatchedDocs.map(d => {
        const data = d.data();
        return `${data.nom || data.lastName || '?'} ${data.prenom || data.firstName || '?'} (${d.id})`;
      }));

      // STAP 2: Verwerk de Excel — nieuwe leden toevoegen, bestaande leden updaten (= activeren)
      setImportProgress({ current: completedOps, total: totalOps, phase: 'Stap 2: Excel-leden verwerken...' });

      // ADD nouveaux membres (al actief vanuit de parser)
      for (const membre of toAdd) {
        const ref = doc(membresRef, membre.id);
        const membreData = {
          ...membre,
          member_status: 'active',
          actif: true,
          isActive: true,
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
          setImportProgress({ current: completedOps, total: totalOps, phase: 'Stap 2: Nieuwe leden toevoegen...' });
        }
      }

      // UPDATE membres existants — zet ze terug op ACTIVE
      for (const membre of toUpdate) {
        const ref = doc(membresRef, membre.id);
        batch.update(ref, {
          ...membre.changes,
          member_status: 'active', // Expliciet active zetten (overschrijft de inactive van stap 1)
          actif: true,
          isActive: true,
          updatedAt: new Date()
        });
        batchCount++;
        completedOps++;

        if (batchCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          setImportProgress({ current: completedOps, total: totalOps, phase: 'Stap 2: Leden bijwerken...' });
        }
      }

      // Commit final batch
      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(`[IMPORT] Stap 2 voltooid: ${toAdd.length} toegevoegd, ${toUpdate.length} bijgewerkt (actief)`);
      console.log(`[IMPORT] Resultaat: ${toDeactivateCount} leden blijven inactief (niet in Excel)`);

      toast.success(
        `Import terminé !\n` +
        `✅ ${toAdd.length} ajoutés\n` +
        `🔄 ${toUpdate.length} mis à jour (actifs)\n` +
        `⏸️ ${toDeactivateCount} désactivés (absents du fichier)`,
        { duration: 5000 }
      );

      if (onImportComplete) {
        onImportComplete(toAdd.length);
      }

      // Reset et fermer
      setTimeout(() => {
        handleClose();
      }, 1500);

    } catch (error) {
      logger.error('Import error:', error);
      toast.error('Erreur lors de l\'import des membres');
    } finally {
      setIsProcessing(false);
      setImportProgress({ current: 0, total: 0, phase: '' });
    }
  };

  const handleClose = () => {
    setImportProgress({ current: 0, total: 0, phase: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">Import Membres</h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">Importer depuis Excel (Organon / Lifras)</p>
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
        <div className="p-6">
          {!isProcessing ? (
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
                      Format Organon / Lifras (.xlsx)
                    </p>
                  </div>
                  <label
                    htmlFor="membre-excel-upload"
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Parcourir et importer
                  </label>
                </div>
              </div>

              {/* Instructions Organon */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm font-medium text-teal-900 mb-2">📋 Comment obtenir le fichier Excel ?</p>
                <ol className="text-xs text-teal-700 space-y-1.5 list-decimal list-inside">
                  <li>Va sur <a href="https://lifras.organon-officelite-prod.org/4DCGI/nl/home2/" target="_blank" rel="noopener noreferrer" className="underline hover:text-teal-900">LIFRAS Organon</a></li>
                  <li>Connecte-toi à ton compte Lifras</li>
                  <li>Ouvre le menu <strong>Clubs → Membres</strong></li>
                  <li>Sélectionne l'année <strong>2026</strong></li>
                  <li>Clique sur <strong>Tout sélectionner</strong></li>
                  <li>Clique sur <strong>Export</strong> pour télécharger le fichier Excel</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-gray-700 dark:text-dark-text-primary font-medium">{importProgress.phase}</p>
              </div>

              {importProgress.total > 0 && (
                <div>
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
                    <span>Progression</span>
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50 dark:bg-dark-bg-tertiary">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 rounded-lg transition-colors"
            disabled={isProcessing}
          >
            {isProcessing ? 'Import en cours...' : 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  );
}

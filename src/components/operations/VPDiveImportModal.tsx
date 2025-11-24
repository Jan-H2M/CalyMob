import React, { useRef, useState } from 'react';
import { X, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { VPDiveParser } from '@/services/vpDiveParser';
import { EventTransactionMatcher } from '@/services/eventTransactionMatcher';
import { Evenement } from '@/types';
import { collection, addDoc, getDocs, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { SessionService } from '@/services/sessionService';
import toast from 'react-hot-toast';

interface VPDiveImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  fiscalYearId?: string;  // Année fiscale active
  onSuccess?: () => void;  // Callback after successful import
}

interface DuplicateInfo {
  filename: string;
  existingEvent: Evenement;
}

export function VPDiveImportModal({ isOpen, onClose, clubId, fiscalYearId, onSuccess }: VPDiveImportModalProps) {
  const { appUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedEvent, setImportedEvent] = useState<any>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateInfo[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [pendingImports, setPendingImports] = useState<File[]>([]);

  if (!isOpen) return null;

  // Gérer l'import VP Dive (unique ou multiple)
  const handleVPDiveImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Valider que tous les fichiers sont .xls
    const invalidFiles = files.filter(f => !f.name.endsWith('.xls'));
    if (invalidFiles.length > 0) {
      toast.error(`${invalidFiles.length} fichier(s) invalide(s) - seuls les fichiers .xls sont acceptés`);
      return;
    }

    try {
      // 1. Charger tous les événements existants (une seule fois)
      const eventsRef = collection(db, 'clubs', clubId, 'operations');
      const eventsSnapshot = await getDocs(eventsRef);
      const existingEvents = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Evenement[];

      // 2. Créer un Map des hashes existants pour recherche rapide
      const existingHashes = new Map<string, Evenement>();
      existingEvents.forEach(evt => {
        if (evt.vp_dive_source_hash) {
          existingHashes.set(evt.vp_dive_source_hash, evt);
        }
      });

      // 3. Parser tous les fichiers et vérifier les doublons
      const duplicates: DuplicateInfo[] = [];
      const filesToImport: { file: File, vpDiveEvent: any, evenement: Evenement, stats: any }[] = [];

      for (const file of files) {
        try {
          const vpDiveEvent = await VPDiveParser.parseVPDiveFile(file);
          const evenement = VPDiveParser.convertToEvenement(vpDiveEvent);
          const stats = VPDiveParser.analyzeEventStats(vpDiveEvent);

          // Vérifier si le hash existe déjà
          if (evenement.vp_dive_source_hash && existingHashes.has(evenement.vp_dive_source_hash)) {
            const existingEvent = existingHashes.get(evenement.vp_dive_source_hash)!;
            duplicates.push({
              filename: file.name,
              existingEvent
            });
          }

          filesToImport.push({ file, vpDiveEvent, evenement, stats });
        } catch (error) {
          toast.error(`Erreur de parsing: ${file.name}`);
          console.error(`Erreur parsing ${file.name}:`, error);
        }
      }

      // 4. Si doublons détectés, afficher un avertissement
      if (duplicates.length > 0) {
        setDuplicateWarnings(duplicates);
        setPendingImports(files);
        setShowDuplicateWarning(true);
        return; // Stopper ici et attendre la confirmation utilisateur
      }

      // 5. Si pas de doublons, procéder à l'import
      await proceedWithImport(filesToImport);

    } catch (error) {
      toast.error('Erreur lors de l\'import des fichiers VP Dive');
      console.error(error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Fonction pour exécuter l'import après validation
  const proceedWithImport = async (filesToImport: { file: File, vpDiveEvent: any, evenement: Evenement, stats: any }[]) => {
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const { file, vpDiveEvent, evenement, stats } of filesToImport) {
      try {
        // Si c'est un seul fichier ET qu'il n'y a pas eu de warning, afficher le modal de confirmation
        if (filesToImport.length === 1 && duplicateWarnings.length === 0) {
          setImportedEvent({
            ...evenement,
            participants: vpDiveEvent.participants,
            stats
          });
          toast.success(`Événement "${evenement.titre}" importé avec ${vpDiveEvent.total_participants} participants`);
        } else {
          // Mode batch : créer l'événement directement dans Firestore
          await saveEventToFirestore(evenement, vpDiveEvent.participants);
          successCount++;
        }
      } catch (error) {
        failCount++;
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        console.error(`Erreur import ${file.name}:`, error);
      }
    }

    // Afficher le résumé
    if (filesToImport.length > 1 || duplicateWarnings.length > 0) {
      if (successCount > 0) {
        toast.success(`${successCount} événement(s) importé(s) avec succès`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} échec(s) lors de l'import`);
        errors.forEach(err => console.error(err));
      }

      // Call success callback
      if (successCount > 0 && onSuccess) {
        onSuccess();
      }

      // Fermer le modal après import multiple
      onClose();
    }

    // Réinitialiser l'état du warning
    setDuplicateWarnings([]);
    setShowDuplicateWarning(false);
    setPendingImports([]);
  };

  // Sauvegarder l'événement importé dans Firestore
  const saveEventToFirestore = async (evenement: Evenement, participants: any[]) => {
    console.log('🚀 ===== DÉBUT SAUVEGARDE VP DIVE =====');
    console.log('📦 evenement:', evenement);
    console.log('👥 participants:', participants);
    console.log('📊 Nombre de participants:', participants?.length || 0);
    console.log('👤 Current user:', appUser?.id, appUser?.email);
    console.log('📅 Fiscal year ID:', fiscalYearId);

    if (!appUser?.id) {
      throw new Error('Utilisateur non authentifié - impossible de créer un événement');
    }

    if (!fiscalYearId) {
      throw new Error('Année fiscale non définie - impossible de créer un événement');
    }

    // 🆕 MIGRATION: Write to 'operations' collection with type='evenement'
    const eventsRef = collection(db, 'clubs', clubId, 'operations');
    const eventToSave = {
      ...evenement,
      type: 'evenement' as const,
      club_id: clubId,
      fiscal_year_id: fiscalYearId || null,  // ✅ Required by Firestore rules
      organisateur_id: appUser?.id || '',  // ✅ Required by Firestore rules - set to current user
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      created_by: 'vpdive_import',
      import_source: 'vpdive'  // Track that this was imported from VP Dive
    };

    // Remove participants and stats from event data
    const { participants: _, stats: __, ...eventDataRaw } = eventToSave as any;

    // Clean up: remove undefined/null/invalid date fields
    const isValidDate = (d: any): boolean => {
      return d instanceof Date && !isNaN(d.getTime());
    };

    const eventData: any = {};
    for (const [key, value] of Object.entries(eventDataRaw)) {
      if (key === 'created_at' || key === 'updated_at') {
        continue;
      }

      if (value instanceof Date) {
        if (isValidDate(value)) {
          eventData[key] = value;
        } else {
          if (key === 'date_debut') {
            eventData[key] = new Date();
          }
        }
      } else if (value !== null && value !== undefined && value !== '') {
        eventData[key] = value;
      }
    }

    // Add timestamps and ensure required fields
    eventData.created_at = serverTimestamp();
    eventData.updated_at = serverTimestamp();
    eventData.organisateur_id = appUser?.id || '';

    // ========================================
    // 🔒 PRE-FLIGHT VALIDATION CHECKS
    // ========================================
    console.log('\n🔍 ===== PRE-FLIGHT SECURITY CHECKS =====');

    // CHECK 1: User Authentication
    console.log('  ✓ User authenticated:', !!appUser?.id);
    console.log('  ✓ User ID:', appUser?.id);
    console.log('  ✓ User email:', appUser?.email);
    console.log('  ✓ User role:', appUser?.app_role);

    // CHECK 2: Required Fields
    console.log('  ✓ organisateur_id set:', eventData.organisateur_id);
    console.log('  ✓ fiscal_year_id set:', eventData.fiscal_year_id);
    console.log('  ✓ type:', eventData.type);
    console.log('  ✓ club_id:', eventData.club_id);

    // CHECK 3: Session Validation (with retry)
    console.log('  🔐 Checking session validity...');
    const maxRetries = 3;
    let sessionReady = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        sessionReady = await SessionService.validateSession(clubId, appUser.id);

        if (sessionReady) {
          console.log(`  ✅ Session valid (attempt ${attempt + 1}/${maxRetries})`);
          break;
        } else {
          console.warn(`  ⚠️ Session not ready (attempt ${attempt + 1}/${maxRetries})`);

          if (attempt < maxRetries - 1) {
            console.log('  ⏳ Waiting 1 second before retry...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (sessionError) {
        console.error(`  ❌ Session check error (attempt ${attempt + 1}/${maxRetries}):`, sessionError);

        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!sessionReady) {
      const errorMsg = 'Session non valide - Veuillez vous reconnecter et réessayer';
      console.error('  ❌ FATAL: Session validation failed after all retries');
      throw new Error(errorMsg);
    }

    // CHECK 4: Fiscal Year Validation
    console.log('  📅 Validating fiscal year...');
    try {
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      const fySnap = await getDoc(fyRef);

      if (!fySnap.exists()) {
        console.error('  ❌ Fiscal year document not found:', fiscalYearId);
        throw new Error(`Année fiscale "${fiscalYearId}" introuvable`);
      }

      const fyData = fySnap.data();
      console.log('  ✓ Fiscal year exists:', fiscalYearId);
      console.log('  ✓ Fiscal year status:', fyData.status);

      // Check if user has permission to modify this fiscal year
      const userRole = appUser?.app_role;

      if (fyData.status === 'closed' && !['admin', 'superadmin'].includes(userRole)) {
        const errorMsg = 'Année fiscale fermée - Seuls les administrateurs peuvent créer des événements';
        console.error('  ❌', errorMsg);
        throw new Error(errorMsg);
      }

      if (fyData.status === 'permanently_closed' && userRole !== 'superadmin') {
        const errorMsg = 'Année fiscale définitivement fermée - Seul un super-administrateur peut créer des événements';
        console.error('  ❌', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('  ✅ Fiscal year validation passed');

    } catch (fyError: any) {
      console.error('  ❌ Fiscal year validation failed:', fyError.message);
      throw fyError;
    }

    console.log('✅ All pre-flight checks passed - proceeding with operation creation\n');

    // ========================================
    // 💾 CREATE OPERATION IN FIRESTORE
    // ========================================
    console.log('📝 Event data to save:', {
      organisateur_id: eventData.organisateur_id,
      fiscal_year_id: eventData.fiscal_year_id,
      type: eventData.type,
      titre: eventData.titre,
      date_debut: eventData.date_debut,
      club_id: eventData.club_id
    });

    let docRef;
    try {
      docRef = await addDoc(eventsRef, eventData);
      console.log('✅ Operation created successfully:', docRef.id);
    } catch (createError: any) {
      console.error('❌ FIRESTORE PERMISSION ERROR:', {
        code: createError.code,
        message: createError.message,
        details: createError
      });

      // Provide user-friendly error message
      let userMessage = 'Erreur lors de la création de l\'événement';

      if (createError.code === 'permission-denied') {
        userMessage += ' - Permission refusée. Vérifiez votre session et vos droits.';
      }

      throw new Error(userMessage + '\n' + createError.message);
    }

    // Save participants as inscriptions
    console.log('📊 Starting inscription save process...');
    console.log(`  Club ID: ${clubId}`);
    console.log(`  Event ID: ${docRef.id}`);
    console.log(`  Participants:`, participants);

    if (!participants || participants.length === 0) {
      console.warn('⚠️ No participants found!');
    } else {
      console.log(`✅ Found ${participants.length} participants to save`);

      // 🆕 MIGRATION: Write to 'operation_participants' collection
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operation_participants');

      let savedCount = 0;
      for (const participant of participants) {
        try {
          const inscriptionData: any = {
            club_id: clubId,
            fiscal_year_id: fiscalYearId || null,  // Required by Firestore Rules
            operation_id: docRef.id,
            operation_titre: evenement.titre,
            operation_type: 'evenement' as const,
            evenement_id: docRef.id,  // Keep for backward compatibility
            evenement_titre: evenement.titre,
            membre_nom: participant.nom || 'Inconnu',
            paye: participant.etat_paiement?.toLowerCase().includes('payé') || false,
            prix: participant.montant || evenement.prix_membre || 0,
            date_inscription: participant.inscrit_le || evenement.date_debut || new Date(),
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          };

          // Add optional fields only if they have values
          if (participant.numero_licence) inscriptionData.numero_licence = participant.numero_licence;
          if (participant.pratique) inscriptionData.pratique = participant.pratique;
          if (participant.plan_tarifaire) inscriptionData.plan_tarifaire = participant.plan_tarifaire;
          if (participant.portable) inscriptionData.telephone = participant.portable;
          if (participant.role) inscriptionData.notes = `Rôle: ${participant.role}`;

          // Contact urgence
          if (participant.nom_contact_urgence && participant.prenom_contact_urgence) {
            const contactNotes = `Contact urgence: ${participant.prenom_contact_urgence} ${participant.nom_contact_urgence}`;
            inscriptionData.notes = inscriptionData.notes
              ? `${inscriptionData.notes} | ${contactNotes}`
              : contactNotes;

            if (participant.portable_contact_urgence) {
              inscriptionData.notes += ` (${participant.portable_contact_urgence})`;
            }
          }

          await addDoc(inscriptionsRef, inscriptionData);
          savedCount++;
        } catch (error) {
          console.error(`  ❌ Error saving inscription for ${participant.nom}:`, error);
          toast.error(`Erreur sauvegarde inscription ${participant.nom}`);
        }
      }

      console.log(`✅ Inscriptions saved: ${savedCount}/${participants.length}`);

      if (savedCount < participants.length) {
        toast.warning(`Seulement ${savedCount}/${participants.length} inscriptions sauvegardées. Vérifiez les logs.`);
      }
    }

    // AUTO-MATCHING TRANSACTIONS
    console.log('🔗 Lancement auto-matching transactions...');
    try {
      const montantTotal = participants?.reduce((sum, p) => sum + (p.montant || 0), 0) || 0;

      const matchResult = await EventTransactionMatcher.autoMatchEventTransactions(
        clubId,
        docRef.id,
        {
          titre: evenement.titre,
          lieu: evenement.lieu || '',
          date_debut: eventData.date_debut,
          date_fin: eventData.date_fin || eventData.date_debut,
          participants: participants || [],
          montant_total: montantTotal
        }
      );

      // Afficher résultats matching
      if (matchResult.autoLinked.length > 0) {
        toast.success(
          `✅ ${matchResult.autoLinked.length} transaction(s) liée(s) automatiquement (${matchResult.linkedAmount.toFixed(2)}€ sur ${matchResult.totalAmount.toFixed(2)}€)`,
          { duration: 5000 }
        );
      }

      if (matchResult.suggested.length > 0) {
        toast(
          `💡 ${matchResult.suggested.length} transaction(s) suggérée(s) - Vérifiez l'onglet Transactions de l'événement`,
          { duration: 5000, icon: 'ℹ️' }
        );
      }

      console.log('✅ Auto-matching terminé:', matchResult);
    } catch (matchError) {
      console.warn('⚠️ Auto-matching transactions échoué:', matchError);
    }

    return docRef.id;
  };

  // Handler pour confirmer la création de l'événement importé
  const handleConfirmImport = async () => {
    if (!importedEvent) return;

    try {
      await saveEventToFirestore(importedEvent, importedEvent.participants);

      toast.success(
        `Événement "${importedEvent.titre}" créé avec ${importedEvent.participants?.length || 0} participants`,
        { duration: 4000 }
      );

      setImportedEvent(null);

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Handler pour confirmer l'import malgré les doublons
  const handleConfirmDuplicateImport = async () => {
    setShowDuplicateWarning(false);

    // Re-parser les fichiers et exécuter l'import
    const filesToImport: { file: File, vpDiveEvent: any, evenement: Evenement, stats: any }[] = [];

    for (const file of pendingImports) {
      try {
        const vpDiveEvent = await VPDiveParser.parseVPDiveFile(file);
        const evenement = VPDiveParser.convertToEvenement(vpDiveEvent);
        const stats = VPDiveParser.analyzeEventStats(vpDiveEvent);
        filesToImport.push({ file, vpDiveEvent, evenement, stats });
      } catch (error) {
        console.error(`Erreur re-parsing ${file.name}:`, error);
      }
    }

    await proceedWithImport(filesToImport);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handler pour annuler l'import
  const handleCancelDuplicateImport = () => {
    setShowDuplicateWarning(false);
    setDuplicateWarnings([]);
    setPendingImports([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    toast('Import annulé', { icon: 'ℹ️' });
  };

  return (
    <>
      {/* Modal principal d'import */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-6 w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">Importer depuis VP Dive</h2>
            <button
              onClick={onClose}
              className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Instructions */}
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Instructions:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Connectez-vous à VP Dive</li>
                  <li>Téléchargez les sorties (format .xls)</li>
                  <li>Glissez les fichiers ci-dessous (import multiple supporté)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* File input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls"
            multiple
            onChange={handleVPDiveImport}
            className="hidden"
          />

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-dark-bg-tertiary border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
          >
            <FileSpreadsheet className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
            <span className="text-gray-700 dark:text-dark-text-primary">Sélectionner fichier(s) VP Dive (.xls)</span>
          </button>

          {/* Cancel button */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmation d'événement importé */}
      {importedEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-6 w-full max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900">Événement importé depuis VP Dive</h3>
                <p className="text-green-700 text-sm mt-1">
                  {importedEvent.titre} - {importedEvent.participants?.length || 0} participants
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirmImport}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Créer l'événement
              </button>
              <button
                onClick={() => setImportedEvent(null)}
                className="flex-1 px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'avertissement de doublons */}
      {showDuplicateWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 text-lg">Événements déjà importés détectés</h3>
                <p className="text-orange-700 text-sm mt-1">
                  {duplicateWarnings.length} fichier(s) sur {pendingImports.length} ont déjà été importés
                </p>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto mb-4 space-y-2">
              {duplicateWarnings.map((dup, index) => (
                <div key={index} className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm font-medium text-orange-900">{dup.filename}</p>
                  <p className="text-xs text-orange-700 mt-1">
                    Déjà importé comme: {dup.existingEvent.titre}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
              Voulez-vous continuer l'import ? Cela créera des événements en double.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleCancelDuplicateImport}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDuplicateImport}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Importer quand même
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

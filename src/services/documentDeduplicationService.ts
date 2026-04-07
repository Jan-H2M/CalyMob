import { logger } from '@/utils/logger';
/**
 * Service de déduplication des documents pour les dépenses
 * Génère un hash basé sur le contenu du fichier pour éviter les imports en double
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DemandeRemboursement, DocumentJustificatif } from '@/types';

/**
 * Génère un hash SHA-256 d'un fichier
 *
 * @param file Fichier à hasher
 * @returns Hash hexadécimal du contenu
 */
export async function hashFile(file: File): Promise<string> {
  try {
    // Lire le fichier comme ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Générer le hash SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

    // Convertir en hexadécimal
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch (error) {
    logger.error('Erreur génération hash fichier:', error);
    throw error;
  }
}

/**
 * Vérifie si un document avec ce hash existe déjà dans les dépenses
 *
 * @param fileHash Hash du fichier à vérifier
 * @param clubId ID du club
 * @returns true si le document existe déjà, false sinon
 */
export async function checkDocumentExists(
  fileHash: string,
  clubId: string
): Promise<boolean> {
  try {
    const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
    const q = query(demandesRef, where('document_hash', '==', fileHash));
    const snapshot = await getDocs(q);

    return !snapshot.empty;
  } catch (error) {
    logger.error('Erreur vérification document:', error);
    return false; // En cas d'erreur, on laisse passer (mieux vaut un doublon qu'un blocage)
  }
}

/**
 * Analyse un batch de fichiers et identifie les doublons
 *
 * @param files Tableau de fichiers à analyser
 * @param clubId ID du club
 * @returns Map avec les infos de déduplication pour chaque fichier
 */
export async function analyzeBatchForDuplicates(
  files: File[],
  clubId: string
): Promise<Map<string, {
  hash: string;
  isDuplicate: boolean;
  duplicateInBatch: boolean; // Doublon au sein du batch lui-même
}>> {
  const results = new Map();
  const seenHashes = new Set<string>(); // Pour détecter les doublons au sein du batch

  logger.debug(`🔍 Analyse de ${files.length} fichier(s) pour déduplication...`);

  for (const file of files) {
    try {
      // Générer le hash
      const hash = await hashFile(file);

      // Vérifier si c'est un doublon dans le batch actuel
      const duplicateInBatch = seenHashes.has(hash);
      seenHashes.add(hash);

      // Vérifier si c'est un doublon dans Firestore
      const isDuplicate = await checkDocumentExists(hash, clubId);

      results.set(file.name, {
        hash,
        isDuplicate,
        duplicateInBatch
      });

      if (isDuplicate) {
        logger.debug(`⚠️ Doublon détecté (Firestore): ${file.name}`);
      }
      if (duplicateInBatch) {
        logger.debug(`⚠️ Doublon détecté (batch): ${file.name}`);
      }
    } catch (error) {
      logger.error(`❌ Erreur analyse ${file.name}:`, error);
      // En cas d'erreur, on ajoute le fichier sans hash (sera traité normalement)
      results.set(file.name, {
        hash: '',
        isDuplicate: false,
        duplicateInBatch: false
      });
    }
  }

  const duplicateCount = Array.from(results.values()).filter(r => r.isDuplicate || r.duplicateInBatch).length;
  logger.debug(`✅ ${duplicateCount}/${files.length} doublon(s) détecté(s)`);

  return results;
}

/**
 * Informations sur un document en doublon
 */
export interface DuplicateInfo {
  file: File;                    // Fichier uploadé (doublon)
  existingDoc: DocumentJustificatif;  // Document existant en base
  demande: {
    id: string;
    description: string;
    montant: number;
  };
}

/**
 * Vérifie si des fichiers sont des doublons de documents existants
 * Parcourt TOUS les documents de TOUTES les dépenses du club
 *
 * @param files Fichiers à vérifier
 * @param clubId ID du club
 * @returns Liste des doublons détectés avec infos sur la dépense source
 */
export async function checkDuplicatesInAllExpenses(
  files: File[],
  clubId: string
): Promise<DuplicateInfo[]> {
  const duplicates: DuplicateInfo[] = [];

  logger.debug(`🔍 Vérification doublons pour ${files.length} fichier(s)...`);

  try {
    // 1. Récupérer TOUTES les dépenses du club
    const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
    const snapshot = await getDocs(demandesRef);

    logger.debug(`📂 Scanning ${snapshot.size} demandes...`);

    // 2. Calculer hash de chaque fichier à uploader
    const fileHashes = new Map<string, string>();
    for (const file of files) {
      try {
        const hash = await hashFile(file);
        fileHashes.set(file.name, hash);
      } catch (error) {
        logger.error(`❌ Erreur calcul hash ${file.name}:`, error);
      }
    }

    // 3. Parcourir toutes les dépenses et leurs documents
    for (const docSnap of snapshot.docs) {
      const demande = { id: docSnap.id, ...docSnap.data() } as DemandeRemboursement;
      const docs = demande.documents_justificatifs || [];

      if (docs.length === 0) continue;

      // Vérifier chaque document de cette dépense
      for (const existingDoc of docs) {
        // Comparer avec chaque fichier à uploader
        for (const file of files) {
          const fileHash = fileHashes.get(file.name);
          if (!fileHash) continue;

          // Comparaison par hash (si disponible)
          if (existingDoc.file_hash && existingDoc.file_hash === fileHash) {
            logger.debug(`⚠️ Doublon détecté (hash): ${file.name} → Dépense ${demande.id} (${demande.description})`);
            duplicates.push({
              file,
              existingDoc,
              demande: {
                id: demande.id,
                description: demande.description || 'Sans description',
                montant: demande.montant
              }
            });
          }
          // Fallback: Comparaison par nom + taille + type (pour anciens documents sans hash)
          else if (!existingDoc.file_hash) {
            const nameMatch = normalizeFilename(existingDoc.nom_original) === normalizeFilename(file.name);
            const sizeMatch = existingDoc.taille === file.size;
            const typeMatch = existingDoc.type === file.type;

            if (nameMatch && sizeMatch && typeMatch) {
              logger.debug(`⚠️ Doublon détecté (legacy): ${file.name} → Dépense ${demande.id}`);
              duplicates.push({
                file,
                existingDoc,
                demande: {
                  id: demande.id,
                  description: demande.description || 'Sans description',
                  montant: demande.montant
                }
              });
            }
          }
        }
      }
    }

    logger.debug(`✅ ${duplicates.length} doublon(s) trouvé(s)`);
    return duplicates;

  } catch (error) {
    logger.error('❌ Erreur vérification doublons:', error);
    return []; // En cas d'erreur, on laisse passer (mieux vaut un doublon qu'un blocage)
  }
}

/**
 * Normalise un nom de fichier pour comparaison
 * Supprime extensions, préfixes numériques, suffixes (copy), etc.
 */
function normalizeFilename(filename: string): string {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  return nameWithoutExt
    .replace(/\s*\(\d+\)\s*$/g, '')           // Remove (1), (2), etc.
    .replace(/^[\d-]+\s*-\s*/g, '')           // Remove prefix like "2025-00175 - "
    .replace(/_copy\d*$/gi, '')               // Remove _copy, _copy1, etc.
    .replace(/_edit\d*$/gi, '')               // Remove _edit, _edit1, etc.
    .replace(/[-_\s]+/g, '')                  // Remove all dashes/underscores/spaces
    .toLowerCase()
    .trim();
}

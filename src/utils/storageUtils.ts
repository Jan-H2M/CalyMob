/**
 * Utilitaires pour gérer Firebase Storage
 */

import { ref, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/**
 * Extrait le chemin Storage depuis une URL Firebase Storage complète
 *
 * @param url URL complète Firebase Storage
 * @returns Chemin relatif dans Storage ou null si URL invalide
 *
 * @example
 * extractPathFromUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/clubs%2Fcalypso%2Fjustificatifs%2F123_file.pdf?...')
 * // Returns: 'clubs/calypso/justificatifs/123_file.pdf'
 */
export function extractPathFromUrl(url: string): string | null {
  try {
    // Format URL Firebase Storage:
    // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?...

    const urlObj = new URL(url);

    // Extraire le chemin depuis le pathname
    // Format: /v0/b/{bucket}/o/{encodedPath}
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);

    if (!pathMatch || !pathMatch[1]) {
      console.warn(`Impossible d'extraire le chemin depuis l'URL: ${url}`);
      return null;
    }

    // Décoder le chemin (remplace %2F par /, etc.)
    const decodedPath = decodeURIComponent(pathMatch[1]);

    return decodedPath;
  } catch (error) {
    console.error(`Erreur parsing URL Storage: ${url}`, error);
    return null;
  }
}

/**
 * Supprime un fichier depuis Firebase Storage à partir de son URL
 *
 * @param url URL complète du fichier dans Storage
 * @returns Promise qui se résout quand le fichier est supprimé
 *
 * @example
 * await deleteStorageFile('https://firebasestorage.googleapis.com/...')
 */
export async function deleteStorageFile(url: string): Promise<boolean> {
  try {
    const path = extractPathFromUrl(url);

    if (!path) {
      console.warn(`Chemin Storage invalide, impossible de supprimer: ${url}`);
      return false;
    }

    const fileRef = ref(storage, path);
    await deleteObject(fileRef);

    console.log(`✅ Fichier Storage supprimé: ${path}`);
    return true;

  } catch (error: any) {
    // Erreur "object-not-found" = fichier déjà supprimé → OK
    if (error.code === 'storage/object-not-found') {
      console.log(`ℹ️ Fichier déjà supprimé: ${url}`);
      return true;
    }

    console.error(`❌ Erreur suppression fichier Storage: ${url}`, error);
    return false;
  }
}

/**
 * Supprime plusieurs fichiers depuis Firebase Storage
 *
 * @param urls Tableau d'URLs de fichiers à supprimer
 * @returns Promise avec le nombre de fichiers supprimés avec succès
 */
export async function deleteMultipleStorageFiles(urls: string[]): Promise<{
  deleted: number;
  failed: number;
  errors: string[];
}> {
  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const url of urls) {
    const success = await deleteStorageFile(url);
    if (success) {
      deleted++;
    } else {
      failed++;
      errors.push(url);
    }
  }

  return { deleted, failed, errors };
}

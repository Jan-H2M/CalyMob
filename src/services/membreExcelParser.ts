import { Membre } from '@/types';
import { generateId } from '@/utils/utils';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
// XLSX is loaded dynamically to reduce initial bundle size (~200KB)

/**
 * Service de parsing Excel pour import membres (format Organon / Lifras)
 *
 * Colonnes importées depuis l'export Organon :
 * 1. Nom
 * 2. Prénom
 * 3. Date de naissance
 * 4. Sexe
 * 5. Adresse (champ combiné: rue, code postal, localité, pays)
 * 6. GSM
 * 7. Téléphone
 * 8. E-mail
 * 9. Statut chronologique (ex: "Présent / En ordre")
 * 10. Type de la dernière licence
 * 11. Numéro de licence (= LifrasID)
 *
 * Logique métier :
 * - Le "Statut chronologique" détermine si un membre est actif ou inactif
 * - "En ordre" ou "Présent" dans le statut → ACTIF
 * - Tout autre statut (pas payé, pas en ordre) → INACTIF
 * - Les membres absents du fichier seront DÉSACTIVÉS lors de l'import
 */

/**
 * Résultat du parsing Excel
 */
export interface MembreParseResult {
  membres: Membre[];
  success_count: number;
  error_count: number;
  duplicate_count: number;
  errors: string[];
}

/**
 * Parse date from Excel (DD/MM/YYYY format string or Excel serial number)
 */
function parseExcelDate(value: any): Date | undefined {
  if (!value) return undefined;

  // Si c'est un nombre (Excel serial date)
  if (typeof value === 'number') {
    const EXCEL_EPOCH = new Date(1899, 11, 30); // 30 décembre 1899
    const date = new Date(EXCEL_EPOCH.getTime() + value * 86400000);
    return date;
  }

  // Si c'est une string (format DD/MM/YYYY)
  if (typeof value === 'string') {
    const parts = value.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
  }

  // Si c'est déjà une Date
  if (value instanceof Date) {
    return value;
  }

  return undefined;
}

/**
 * Nettoie une string (trim + undefined si vide)
 */
function cleanString(value: any): string | undefined {
  if (!value) return undefined;
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

/**
 * Parser principal : Excel Organon → Membre[]
 */
export class MembreExcelParser {
  /**
   * Parse un fichier Excel (format Organon / Lifras)
   */
  static async parseFile(file: File): Promise<MembreParseResult> {
    const result: MembreParseResult = {
      membres: [],
      success_count: 0,
      error_count: 0,
      duplicate_count: 0,
      errors: []
    };

    try {
      // Dynamic import for code splitting - XLSX is ~200KB
      const XLSX = await import('xlsx');
      // Lire le fichier comme buffer
      const buffer = await file.arrayBuffer();

      // Organon exporte du vrai XLSX, pas du HTML déguisé
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

      // Prendre la première feuille
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convertir en JSON (array of arrays)
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (data.length === 0) {
        result.errors.push('Fichier Excel vide');
        return result;
      }

      // Première ligne = headers
      const headers = data[0].map((h: any) => String(h || '').trim());

      // Helper: Trouver index d'une colonne (flexible)
      const findColumn = (exactName: string, fallbackPattern?: string): number => {
        let index = headers.indexOf(exactName);
        if (index !== -1) return index;

        // Chercher pattern dans les headers
        if (fallbackPattern) {
          index = headers.findIndex((h: string) =>
            h && h.toLowerCase().includes(fallbackPattern.toLowerCase())
          );
        }

        return index;
      };

      // Trouver index des colonnes (format Organon)
      const colIndexes = {
        nom: findColumn('Nom'),
        prenom: findColumn('Prénom', 'prenom'),
        dateNaissance: findColumn('Date de naissance', 'naissance'),
        sexe: findColumn('Sexe'),
        adresse: findColumn('Adresse'),
        gsm: findColumn('GSM'),
        telephone: findColumn('Téléphone', 'phone'),
        email: findColumn('E-mail', 'mail'),
        statutChronologique: findColumn('Statut chronologique', 'statut'),
        typeLicence: findColumn('Type de la dernière licence', 'licence'),
        numeroLicence: findColumn('Numéro de licence', 'numéro'),
      };

      // Vérifier colonnes obligatoires
      if (colIndexes.numeroLicence === -1) {
        result.errors.push('Colonne "Numéro de licence" introuvable dans le fichier Excel');
        return result;
      }
      if (colIndexes.nom === -1) {
        result.errors.push('Colonne "Nom" introuvable dans le fichier Excel');
        return result;
      }
      if (colIndexes.prenom === -1) {
        result.errors.push('Colonne "Prénom" introuvable dans le fichier Excel');
        return result;
      }

      // Parser chaque ligne (skip header)
      const seenLifrasIds = new Set<string>();

      for (let i = 1; i < data.length; i++) {
        const row = data[i];

        try {
          const lifrasId = cleanString(row[colIndexes.numeroLicence]);

          // Numéro de licence obligatoire
          if (!lifrasId) {
            result.errors.push(`Ligne ${i + 1}: Numéro de licence manquant`);
            result.error_count++;
            continue;
          }

          // Détecter doublons
          if (seenLifrasIds.has(lifrasId)) {
            result.errors.push(`Ligne ${i + 1}: Numéro de licence ${lifrasId} en double`);
            result.duplicate_count++;
            continue;
          }
          seenLifrasIds.add(lifrasId);

          const nom = cleanString(row[colIndexes.nom]);
          const prenom = cleanString(row[colIndexes.prenom]);

          // Nom et prénom obligatoires
          if (!nom || !prenom) {
            result.errors.push(`Ligne ${i + 1}: Nom ou Prénom manquant (Licence: ${lifrasId})`);
            result.error_count++;
            continue;
          }

          const rawEmail = row[colIndexes.email];
          const email = cleanString(rawEmail)?.toLowerCase() || `${lifrasId}@no-email.local`;

          // Téléphone: prendre GSM en priorité, sinon Téléphone
          const gsmValue = cleanString(row[colIndexes.gsm]);
          const telValue = cleanString(row[colIndexes.telephone]);
          const phoneNumber = gsmValue || telValue;

          // Adresse: stockée telle quelle (champ combiné Organon)
          const adresse = cleanString(row[colIndexes.adresse]);

          // Sexe
          const sexeRaw = cleanString(row[colIndexes.sexe]);
          const sexe = sexeRaw?.toLowerCase() === 'féminin' ? 'F' : sexeRaw?.toLowerCase() === 'masculin' ? 'M' : undefined;

          // Statut chronologique: "Présent / En ordre" → actif, sinon inactif
          const statutChronoRaw = cleanString(row[colIndexes.statutChronologique]) || '';
          const statutChronoLower = statutChronoRaw.toLowerCase();
          const isEnOrdre = statutChronoLower.includes('en ordre') || statutChronoLower.includes('présent');
          const memberStatus = isEnOrdre ? 'active' : 'inactive';

          // Construire objet Membre
          const membre: Membre = {
            id: generateId(),
            lifras_id: lifrasId,
            nom,
            prenom,
            email,
            displayName: `${prenom} ${nom}`,

            // Statut basé sur le "Statut chronologique" de Lifras
            app_role: 'membre' as any,
            member_status: memberStatus as any,
            has_app_access: false,
            is_diver: true,
            has_lifras: true,

            // Contact
            telephone: phoneNumber,
            phoneNumber: phoneNumber, // Backward compatibility
            gsm: gsmValue, // Legacy field

            // Adresse (champ unique depuis Organon)
            adresse,

            // Sexe
            sexe,

            // Date de naissance
            date_naissance: parseExcelDate(row[colIndexes.dateNaissance]),

            // Dates
            createdAt: new Date(),
            updatedAt: new Date(),
            date_inscription: new Date(),
            created_at: new Date(),
            updated_at: new Date(),

            // Statut chronologique brut (pour référence)
            statut_chronologique: statutChronoRaw || undefined,

            // Legacy fields pour backward compatibility
            role: 'membre' as any,
            actif: isEnOrdre,
            isActive: isEnOrdre,
            status: memberStatus as any,
            clubId: '' // Will be set during import
          };

          result.membres.push(membre);
          result.success_count++;
        } catch (error) {
          const err = error as Error;
          result.errors.push(`Ligne ${i + 1}: ${err.message}`);
          result.error_count++;
        }
      }

      return result;
    } catch (error) {
      const err = error as Error;
      result.errors.push(`Erreur lecture fichier: ${err.message}`);
      return result;
    }
  }

  /**
   * Valide un membre
   */
  static validateMembre(membre: Partial<Membre>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!membre.lifras_id) errors.push('Numéro de licence manquant');
    if (!getLastName(membre as Membre)) errors.push('Nom manquant');
    if (!getFirstName(membre as Membre)) errors.push('Prénom manquant');
    if (!membre.email) errors.push('Email manquant');

    // Validation email
    if (membre.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(membre.email)) {
      errors.push('Format email invalide');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Dédoublonne par Numéro de licence (garde le premier)
   */
  static deduplicateByLifrasId(membres: Membre[]): Membre[] {
    const seen = new Set<string>();
    const unique: Membre[] = [];

    for (const membre of membres) {
      if (membre.lifras_id && !seen.has(membre.lifras_id)) {
        seen.add(membre.lifras_id);
        unique.push(membre);
      }
    }

    return unique;
  }
}

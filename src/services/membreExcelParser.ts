import { Membre } from '@/types';
import { generateId } from '@/utils/utils';
import * as XLSX from 'xlsx';

/**
 * Service de parsing Excel pour import membres (iClubSport format)
 *
 * Colonnes importées :
 * 1. LifrasID (obligatoire)
 * 2. Nom
 * 3. Prénom
 * 4. Adresse
 * 5. Code postal
 * 6. Localité
 * 7. Email 1
 * 8. GSM 1
 * 9. Date du certificat médical
 * 10. Validité du certificat médical
 * 11. ICE (In Case of Emergency)
 * 12. Description
 * 13. Pays
 * 14. Date de naissance
 * 15. Newsletter
 * 16. Plongeur (niveau)
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
 * Parse boolean from Excel (True/False ou 1/0)
 */
function parseExcelBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'oui' || lower === 'yes';
  }
  return false;
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
 * Parser principal : Excel → Membre[]
 */
export class MembreExcelParser {
  /**
   * Parse un fichier Excel (format iClubSport HTML-based XLS)
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
      // Lire le fichier comme buffer
      const buffer = await file.arrayBuffer();

      // Parser avec XLSX (supporte HTML-based XLS)
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
      const headers = data[0];

      // Helper: Trouver index d'une colonne (flexible pour gérer les headers corrompus)
      const findColumn = (exactName: string, fallbackPattern?: string): number => {
        // Essayer correspondance exacte d'abord
        let index = headers.indexOf(exactName);
        if (index !== -1) return index;

        // Sinon, chercher pattern dans les headers (pour gérer HTML corrompu)
        if (fallbackPattern) {
          index = headers.findIndex((h: string) =>
            h && h.toLowerCase().includes(fallbackPattern.toLowerCase())
          );
        }

        return index;
      };

      // Trouver index des colonnes
      const colIndexes = {
        lifrasID: findColumn('LifrasID', 'lifras'),
        nrFebras: findColumn('Nr.Febras', 'febras'),
        nom: findColumn('Nom'),
        prenom: findColumn('Prenom'),
        adresse: findColumn('Adresse'),
        codePostal: findColumn('Code postal', 'postal'),
        localite: findColumn('Localité', 'localit'),
        // HTML corrompu dans iClubSport XLS: "Email 1" fusionné avec "Localité", data dans "Email 2"
        email: (() => {
          const email2Index = headers.indexOf('Email 2');
          if (email2Index !== -1) return email2Index;
          return findColumn('Email 1', 'email');
        })(),
        gsm: findColumn('GSM 1', 'gsm'),
        certifDate: findColumn('Date du certificat médical', 'certificat'),
        certifValidite: findColumn('Validité du certificat médical', 'validit'),
        ice: findColumn('ICE'),
        description: findColumn('Description'),
        pays: findColumn('Pays'),
        dateNaissance: findColumn('Date de naissance', 'naissance'),
        newsletter: findColumn('Newsletter'),
        niveauPlongeur: findColumn('Plongeur')
      };

      // Vérifier colonnes obligatoires
      if (colIndexes.lifrasID === -1) {
        result.errors.push('Colonne "LifrasID" introuvable dans le fichier Excel');
        return result;
      }
      if (colIndexes.nom === -1) {
        result.errors.push('Colonne "Nom" introuvable dans le fichier Excel');
        return result;
      }
      if (colIndexes.prenom === -1) {
        result.errors.push('Colonne "Prenom" introuvable dans le fichier Excel');
        return result;
      }

      // Parser chaque ligne (skip header)
      const seenLifrasIds = new Set<string>();

      for (let i = 1; i < data.length; i++) {
        const row = data[i];

        try {
          const lifrasId = cleanString(row[colIndexes.lifrasID]);

          // LifrasID obligatoire
          if (!lifrasId) {
            result.errors.push(`Ligne ${i + 1}: LifrasID manquant`);
            result.error_count++;
            continue;
          }

          // Détecter doublons
          if (seenLifrasIds.has(lifrasId)) {
            result.errors.push(`Ligne ${i + 1}: LifrasID ${lifrasId} en double`);
            result.duplicate_count++;
            continue;
          }
          seenLifrasIds.add(lifrasId);

          const nom = cleanString(row[colIndexes.nom]);
          const prenom = cleanString(row[colIndexes.prenom]);

          // Nom et prénom obligatoires
          if (!nom || !prenom) {
            result.errors.push(`Ligne ${i + 1}: Nom ou Prénom manquant (LifrasID: ${lifrasId})`);
            result.error_count++;
            continue;
          }

          const email = cleanString(row[colIndexes.email]) || `${lifrasId}@no-email.local`; // Générer email fictif si manquant

          // Construire objet Membre avec nouvelle structure
          const gsmValue = cleanString(row[colIndexes.gsm]);
          const niveauPlongee = cleanString(row[colIndexes.niveauPlongeur]);

          const membre: Membre = {
            id: generateId(),
            lifras_id: lifrasId,
            nr_febras: cleanString(row[colIndexes.nrFebras]),
            nom,
            prenom,
            email,
            displayName: `${prenom} ${nom}`, // Auto-calculated

            // Nouvelle structure pour rôles
            app_role: 'membre' as any, // Rôle app par défaut
            member_status: 'inactive' as any, // Nouveaux membres = inactifs par défaut
            has_app_access: false, // Pas d'accès app par défaut
            is_diver: !!niveauPlongee, // true si niveau plongée présent
            has_lifras: !!lifrasId, // true si LifrasID présent

            // Contact (nouvelle structure: telephone + backward compat)
            telephone: gsmValue,
            phoneNumber: gsmValue, // Backward compatibility
            gsm: gsmValue, // Legacy field

            // Adresse
            adresse: cleanString(row[colIndexes.adresse]),
            code_postal: cleanString(row[colIndexes.codePostal]),
            localite: cleanString(row[colIndexes.localite]),
            pays: cleanString(row[colIndexes.pays]),

            // Contact urgence
            ice: cleanString(row[colIndexes.ice]),

            // Médical
            certificat_medical_date: parseExcelDate(row[colIndexes.certifDate]),
            certificat_medical_validite: parseExcelDate(row[colIndexes.certifValidite]),

            // Plongée (nouvelle structure)
            niveau_plongee: niveauPlongee,
            niveau_plongeur: niveauPlongee, // Legacy field

            // Autres
            date_naissance: parseExcelDate(row[colIndexes.dateNaissance]),
            newsletter: parseExcelBoolean(row[colIndexes.newsletter]),

            // Dates (nouvelle structure + backward compat)
            createdAt: new Date(),
            updatedAt: new Date(),
            date_inscription: new Date(), // Backward compatibility
            created_at: new Date(), // Legacy field
            updated_at: new Date(), // Legacy field

            // Legacy fields pour backward compatibility
            role: 'membre' as any,
            actif: true,
            isActive: true,
            status: 'active' as any,
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

    if (!membre.lifras_id) errors.push('LifrasID manquant');
    if (!membre.nom) errors.push('Nom manquant');
    if (!membre.prenom) errors.push('Prénom manquant');
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
   * Dédoublonne par LifrasID (garde le premier)
   */
  static deduplicateByLifrasId(membres: Membre[]): Membre[] {
    const seen = new Set<string>();
    const unique: Membre[] = [];

    for (const membre of membres) {
      if (!seen.has(membre.lifras_id)) {
        seen.add(membre.lifras_id);
        unique.push(membre);
      }
    }

    return unique;
  }
}

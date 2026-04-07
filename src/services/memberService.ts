import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { Member, ImportResult } from '@/types/inventory';
import { Membre } from '@/types';
// XLSX is loaded dynamically to reduce initial bundle size (~200KB)
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { calculatePlongeurCode } from '@/utils/plongeurUtils';

// Interface for encoding correction mapping
export interface EncodingCorrection {
  original: string;
  corrected: string;
}

// Interface for detected encoding issues
export interface EncodingIssue {
  row: number;
  column: string;
  value: string;
  suggestedCorrection?: string;
}

/**
 * Service pour gérer les membres du module inventaire dans Firebase
 *
 * ⚠️⚠️⚠️ DEPRECATED - Ce service est OBSOLÈTE ⚠️⚠️⚠️
 *
 * Utiliser membreService.ts à la place (membres unifiés).
 *
 * Après l'unification (2025-10-31):
 * - Collection /clubs/{clubId}/inventory_members → VIDE (données migrées)
 * - Collection /clubs/{clubId}/members → CONTIENT TOUT (users + membres)
 * - Type Member (inventory.ts) → Alias vers Membre (types/index.ts)
 *
 * Ce service est gardé temporairement pour compatibilité backward uniquement.
 * TOUS les appels doivent migrer vers membreService.ts
 *
 * Collection (LEGACY): /clubs/{clubId}/inventory_members/{memberId} (VIDE APRÈS MIGRATION)
 * Nouvelle collection: /clubs/{clubId}/members/{memberId}
 */
export class MemberService {

  // ========================================
  // CRUD MEMBRES
  // ========================================

  /**
   * Récupérer tous les membres avec filtres optionnels
   */
  static async getMembers(
    clubId: string,
    filters?: {
      statut?: 'actif' | 'inactif';
      niveau_plongee?: string;
      search?: string;
    }
  ): Promise<Member[]> {
    try {
      const membersRef = collection(db, 'clubs', clubId, 'inventory_members');
      let q = query(membersRef, orderBy('nom', 'asc'));

      // Appliquer filtre statut
      if (filters?.statut) {
        q = query(membersRef, where('statut', '==', filters.statut), orderBy('nom', 'asc'));
      }

      const snapshot = await getDocs(q);
      let members = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Member));

      // Filtres client-side (car Firestore ne supporte pas OR/regex)
      if (filters?.niveau_plongee) {
        members = members.filter(m => m.niveau_plongee === filters.niveau_plongee);
      }

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        members = members.filter(m => {
          const lastName = (getLastName(m) || '').toLowerCase();
          const firstName = (getFirstName(m) || '').toLowerCase();
          return lastName.includes(searchLower) ||
            firstName.includes(searchLower) ||
            m.email.toLowerCase().includes(searchLower);
        });
      }

      // Calculer ancienneté et statut débutant
      members = members.map(m => this.calculateMemberStats(m));

      return members;
    } catch (error) {
      logger.error('Erreur chargement membres:', error);
      throw error;
    }
  }

  /**
   * Récupérer un membre par ID
   */
  static async getMemberById(clubId: string, memberId: string): Promise<Member | null> {
    try {
      const memberRef = doc(db, 'clubs', clubId, 'inventory_members', memberId);
      const snapshot = await getDoc(memberRef);

      if (!snapshot.exists()) {
        return null;
      }

      const member = {
        id: snapshot.id,
        ...snapshot.data()
      } as Member;

      return this.calculateMemberStats(member);
    } catch (error) {
      logger.error('Erreur chargement membre:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau membre
   */
  static async createMember(
    clubId: string,
    data: Omit<Member, 'id' | 'createdAt' | 'updatedAt' | 'isDebutant' | 'anciennete'>
  ): Promise<string> {
    try {
      const membersRef = collection(db, 'clubs', clubId, 'inventory_members');
      const newMemberRef = doc(membersRef);

      const newMember: Member = {
        ...data,
        id: newMemberRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isDebutant: false,
        anciennete: 0
      };

      // Calculer statut débutant
      const memberWithStats = this.calculateMemberStats(newMember);

      await setDoc(newMemberRef, memberWithStats);

      const lastName = getLastName(newMember) || '';
      const firstName = getFirstName(newMember) || '';
      logger.debug(`Membre créé: ${lastName} ${firstName} (${newMember.id})`);
      return newMemberRef.id;
    } catch (error) {
      logger.error('Erreur création membre:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un membre existant
   */
  static async updateMember(
    clubId: string,
    memberId: string,
    data: Partial<Omit<Member, 'id' | 'createdAt' | 'updatedAt' | 'isDebutant' | 'anciennete'>>
  ): Promise<void> {
    try {
      const memberRef = doc(db, 'clubs', clubId, 'inventory_members', memberId);

      // Récupérer les données actuelles pour recalculer les stats
      const currentMember = await this.getMemberById(clubId, memberId);
      if (!currentMember) {
        throw new Error('Membre introuvable');
      }

      // Fusionner les données
      const updatedMember = { ...currentMember, ...data };

      // Recalculer stats
      const memberWithStats = this.calculateMemberStats(updatedMember);

      await updateDoc(memberRef, {
        ...data,
        isDebutant: memberWithStats.isDebutant,
        anciennete: memberWithStats.anciennete,
        updatedAt: serverTimestamp()
      });

      logger.debug(`Membre mis à jour: ${memberId}`);
    } catch (error) {
      logger.error('Erreur mise à jour membre:', error);
      throw error;
    }
  }

  /**
   * Supprimer un membre (soft delete - passe en statut inactif)
   */
  static async deleteMember(clubId: string, memberId: string): Promise<void> {
    try {
      const memberRef = doc(db, 'clubs', clubId, 'inventory_members', memberId);

      await updateDoc(memberRef, {
        statut: 'inactif',
        updatedAt: serverTimestamp()
      });

      logger.debug(`Membre désactivé (soft delete): ${memberId}`);
    } catch (error) {
      logger.error('Erreur suppression membre:', error);
      throw error;
    }
  }

  // ========================================
  // IMPORT XLS
  // ========================================

  /**
   * Prévisualiser un import XLS (5 premières lignes)
   */
  static async previewImport(file: File): Promise<{ columns: string[]; rows: any[]; encodingIssues: EncodingIssue[] }> {
    try {
      // Dynamic import for code splitting - XLSX is ~200KB
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

      if (jsonData.length === 0) {
        throw new Error('Fichier vide');
      }

      const columns = jsonData[0] as string[];
      const rows = jsonData.slice(1, 6); // 5 premières lignes

      // Detect encoding issues in all data (not just preview rows)
      const allRows = jsonData.slice(1);
      const encodingIssues = this.detectEncodingIssues(allRows, columns);

      return { columns, rows, encodingIssues };
    } catch (error) {
      logger.error('Erreur prévisualisation import:', error);
      throw error;
    }
  }

  /**
   * Detect encoding issues in imported data
   * Common patterns: 鮶, 鶶, � and other non-standard characters in name fields
   */
  static detectEncodingIssues(rows: any[][], columns: string[]): EncodingIssue[] {
    const issues: EncodingIssue[] = [];
    const seenValues = new Set<string>(); // Avoid duplicates

    // Columns that typically contain names (where encoding issues matter most)
    const nameColumnPatterns = ['nom', 'prenom', 'prénom', 'name', 'localité', 'localite', 'adresse'];
    const nameColumnIndexes: number[] = [];

    columns.forEach((col, idx) => {
      const colLower = col.toLowerCase();
      if (nameColumnPatterns.some(p => colLower.includes(p))) {
        nameColumnIndexes.push(idx);
      }
    });

    // Regex to detect problematic characters
    // Matches CJK characters (likely encoding errors), replacement chars, and HTML entities
    const problematicPattern = /[\u4E00-\u9FFF\u3400-\u4DBF\uFFFD]|&#?\w+;|<[^>]+>/;

    rows.forEach((row, rowIdx) => {
      nameColumnIndexes.forEach(colIdx => {
        const value = row[colIdx]?.toString().trim();
        if (value && problematicPattern.test(value) && !seenValues.has(value)) {
          seenValues.add(value);
          issues.push({
            row: rowIdx + 2, // +2 because: +1 for header, +1 for 1-indexed
            column: columns[colIdx],
            value: value,
            suggestedCorrection: this.suggestCorrection(value)
          });
        }
      });
    });

    return issues;
  }

  /**
   * Try to suggest a correction for encoding issues
   * Based on common patterns we've seen
   */
  static suggestCorrection(value: string): string | undefined {
    // Remove HTML tags
    let cleaned = value.replace(/<[^>]+>/g, '');

    // Common replacements for encoding errors
    const replacements: Record<string, string> = {
      '鮶': 'é',
      '鶶': 'é',
      '閟': 'è',
      '閞': 'ê',
      '錮': 'ô',
      '錩': 'î',
      '錥': 'â',
      '錢': 'û',
      '鑉': 'ù',
      '闘': 'à',
      '\uFFFD': '', // Unicode replacement character
    };

    Object.entries(replacements).forEach(([bad, good]) => {
      cleaned = cleaned.split(bad).join(good);
    });

    // If we made changes, return the suggestion
    if (cleaned !== value) {
      return cleaned;
    }

    return undefined;
  }

  /**
   * Get saved encoding corrections from Firestore settings
   */
  static async getEncodingCorrections(clubId: string): Promise<EncodingCorrection[]> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'import_corrections');
      const snapshot = await getDoc(settingsRef);

      if (snapshot.exists()) {
        return snapshot.data().corrections || [];
      }
      return [];
    } catch (error) {
      logger.error('Erreur chargement corrections encodage:', error);
      return [];
    }
  }

  /**
   * Save encoding corrections to Firestore settings
   */
  static async saveEncodingCorrections(clubId: string, corrections: EncodingCorrection[]): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'import_corrections');
      await setDoc(settingsRef, {
        corrections,
        updatedAt: serverTimestamp()
      }, { merge: true });
      logger.debug(`Saved ${corrections.length} encoding corrections`);
    } catch (error) {
      logger.error('Erreur sauvegarde corrections encodage:', error);
      throw error;
    }
  }

  /**
   * Apply saved encoding corrections to a value
   */
  static applyEncodingCorrections(value: string, corrections: EncodingCorrection[]): string {
    let result = value;
    corrections.forEach(correction => {
      if (result.includes(correction.original)) {
        result = result.split(correction.original).join(correction.corrected);
      }
    });
    return result;
  }

  /**
   * Importer des membres depuis un fichier XLS
   *
   * Colonnes attendues (ordre flexible):
   * - Nom (obligatoire)
   * - Prénom (obligatoire)
   * - Email (obligatoire)
   * - Téléphone (optionnel)
   * - Niveau plongée (optionnel)
   * - Licence LIFRAS (optionnel)
   * - Date adhésion (optionnel)
   * - Statut (optionnel, défaut: actif)
   */
  static async importMembersFromXLS(
    clubId: string,
    file: File,
    columnMapping?: Record<string, string>,
    encodingCorrections?: EncodingCorrection[]
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Dynamic import for code splitting - XLSX is ~200KB
      const XLSX = await import('xlsx');
      // Lire le fichier XLS (supporte les exports HTML-based type iClubSport)
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convertir en array of arrays
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (data.length === 0) {
        throw new Error('Fichier vide');
      }

      // Première ligne = headers
      const headers = data[0];
      logger.debug(`📊 Import XLS: ${data.length - 1} lignes de données, ${headers.length} colonnes`);

      // Trouver index des colonnes (format export.xls LIFRAS)
      const colIndexes = {
        lifrasID: headers.indexOf('LifrasID'),
        nrFebras: headers.indexOf('Nr.Febras'),
        nom: headers.indexOf('Nom'),
        prenom: headers.indexOf('Prenom'),
        adresse: headers.indexOf('Adresse'),
        codePostal: headers.indexOf('Code postal'),
        localite: headers.indexOf('Localité'),
        email: headers.indexOf('Email 1'),
        gsm: headers.indexOf('GSM 1'),
        certifDate: headers.indexOf('Date du certificat médical'),
        certifValidite: headers.indexOf('Validité du certificat médical'),
        ice: headers.indexOf('ICE'),
        pays: headers.indexOf('Pays'),
        dateNaissance: headers.indexOf('Date de naissance'),
        newsletter: headers.indexOf('Newsletter'),
        niveauPlongeur: headers.indexOf('Plongeur')
      };

      // Vérifier colonnes obligatoires
      if (colIndexes.nom === -1 || colIndexes.prenom === -1) {
        throw new Error('Colonnes "Nom" et "Prenom" obligatoires');
      }

      // Récupérer membres existants pour détecter doublons
      const existingMembers = await this.getMembers(clubId);
      const existingLifrasIds = new Set(existingMembers.map(m => m.licence_lifras).filter(Boolean));
      const existingEmails = new Set(existingMembers.map(m => m.email?.toLowerCase()).filter(Boolean));

      // Parser chaque ligne (skip header)
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rowNumber = i + 1;

        try {
          const lifrasId = row[colIndexes.lifrasID]?.toString().trim();

          // Apply encoding corrections if provided
          let nom = row[colIndexes.nom]?.toString().trim();
          let prenom = row[colIndexes.prenom]?.toString().trim();
          let localite = row[colIndexes.localite]?.toString().trim();
          let adresse = row[colIndexes.adresse]?.toString().trim();

          if (encodingCorrections && encodingCorrections.length > 0) {
            if (nom) nom = this.applyEncodingCorrections(nom, encodingCorrections);
            if (prenom) prenom = this.applyEncodingCorrections(prenom, encodingCorrections);
            if (localite) localite = this.applyEncodingCorrections(localite, encodingCorrections);
            if (adresse) adresse = this.applyEncodingCorrections(adresse, encodingCorrections);
          }

          const email = row[colIndexes.email]?.toString().trim()?.toLowerCase();

          // Validation basique
          if (!nom || !prenom) {
            result.errors.push({
              row: rowNumber,
              message: 'Nom et Prénom obligatoires'
            });
            result.skipped++;
            continue;
          }

          // Vérifier doublon par LifrasID ou Email
          if (lifrasId && existingLifrasIds.has(lifrasId)) {
            result.skipped++;
            logger.debug(`Membre existant (LifrasID ${lifrasId}): ${prenom} ${nom}`);
            continue;
          }

          if (email && existingEmails.has(email)) {
            result.skipped++;
            logger.debug(`Membre existant (email ${email}): ${prenom} ${nom}`);
            continue;
          }

          // Créer le membre avec tous les champs disponibles
          const plongeurNiveau = row[colIndexes.niveauPlongeur]?.toString().trim() || undefined;
          const plongeurCode = calculatePlongeurCode(plongeurNiveau);

          const memberData: Omit<Member, 'id' | 'createdAt' | 'updatedAt' | 'isDebutant' | 'anciennete'> = {
            licence_lifras: lifrasId || undefined,
            nr_febras: row[colIndexes.nrFebras]?.toString().trim() || undefined,
            nom,
            prenom,
            email: email || `${lifrasId}@temp.local`, // Email temporaire si manquant
            telephone: row[colIndexes.gsm]?.toString().trim() || undefined,
            adresse: adresse || undefined,
            code_postal: row[colIndexes.codePostal]?.toString().trim() || undefined,
            localite: localite || undefined,
            pays: row[colIndexes.pays]?.toString().trim() || undefined,
            ice: row[colIndexes.ice]?.toString().trim() || undefined,
            certificat_medical_date: this.parseExcelDate(row[colIndexes.certifDate]) || undefined,
            certificat_medical_validite: this.parseExcelDate(row[colIndexes.certifValidite]) || undefined,
            date_naissance: this.parseExcelDate(row[colIndexes.dateNaissance]) || undefined,
            plongeur_niveau: plongeurNiveau,
            plongeur_code: plongeurCode,
            niveau_plongee: plongeurNiveau, // Legacy field
            newsletter: this.parseExcelBoolean(row[colIndexes.newsletter]),
            statut: 'actif'
          };

          await this.createMember(clubId, memberData);

          if (lifrasId) existingLifrasIds.add(lifrasId);
          if (email) existingEmails.add(email);

          result.added++;

        } catch (error: any) {
          result.errors.push({
            row: rowNumber,
            message: error.message || 'Erreur inconnue'
          });
          result.skipped++;
        }
      }

      result.success = result.errors.length === 0;

      logger.debug(`✅ Import terminé: ${result.added} ajoutés, ${result.updated} mis à jour, ${result.skipped} ignorés, ${result.errors.length} erreurs`);

      return result;
    } catch (error: any) {
      logger.error('❌ Erreur import XLS:', error);
      throw error;
    }
  }

  // ========================================
  // STATISTIQUES & HISTORIQUE
  // ========================================

  /**
   * Récupérer les statistiques d'un membre
   */
  static async getMemberStats(clubId: string, memberId: string): Promise<{
    nbPrets: number;
    nbPretsActifs: number;
    valeurTotalePrets: number;
    nbAchats: number;
    valeurTotaleAchats: number;
    cautionsEnCours: number;
  }> {
    try {
      // TODO: Implémenter quand les collections loans et sales seront créées
      return {
        nbPrets: 0,
        nbPretsActifs: 0,
        valeurTotalePrets: 0,
        nbAchats: 0,
        valeurTotaleAchats: 0,
        cautionsEnCours: 0
      };
    } catch (error) {
      logger.error('Erreur chargement stats membre:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'historique des prêts d'un membre
   */
  static async getMemberLoans(clubId: string, memberId: string): Promise<any[]> {
    try {
      // TODO: Implémenter quand la collection loans sera créée
      return [];
    } catch (error) {
      logger.error('Erreur chargement prêts membre:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'historique des achats d'un membre
   */
  static async getMemberSales(clubId: string, memberId: string): Promise<any[]> {
    try {
      // TODO: Implémenter quand la collection sales sera créée
      return [];
    } catch (error) {
      logger.error('Erreur chargement achats membre:', error);
      throw error;
    }
  }

  // ========================================
  // UTILITAIRES
  // ========================================

  /**
   * Calculer l'ancienneté et le statut débutant d'un membre
   */
  private static calculateMemberStats(member: Member): Member {
    if (!member.date_adhesion) {
      return {
        ...member,
        anciennete: 0,
        isDebutant: true
      };
    }

    const now = new Date();
    const adhesionDate = member.date_adhesion.toDate();
    const diffYears = (now.getTime() - adhesionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    return {
      ...member,
      anciennete: Math.floor(diffYears * 10) / 10, // Arrondi à 1 décimale
      isDebutant: diffYears < 1
    };
  }

  /**
   * Détecter automatiquement les colonnes d'un fichier XLS
   */
  private static autoDetectColumns(headers: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};

    const detectColumn = (field: string, patterns: string[]) => {
      const header = headers.find(h =>
        patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))
      );
      if (header) mapping[field] = header;
    };

    detectColumn('nom', ['nom', 'name', 'last name', 'famille']);
    detectColumn('prenom', ['prenom', 'prénom', 'first name', 'firstname']);
    detectColumn('email', ['email', 'e-mail', 'mail', 'courriel']);
    detectColumn('telephone', ['tel', 'telephone', 'téléphone', 'phone', 'gsm']);
    detectColumn('niveau_plongee', ['niveau', 'level', 'plongee', 'plongée', 'brevet']);
    detectColumn('licence_lifras', ['lifras', 'licence', 'license', 'febras']);
    detectColumn('date_adhesion', ['adhesion', 'adhésion', 'date', 'inscription']);
    detectColumn('statut', ['statut', 'status', 'état', 'etat']);

    logger.debug('Mapping colonnes détecté:', mapping);

    return mapping;
  }

  /**
   * Valider un email
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Parser une date depuis différents formats
   */
  private static parseDate(value: any): Timestamp | null {
    if (!value) return null;

    try {
      // Si c'est déjà un Timestamp
      if (value instanceof Timestamp) return value;

      // Si c'est une string
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return Timestamp.fromDate(date);
        }
      }

      // Si c'est un nombre (Excel serial date)
      if (typeof value === 'number') {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) {
          return Timestamp.fromDate(date);
        }
      }

      return null;
    } catch (error) {
      logger.error('Erreur parsing date:', error);
      return null;
    }
  }

  /**
   * Parser une date Excel (DD/MM/YYYY ou serial number)
   */
  private static parseExcelDate(value: any): Timestamp | undefined {
    if (!value) return undefined;

    try {
      // Si c'est un nombre (Excel serial date)
      if (typeof value === 'number') {
        const EXCEL_EPOCH = new Date(1899, 11, 30); // 30 décembre 1899
        const date = new Date(EXCEL_EPOCH.getTime() + value * 86400000);
        return Timestamp.fromDate(date);
      }

      // Si c'est une string (format DD/MM/YYYY)
      if (typeof value === 'string') {
        const parts = value.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
          const year = parseInt(parts[2], 10);
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            const date = new Date(year, month, day);
            return Timestamp.fromDate(date);
          }
        }
      }

      // Si c'est déjà une Date
      if (value instanceof Date) {
        return Timestamp.fromDate(value);
      }

      return undefined;
    } catch (error) {
      logger.error('Erreur parsing date Excel:', error);
      return undefined;
    }
  }

  /**
   * Parser un boolean Excel (True/False ou 1/0)
   */
  private static parseExcelBoolean(value: any): boolean | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'oui' || lower === 'yes';
    }

    return undefined;
  }
}

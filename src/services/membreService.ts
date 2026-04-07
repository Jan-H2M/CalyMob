import { logger } from '@/utils/logger';
/**
 * Service unifié pour la gestion des membres (utilisateurs + membres club)
 *
 * Collection: /clubs/{clubId}/members
 *
 * Tous les membres du club sont dans cette collection unique.
 * Champs de différenciation:
 * - has_app_access: Peut se connecter à CalyCompta
 * - app_role: Rôle dans l'application (si accès app)
 * - member_status: Statut en tant que membre club
 * - is_diver: Est plongeur actif
 * - has_lifras: A une licence LIFRAS
 */

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
  addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Membre, MemberStatus, UserRole, UserStatus } from '@/types';
import { AuditAction, AuditLog } from '@/types/user.types';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { calculatePlongeurCode } from '@/utils/plongeurUtils';
// XLSX is loaded dynamically to reduce initial bundle size (~200KB)
import { ImportResult } from '@/types/inventory';

// ============================================================
// TYPES & INTERFACES
// ============================================================

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

export interface MembreFilters {
  search?: string;                    // Recherche nom/prénom/email/LIFRAS
  member_status?: MemberStatus;       // Statut membre club
  app_status?: UserStatus;            // Statut accès app
  has_app_access?: boolean;           // Filtre accès app (oui/non)
  is_diver?: boolean;                 // Filtre plongeur (oui/non)
  has_lifras?: boolean;               // Filtre licence LIFRAS (oui/non)
  niveau_plongee?: string;            // Niveau plongée spécifique
  app_role?: UserRole;                // Rôle app spécifique
}

export interface CreateMembreDTO {
  // Champs obligatoires
  nom: string;
  prenom: string;
  email: string;

  // Champs optionnels identité
  displayName?: string;
  date_naissance?: Date;

  // Contact
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  localite?: string;
  pays?: string;
  ice?: string;
  photoURL?: string;

  // Bancaire
  iban?: string;
  ibans?: string[];

  // Plongée
  lifras_id?: string;
  nr_febras?: string;
  niveau_plongee?: string;
  date_adhesion?: Date;
  certificat_medical_date?: Date;
  certificat_medical_validite?: Date;

  // Accès app
  has_app_access: boolean;
  app_role?: UserRole;
  app_status?: UserStatus;

  // Statut membre
  member_status: MemberStatus;
  is_diver: boolean;
  has_lifras: boolean;

  // Préférences
  newsletter?: boolean;
  preferences?: {
    language?: 'fr' | 'nl' | 'en';
    notifications?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  };
}

export interface UpdateMembreDTO {
  // Identité
  nom?: string;
  prenom?: string;
  displayName?: string;
  email?: string;
  date_naissance?: Date;
  sexe?: 'M' | 'F';

  // Contact
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  localite?: string;
  pays?: string;
  ice?: string;
  photoURL?: string;
  
  // Bancaire
  iban?: string;
  ibans?: string[];
  
  // Plongée
  lifras_id?: string;
  nr_febras?: string;
  niveau_plongee?: string;
  plongeur_niveau?: string;
  plongeur_code?: string;
  date_adhesion?: Date;
  certificat_medical_date?: Date;
  certificat_medical_validite?: Date;
  anciennete?: number;
  isDebutant?: boolean;
  
  // Accès app
  has_app_access?: boolean;
  app_role?: UserRole;
  app_status?: UserStatus;
  
  // Statut membre
  member_status?: MemberStatus;
  is_diver?: boolean;
  has_lifras?: boolean;
  
  // Préférences
  newsletter?: boolean;
  preferences?: {
    language?: 'fr' | 'nl' | 'en';
    notifications?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  };
  
  // Métadonnées
  lastLogin?: Timestamp;
  billing_audit_history?: import('@/types').MemberFieldAudit[];
  
  // Index signature pour backward compatibility avec champs legacy
  [key: string]: unknown;
}

// ============================================================
// CRUD MEMBRES
// ============================================================

/**
 * Récupère tous les membres avec filtres optionnels
 */
export async function getMembres(
  clubId: string,
  filters?: MembreFilters
): Promise<Membre[]> {
  try {
    const membresRef = collection(db, 'clubs', clubId, 'members');
    let q = query(membresRef);

    // Filtres Firestore (limités par index)
    if (filters?.member_status) {
      q = query(q, where('member_status', '==', filters.member_status));
    }
    if (filters?.has_app_access !== undefined) {
      q = query(q, where('has_app_access', '==', filters.has_app_access));
    }
    if (filters?.is_diver !== undefined) {
      q = query(q, where('is_diver', '==', filters.is_diver));
    }
    if (filters?.has_lifras !== undefined) {
      q = query(q, where('has_lifras', '==', filters.has_lifras));
    }
    if (filters?.app_role) {
      q = query(q, where('app_role', '==', filters.app_role));
    }

    // Ordre par défaut
    q = query(q, orderBy('nom'), orderBy('prenom'));

    const snapshot = await getDocs(q);
    let membres = snapshot.docs.filter(doc => !doc.data().is_test_account).map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().created_at?.toDate?.() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updated_at?.toDate?.() || new Date(),
      date_naissance: doc.data().date_naissance?.toDate?.(),
      date_adhesion: doc.data().date_adhesion?.toDate?.(),
      certificat_medical_date: doc.data().certificat_medical_date?.toDate?.(),
      certificat_medical_validite: doc.data().certificat_medical_validite?.toDate?.(),
      cotisation_validite: doc.data().cotisation_validite?.toDate?.(),
      lastLogin: doc.data().lastLogin?.toDate?.(),
    })) as Membre[];

    // Filtres côté client (non supportés par Firestore)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      membres = membres.filter(m => {
        const lastName = (getLastName(m) || '').toLowerCase();
        const firstName = (getFirstName(m) || '').toLowerCase();
        return lastName.includes(searchLower) ||
          firstName.includes(searchLower) ||
          m.email.toLowerCase().includes(searchLower) ||
          (m.lifras_id && m.lifras_id.toLowerCase().includes(searchLower)) ||
          (m.displayName && m.displayName.toLowerCase().includes(searchLower));
      });
    }

    if (filters?.niveau_plongee) {
      membres = membres.filter(m => m.niveau_plongee === filters.niveau_plongee);
    }

    if (filters?.app_status) {
      membres = membres.filter(m => m.app_status === filters.app_status);
    }

    return membres;
  } catch (error) {
    logger.error('Error fetching membres:', error);
    throw error;
  }
}

/**
 * Récupère un membre par ID
 */
export async function getMembreById(
  clubId: string,
  membreId: string
): Promise<Membre | null> {
  try {
    const membreRef = doc(db, 'clubs', clubId, 'members', membreId);
    const snapshot = await getDoc(membreRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.created_at?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || data.updated_at?.toDate?.() || new Date(),
      date_naissance: data.date_naissance?.toDate?.(),
      date_adhesion: data.date_adhesion?.toDate?.(),
      certificat_medical_date: data.certificat_medical_date?.toDate?.(),
      certificat_medical_validite: data.certificat_medical_validite?.toDate?.(),
      cotisation_validite: data.cotisation_validite?.toDate?.(),
      lastLogin: data.lastLogin?.toDate?.(),
    } as Membre;
  } catch (error) {
    logger.error('Error fetching membre:', error);
    throw error;
  }
}

/**
 * Vérifie si un membre avec le même nom+prénom existe déjà
 * @returns Le membre existant si doublon trouvé, sinon null
 */
export async function checkDuplicateName(
  clubId: string,
  nom: string,
  prenom: string,
  excludeMembreId?: string
): Promise<Membre | null> {
  try {
    const membresRef = collection(db, 'clubs', clubId, 'members');
    const q = query(
      membresRef,
      where('nom', '==', nom.toUpperCase().trim()),
      where('prenom', '==', prenom.trim())
    );
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      if (excludeMembreId && docSnap.id === excludeMembreId) continue;
      return { id: docSnap.id, ...docSnap.data() } as Membre;
    }
    return null;
  } catch (error) {
    logger.error('Error checking duplicate name:', error);
    throw error;
  }
}

/**
 * Crée un nouveau membre
 */
export async function createMembre(
  clubId: string,
  data: CreateMembreDTO,
  createdBy?: string
): Promise<string> {
  try {
    const membresRef = collection(db, 'clubs', clubId, 'members');
    const now = Timestamp.now();

    // Calculer displayName si absent
    const firstName = getFirstName(data as unknown as Membre) || '';
    const lastName = getLastName(data as unknown as Membre) || '';
    const displayName = data.displayName || `${firstName} ${lastName}`.trim();

    // Calculer ancienneté et isDebutant si date_adhesion fournie
    let anciennete: number | undefined;
    let isDebutant: boolean | undefined;
    if (data.date_adhesion) {
      const now = new Date();
      const adhesion = data.date_adhesion;
      anciennete = Math.floor((now.getTime() - adhesion.getTime()) / (1000 * 60 * 60 * 24 * 365));
      isDebutant = anciennete < 1;
    }

    // Calculer plongeur_code si niveau_plongee fourni
    const plongeurCode = data.niveau_plongee ? calculatePlongeurCode(data.niveau_plongee) : undefined;

    const membreData = {
      ...data,
      displayName,
      anciennete,
      isDebutant,
      plongeur_code: plongeurCode,
      createdAt: now,
      updatedAt: now,
      metadata: {
        createdBy: createdBy || 'system',
      },
    };

    const docRef = await addDoc(membresRef, membreData);

    // Log audit
    await logAuditAction(clubId, docRef.id, 'member_created', createdBy || 'system', {
      lastName: lastName,
      firstName: firstName,
      email: data.email,
      has_app_access: data.has_app_access,
      app_role: data.app_role,
    });

    return docRef.id;
  } catch (error) {
    logger.error('Error creating membre:', error);
    throw error;
  }
}

/**
 * Met à jour un membre existant
 * @param auditInfo Optional audit info for field tracking (user info, current member data)
 */
export async function updateMembre(
  clubId: string,
  membreId: string,
  data: UpdateMembreDTO,
  updatedBy?: string,
  auditInfo?: {
    userId: string;
    userName: string;
    currentMembre?: Membre;
  }
): Promise<void> {
  try {
    const membreRef = doc(db, 'clubs', clubId, 'members', membreId);
    const now = Timestamp.now();

    // Mettre à jour ancienneté si date_adhesion modifiée
    if (data.date_adhesion) {
      const nowDate = new Date();
      const adhesion = data.date_adhesion;
      data.anciennete = Math.floor((nowDate.getTime() - adhesion.getTime()) / (1000 * 60 * 60 * 24 * 365));
      data.isDebutant = data.anciennete < 1;
    }

    // Recalculer plongeur_code si plongeur_niveau modifié
    if (data.plongeur_niveau !== undefined) {
      data.plongeur_code = calculatePlongeurCode(data.plongeur_niveau);
    }

    // ✅ Field audit trail voor kritieke velden (IBAN, role, access)
    const billingCriticalFields = ['iban', 'ibans', 'app_role', 'has_app_access'];
    const auditEntries: import('@/types').MemberFieldAudit[] = [];

    if (auditInfo && auditInfo.currentMembre) {
      for (const field of billingCriticalFields) {
        const oldValue = auditInfo.currentMembre[field as keyof Membre];
        const newValue = data[field as keyof UpdateMembreDTO];

        if (field in data && oldValue !== newValue) {
          auditEntries.push({
            field,
            old_value: oldValue,
            new_value: newValue,
            changed_by: auditInfo.userId,
            changed_by_name: auditInfo.userName,
            changed_at: new Date()
          });
        }
      }
    }

    const updateData: UpdateMembreDTO & { updatedAt: Timestamp; billing_audit_history?: import('@/types').MemberFieldAudit[] } = {
      ...data,
      updatedAt: now,
    };

    // Voeg billing audit history toe als er wijzigingen zijn
    if (auditEntries.length > 0) {
      updateData.billing_audit_history = [
        ...(auditInfo?.currentMembre?.billing_audit_history || []),
        ...auditEntries
      ];
    }

    await updateDoc(membreRef, updateData);

    // Log audit pour changements importants
    const importantFields = ['app_role', 'app_status', 'member_status', 'has_app_access'];
    const changedImportantFields = Object.keys(data).filter(key => importantFields.includes(key));

    if (changedImportantFields.length > 0) {
      await logAuditAction(clubId, membreId, 'member_updated', updatedBy || 'system', {
        fields: changedImportantFields,
        values: changedImportantFields.reduce((acc, field) => {
          acc[field] = data[field];
          return acc;
        }, {} as Record<string, any>),
      });
    }
  } catch (error) {
    logger.error('Error updating membre:', error);
    throw error;
  }
}

/**
 * Supprime un membre (soft delete)
 */
export async function deleteMembre(
  clubId: string,
  membreId: string,
  deletedBy?: string
): Promise<void> {
  try {
    // Soft delete: marquer comme archived
    await updateMembre(clubId, membreId, {
      member_status: 'archived',
      app_status: 'deleted',
      has_app_access: false,
    }, deletedBy);

    // Log audit
    await logAuditAction(clubId, membreId, 'member_deleted', deletedBy || 'system');
  } catch (error) {
    logger.error('Error deleting membre:', error);
    throw error;
  }
}

/**
 * Supprime définitivement un membre (hard delete - admin only)
 */
export async function hardDeleteMembre(
  clubId: string,
  membreId: string,
  deletedBy?: string
): Promise<void> {
  try {
    const membreRef = doc(db, 'clubs', clubId, 'members', membreId);

    // Récupérer données avant suppression pour audit
    const membreSnap = await getDoc(membreRef);
    const membreData = membreSnap.data();

    await deleteDoc(membreRef);

    // Log audit
    const deletedLastName = membreData ? getLastName(membreData as any) : null;
    const deletedFirstName = membreData ? getFirstName(membreData as any) : null;
    await logAuditAction(clubId, membreId, 'member_hard_deleted', deletedBy || 'system', {
      deleted_data: {
        lastName: deletedLastName,
        firstName: deletedFirstName,
        email: membreData?.email,
      }
    });
  } catch (error) {
    logger.error('Error hard deleting membre:', error);
    throw error;
  }
}

// ============================================================
// GESTION ACCÈS APPLICATION
// ============================================================

/**
 * Donne accès à l'application à un membre existant
 */
export async function grantAppAccess(
  clubId: string,
  membreId: string,
  role: UserRole,
  grantedBy?: string
): Promise<void> {
  try {
    await updateMembre(clubId, membreId, {
      has_app_access: true,
      app_role: role,
      app_status: 'active',
    }, grantedBy);

    await logAuditAction(clubId, membreId, 'app_access_granted', grantedBy || 'system', { role });
  } catch (error) {
    logger.error('Error granting app access:', error);
    throw error;
  }
}

/**
 * Retire l'accès à l'application à un membre
 */
export async function revokeAppAccess(
  clubId: string,
  membreId: string,
  revokedBy?: string
): Promise<void> {
  try {
    await updateMembre(clubId, membreId, {
      has_app_access: false,
      app_status: 'inactive',
    }, revokedBy);

    await logAuditAction(clubId, membreId, 'app_access_revoked', revokedBy || 'system');
  } catch (error) {
    logger.error('Error revoking app access:', error);
    throw error;
  }
}

/**
 * Change le rôle app d'un membre
 */
export async function changeAppRole(
  clubId: string,
  membreId: string,
  newRole: UserRole,
  changedBy?: string
): Promise<void> {
  try {
    logger.debug('🔄 [changeAppRole] Starting role change:', { clubId, membreId, newRole, changedBy });

    // Vérifier que le membre a accès app
    const membre = await getMembreById(clubId, membreId);
    logger.debug('👤 [changeAppRole] Current member data:', {
      id: membre?.id,
      has_app_access: membre?.has_app_access,
      current_app_role: membre?.app_role
    });

    if (!membre?.has_app_access) {
      throw new Error('Le membre doit avoir accès à l\'application pour changer de rôle');
    }

    logger.debug('📝 [changeAppRole] Calling updateMembre with app_role:', newRole);
    await updateMembre(clubId, membreId, {
      app_role: newRole,
    }, changedBy);
    logger.debug('✅ [changeAppRole] updateMembre completed');

    await logAuditAction(clubId, membreId, 'app_role_changed', changedBy || 'system', {
      old_role: membre.app_role,
      new_role: newRole,
    });
    logger.debug('✅ [changeAppRole] Role change complete');
  } catch (error) {
    logger.error('❌ [changeAppRole] Error:', error);
    throw error;
  }
}

/**
 * Active/désactive l'accès app d'un membre
 */
export async function activateAppAccess(
  clubId: string,
  membreId: string,
  activate: boolean,
  changedBy?: string
): Promise<void> {
  try {
    const newStatus: UserStatus = activate ? 'active' : 'inactive';

    await updateMembre(clubId, membreId, {
      app_status: newStatus,
    }, changedBy);

    await logAuditAction(
      clubId,
      membreId,
      activate ? 'app_access_activated' : 'app_access_deactivated',
      changedBy || 'system'
    );
  } catch (error) {
    logger.error('Error activating/deactivating app access:', error);
    throw error;
  }
}

// ============================================================
// IMPORT XLS - UTILITAIRES
// ============================================================

/**
 * Parser une date Excel (DD/MM/YYYY ou serial number)
 */
function parseExcelDate(value: unknown): Date | undefined {
  if (!value) return undefined;

  try {
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
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
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
  } catch (error) {
    logger.error('Erreur parsing date Excel:', error);
    return undefined;
  }
}


/**
 * Common encoding replacements for Windows-1252 misread characters
 * Based on actual iClubSport export data analysis
 * MUST be defined before functions that use it
 */
const ENCODING_REPLACEMENTS: Record<string, string> = {
  // CJK characters that appear for French accents (Windows-1252 → wrong encoding)
  '鮶': 'é',   // Sébastien
  '鶶': 'é',
  '閟': 'è',
  '閞': 'ê',   // Also seen in Zoé corrupted
  '錮': 'ô',
  '錩': 'î',
  '錥': 'â',
  '錢': 'û',
  '鑉': 'ù',   // Célestin → C鑉stin
  '闘': 'à',
  '鼯': 'é',   // Rémi → R鼯
  '물': 'ë',   // Michaël → Micha물
  '魩': 'é',
  '鬥': 'é',
  '꒤': 'é',   // Alizée
  '∂': 'U',   // DURE → D∂URE (or could be ü)
  '閝': 'é',   // Chaussée

  // Unicode replacement character
  '\uFFFD': '',

  // HTML entities that might appear
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&agrave;': 'à',
  '&ocirc;': 'ô',
  '&nbsp;': ' ',
};

/**
 * Clean encoding issues from a string value
 * Handles HTML tags, CJK encoding errors, and extracts clean data
 */
function cleanEncodingIssues(value: string): string {
  if (!value) return value;

  let cleaned = value;

  // 1. First, check if value contains HTML tag fragments indicating merged columns
  // Pattern: "Prénom</td><td>Adresse" - we want just the first part (prénom)
  const tdSplitMatch = cleaned.match(/^([^<]+)<\/td>/i);
  if (tdSplitMatch) {
    // Take only the part before the </td> tag
    cleaned = tdSplitMatch[1];
  }

  // 2. Remove any remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // 3. Apply character replacements
  Object.entries(ENCODING_REPLACEMENTS).forEach(([bad, good]) => {
    cleaned = cleaned.split(bad).join(good);
  });

  // 4. Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}


/**
 * Nettoie une chaîne (trim, suppression HTML tags, corrections encodage)
 */
function cleanString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  let str = String(value).trim();

  // Appliquer le nettoyage complet (HTML, encodage, etc.)
  str = cleanEncodingIssues(str);

  return str || undefined;
}

/**
 * Try to suggest a correction for encoding issues
 * Based on common patterns we've seen
 */
function suggestCorrection(value: string): string | undefined {
  let cleaned = cleanEncodingIssues(value);

  // If we made changes, return the suggestion
  if (cleaned !== value) {
    return cleaned;
  }

  return undefined;
}

/**
 * Detect encoding issues in imported data
 * Common patterns: CJK characters, replacement chars in name fields
 */
export function detectEncodingIssues(rows: unknown[][], columns: string[]): EncodingIssue[] {
  const issues: EncodingIssue[] = [];
  const seenValues = new Set<string>(); // Avoid duplicates

  // Columns that typically contain names (where encoding issues matter most)
  const nameColumnPatterns = ['nom', 'prenom', 'prénom', 'name', 'localité', 'localite', 'adresse'];
  const nameColumnIndexes: number[] = [];

  columns.forEach((col, idx) => {
    const colLower = (col || '').toLowerCase();
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
          suggestedCorrection: suggestCorrection(value)
        });
      }
    });
  });

  return issues;
}

/**
 * Get saved encoding corrections from Firestore settings
 */
export async function getEncodingCorrections(clubId: string): Promise<EncodingCorrection[]> {
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
export async function saveEncodingCorrections(clubId: string, corrections: EncodingCorrection[]): Promise<void> {
  try {
    const settingsRef = doc(db, 'clubs', clubId, 'settings', 'import_corrections');
    await setDoc(settingsRef, {
      corrections,
      updatedAt: Timestamp.now()
    }, { merge: true });
    logger.debug(`Saved ${corrections.length} encoding corrections`);
  } catch (error) {
    logger.error('Erreur sauvegarde corrections encodage:', error);
    throw error;
  }
}

/**
 * Prévisualiser un import XLS (5 premières lignes)
 */
export async function previewImport(file: File): Promise<{ columns: string[]; rows: unknown[][]; encodingIssues: EncodingIssue[] }> {
  try {
    // Dynamic import for code splitting - XLSX is ~200KB
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];

    if (jsonData.length === 0) {
      throw new Error('Fichier vide');
    }

    const columns = (jsonData[0] as string[]).map(c => c?.toString() || '');
    const rows = jsonData.slice(1, 6); // 5 premières lignes

    // Detect encoding issues in all data (not just preview rows)
    const allRows = jsonData.slice(1);
    const encodingIssues = detectEncodingIssues(allRows, columns);

    return { columns, rows, encodingIssues };
  } catch (error) {
    logger.error('Erreur prévisualisation import:', error);
    throw error;
  }
}

// ============================================================
// IMPORT XLS - FONCTION PRINCIPALE
// ============================================================

/**
 * Importe des membres depuis un fichier Excel (format Organon / Lifras)
 *
 * Logique:
 * 1. UPDATE: Met à jour les membres existants (match par Numéro de licence)
 * 2. CREATE: Crée les nouveaux membres (licence non trouvée)
 * 3. DEACTIVATE: Désactive les membres absents du fichier
 *
 * Le fichier Organon est la SOURCE DE VÉRITÉ :
 * - Présent = actif, cotisation en ordre, médical en ordre
 * - Absent = inactif
 */
export async function importMembresFromXLS(
  clubId: string,
  file: File,
  importedBy?: string,
  _encodingCorrections?: EncodingCorrection[]
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    added: 0,
    updated: 0,
    deactivated: 0,
    skipped: 0,
    errors: []
  };

  try {
    // Dynamic import for code splitting - XLSX is ~200KB
    const XLSX = await import('xlsx');
    // 1. Lire le fichier Excel (Organon = vrai XLSX)
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length === 0) {
      throw new Error('Fichier vide');
    }

    // 2. Mapper les colonnes (format Organon / Lifras)
    const headers = (data[0] as string[]).map(h => String(h || '').trim());
    logger.debug(`📊 Import Organon: ${data.length - 1} lignes, ${headers.length} colonnes`);
    logger.debug(`📊 Colonnes trouvées:`, headers);

    const findCol = (name: string, fallback?: string): number => {
      let idx = headers.indexOf(name);
      if (idx !== -1) return idx;
      if (fallback) {
        idx = headers.findIndex(h => h.toLowerCase().includes(fallback.toLowerCase()));
      }
      return idx;
    };

    const col = {
      nom: findCol('Nom'),
      prenom: findCol('Prénom', 'prenom'),
      dateNaissance: findCol('Date de naissance', 'naissance'),
      sexe: findCol('Sexe'),
      adresse: findCol('Adresse'),
      gsm: findCol('GSM'),
      telephone: findCol('Téléphone', 'phone'),
      email: findCol('E-mail', 'mail'),
      statutChronologique: findCol('Statut chronologique', 'statut'),
      typeLicence: findCol('Type de la dernière licence', 'licence'),
      numeroLicence: findCol('Numéro de licence', 'numéro'),
    };

    logger.debug(`📊 Index colonnes:`, col);

    // Vérifier colonnes obligatoires
    if (col.numeroLicence === -1) {
      throw new Error('Colonne "Numéro de licence" obligatoire pour l\'import');
    }
    if (col.nom === -1 || col.prenom === -1) {
      throw new Error('Colonnes "Nom" et "Prénom" obligatoires');
    }

    // 3. Charger tous les membres existants (indexés par LifrasID)
    const existingMembers = await getMembres(clubId);
    const membersByLifrasId = new Map<string, Membre>();

    existingMembers.forEach(m => {
      if (m.lifras_id) {
        membersByLifrasId.set(m.lifras_id, m);
      }
    });

    logger.debug(`📋 ${existingMembers.length} membres existants, ${membersByLifrasId.size} avec LifrasID`);

    // Set pour tracker les LifrasIDs traités
    const processedLifrasIds = new Set<string>();

    // 4. Traiter chaque ligne du fichier
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as any[];
      const rowNumber = i + 1;

      try {
        const lifrasId = cleanString(row[col.numeroLicence]);

        if (!lifrasId) {
          result.errors.push({ row: rowNumber, message: 'Numéro de licence manquant' });
          result.skipped++;
          continue;
        }

        processedLifrasIds.add(lifrasId);

        const nom = cleanString(row[col.nom]);
        const prenom = cleanString(row[col.prenom]);

        if (!nom || !prenom) {
          result.errors.push({ row: rowNumber, message: 'Nom et Prénom obligatoires' });
          result.skipped++;
          continue;
        }

        const email = cleanString(row[col.email])?.toLowerCase();
        const gsmValue = cleanString(row[col.gsm]);
        const telValue = cleanString(row[col.telephone]);
        const phoneNumber = gsmValue || telValue;

        // Sexe
        const sexeRaw = cleanString(row[col.sexe]);
        const sexe = sexeRaw?.toLowerCase() === 'féminin' ? 'F' : sexeRaw?.toLowerCase() === 'masculin' ? 'M' : undefined;

        // Préparer données membre (champs importables depuis Organon)
        const memberData: UpdateMembreDTO = {
          lifras_id: lifrasId,
          nom,
          prenom,
          displayName: `${prenom} ${nom}`,
          email: email || `${lifrasId}@temp.local`,
          telephone: phoneNumber,
          adresse: cleanString(row[col.adresse]),
          date_naissance: parseExcelDate(row[col.dateNaissance]),
          sexe,
          has_lifras: true,
          is_diver: true,
        };

        const existing = membersByLifrasId.get(lifrasId);

        if (existing) {
          // UPDATE membre existant - toujours actif si dans le fichier Organon
          memberData.member_status = 'active';

          await updateMembre(clubId, existing.id, memberData, importedBy);
          result.updated++;
          logger.debug(`✏️ Mis à jour: ${prenom} ${nom} (${lifrasId})`);
        } else {
          // CREATE nouveau membre
          const createData: CreateMembreDTO = {
            ...memberData as any,
            email: memberData.email || `${lifrasId}@temp.local`,
            has_app_access: false,
            member_status: 'active',
            is_diver: true,
            has_lifras: true,
          };

          await createMembre(clubId, createData, importedBy);
          result.added++;
          logger.debug(`➕ Ajouté: ${prenom} ${nom} (${lifrasId})`);
        }

      } catch (error) {
        result.errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Erreur inconnue'
        });
        result.skipped++;
      }
    }

    // 5. Désactiver les membres absents du fichier (seulement ceux avec LifrasID et actifs)
    for (const [lifrasId, member] of membersByLifrasId) {
      if (!processedLifrasIds.has(lifrasId) && member.member_status === 'active') {
        try {
          await updateMembre(clubId, member.id, {
            member_status: 'inactive',
            actif: false,
            isActive: false,
          }, importedBy);
          result.deactivated++;
          logger.debug(`🔴 Désactivé: ${member.prenom} ${member.nom} (${lifrasId}) - absent du fichier`);
        } catch (error) {
          result.errors.push({
            row: 0,
            message: `Erreur désactivation ${member.nom}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
          });
        }
      }
    }

    result.success = result.errors.length === 0;

    logger.debug(`✅ Import terminé: ${result.added} ajoutés, ${result.updated} mis à jour, ${result.deactivated} désactivés, ${result.skipped} ignorés, ${result.errors.length} erreurs`);

    // Sauvegarder les métadonnées de l'import
    try {
      const metaRef = doc(db, 'clubs', clubId, 'settings', 'import_metadata');
      await setDoc(metaRef, {
        lastImportDate: Timestamp.now(),
        lastImportedBy: importedBy || 'system',
        stats: {
          added: result.added,
          updated: result.updated,
          deactivated: result.deactivated,
          skipped: result.skipped,
          errors: result.errors.length,
        },
      }, { merge: true });
    } catch (metaError) {
      logger.error('Erreur sauvegarde métadonnées import:', metaError);
    }

    return result;
  } catch (error) {
    logger.error('❌ Erreur import Organon:', error);
    throw error;
  }
}

// ============================================================
// IMPORT METADATA
// ============================================================

/**
 * Récupère les métadonnées du dernier import
 */
export async function getLastImportMetadata(clubId: string): Promise<{
  lastImportDate: Date | null;
  lastImportedBy: string | null;
  stats: { added: number; updated: number; deactivated: number; skipped: number; errors: number } | null;
} | null> {
  try {
    const metaRef = doc(db, 'clubs', clubId, 'settings', 'import_metadata');
    const snap = await getDoc(metaRef);
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
      lastImportDate: data.lastImportDate?.toDate?.() || null,
      lastImportedBy: data.lastImportedBy || null,
      stats: data.stats || null,
    };
  } catch (error) {
    logger.error('Erreur lecture métadonnées import:', error);
    return null;
  }
}

// ============================================================
// AUDIT LOGS
// ============================================================

/**
 * Enregistre une action dans les logs d'audit
 */
async function logAuditAction(
  clubId: string,
  membreId: string,
  action: AuditAction,
  performedBy: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    const auditRef = collection(db, 'clubs', clubId, 'audit_logs');
    const now = Timestamp.now();

    const auditLog: Omit<AuditLog, 'id'> = {
      userId: membreId,
      action,
      timestamp: now.toDate(),
      details: { ...(details || {}), performedBy },
      ipAddress: undefined,
      userAgent: navigator.userAgent,
      clubId,
    };

    await addDoc(auditRef, auditLog);
  } catch (error) {
    logger.error('Error logging audit action:', error);
    // Ne pas bloquer l'opération principale si audit fail
  }
}

/**
 * Récupère les logs d'audit pour un membre
 */
export async function getAuditLogs(
  clubId: string,
  membreId?: string
): Promise<AuditLog[]> {
  try {
    const auditRef = collection(db, 'clubs', clubId, 'audit_logs');
    let q = query(auditRef, orderBy('performedAt', 'desc'));

    if (membreId) {
      q = query(q, where('userId', '==', membreId));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().performedAt?.toDate?.() || new Date(),
    })) as unknown as AuditLog[];
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    throw error;
  }
}

/**
 * Log une connexion utilisateur
 */
export async function logLogin(
  clubId: string,
  membreId: string
): Promise<void> {
  try {
    await updateMembre(clubId, membreId, {
      lastLogin: Timestamp.now(),
    });

    await logAuditAction(clubId, membreId, 'login', membreId);
  } catch (error) {
    logger.error('Error logging login:', error);
    // Ne pas bloquer la connexion si log fail
  }
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Vérifie si un email existe déjà
 */
export async function emailExists(
  clubId: string,
  email: string,
  excludeMembreId?: string
): Promise<boolean> {
  try {
    const membresRef = collection(db, 'clubs', clubId, 'members');
    const q = query(membresRef, where('email', '==', email));
    const snapshot = await getDocs(q);

    if (excludeMembreId) {
      return snapshot.docs.some(doc => doc.id !== excludeMembreId);
    }

    return !snapshot.empty;
  } catch (error) {
    logger.error('Error checking email existence:', error);
    throw error;
  }
}

/**
 * Vérifie si un LIFRAS ID existe déjà
 */
export async function lifrasIdExists(
  clubId: string,
  lifrasId: string,
  excludeMembreId?: string
): Promise<boolean> {
  try {
    const membresRef = collection(db, 'clubs', clubId, 'members');
    const q = query(membresRef, where('lifras_id', '==', lifrasId));
    const snapshot = await getDocs(q);

    if (excludeMembreId) {
      return snapshot.docs.some(doc => doc.id !== excludeMembreId);
    }

    return !snapshot.empty;
  } catch (error) {
    logger.error('Error checking LIFRAS ID existence:', error);
    throw error;
  }
}

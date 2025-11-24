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
  writeBatch,
  WhereFilterOp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Membre, MemberStatus, UserRole, UserStatus } from '@/types';
import { AuditLog } from '@/types/user.types';

// ============================================================
// TYPES & INTERFACES
// ============================================================

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
  [key: string]: any; // Flexible pour updates partiels
}

export interface ImportResult {
  success: boolean;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
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
    let membres = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().created_at?.toDate?.() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updated_at?.toDate?.() || new Date(),
      date_naissance: doc.data().date_naissance?.toDate?.(),
      date_adhesion: doc.data().date_adhesion?.toDate?.(),
      certificat_medical_date: doc.data().certificat_medical_date?.toDate?.(),
      certificat_medical_validite: doc.data().certificat_medical_validite?.toDate?.(),
      lastLogin: doc.data().lastLogin?.toDate?.(),
    })) as Membre[];

    // Filtres côté client (non supportés par Firestore)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      membres = membres.filter(m =>
        m.nom.toLowerCase().includes(searchLower) ||
        m.prenom.toLowerCase().includes(searchLower) ||
        m.email.toLowerCase().includes(searchLower) ||
        (m.lifras_id && m.lifras_id.toLowerCase().includes(searchLower)) ||
        (m.displayName && m.displayName.toLowerCase().includes(searchLower))
      );
    }

    if (filters?.niveau_plongee) {
      membres = membres.filter(m => m.niveau_plongee === filters.niveau_plongee);
    }

    if (filters?.app_status) {
      membres = membres.filter(m => m.app_status === filters.app_status);
    }

    return membres;
  } catch (error) {
    console.error('Error fetching membres:', error);
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
      lastLogin: data.lastLogin?.toDate?.(),
    } as Membre;
  } catch (error) {
    console.error('Error fetching membre:', error);
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
    const displayName = data.displayName || `${data.prenom} ${data.nom}`;

    // Calculer ancienneté et isDebutant si date_adhesion fournie
    let anciennete: number | undefined;
    let isDebutant: boolean | undefined;
    if (data.date_adhesion) {
      const now = new Date();
      const adhesion = data.date_adhesion;
      anciennete = Math.floor((now.getTime() - adhesion.getTime()) / (1000 * 60 * 60 * 24 * 365));
      isDebutant = anciennete < 1;
    }

    const membreData = {
      ...data,
      displayName,
      anciennete,
      isDebutant,
      createdAt: now,
      updatedAt: now,
      metadata: {
        createdBy: createdBy || 'system',
      },
    };

    const docRef = await addDoc(membresRef, membreData);

    // Log audit
    await logAuditAction(clubId, docRef.id, 'member_created', createdBy || 'system', {
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      has_app_access: data.has_app_access,
      app_role: data.app_role,
    });

    return docRef.id;
  } catch (error) {
    console.error('Error creating membre:', error);
    throw error;
  }
}

/**
 * Met à jour un membre existant
 */
export async function updateMembre(
  clubId: string,
  membreId: string,
  data: UpdateMembreDTO,
  updatedBy?: string
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

    const updateData = {
      ...data,
      updatedAt: now,
    };

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
    console.error('Error updating membre:', error);
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
    console.error('Error deleting membre:', error);
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
    await logAuditAction(clubId, membreId, 'member_hard_deleted', deletedBy || 'system', {
      deleted_data: {
        nom: membreData?.nom,
        prenom: membreData?.prenom,
        email: membreData?.email,
      }
    });
  } catch (error) {
    console.error('Error hard deleting membre:', error);
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
    console.error('Error granting app access:', error);
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
    console.error('Error revoking app access:', error);
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
    console.log('🔄 [changeAppRole] Starting role change:', { clubId, membreId, newRole, changedBy });

    // Vérifier que le membre a accès app
    const membre = await getMembreById(clubId, membreId);
    console.log('👤 [changeAppRole] Current member data:', {
      id: membre?.id,
      has_app_access: membre?.has_app_access,
      current_app_role: membre?.app_role
    });

    if (!membre?.has_app_access) {
      throw new Error('Le membre doit avoir accès à l\'application pour changer de rôle');
    }

    console.log('📝 [changeAppRole] Calling updateMembre with app_role:', newRole);
    await updateMembre(clubId, membreId, {
      app_role: newRole,
    }, changedBy);
    console.log('✅ [changeAppRole] updateMembre completed');

    await logAuditAction(clubId, membreId, 'app_role_changed', changedBy || 'system', {
      old_role: membre.app_role,
      new_role: newRole,
    });
    console.log('✅ [changeAppRole] Role change complete');
  } catch (error) {
    console.error('❌ [changeAppRole] Error:', error);
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
    console.error('Error activating/deactivating app access:', error);
    throw error;
  }
}

// ============================================================
// IMPORT XLS
// ============================================================

/**
 * Importe des membres depuis un fichier XLS
 * (À implémenter - logique depuis memberService.ts)
 */
export async function importMembresFromXLS(
  clubId: string,
  file: File,
  importedBy?: string
): Promise<ImportResult> {
  // TODO: Implémenter logique import XLS
  // Pour l'instant, retourne résultat vide
  console.warn('importMembresFromXLS: Not implemented yet');
  return {
    success: false,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: ['Import XLS not implemented in unified service yet'],
  };
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
  action: string,
  performedBy: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    const auditRef = collection(db, 'clubs', clubId, 'audit_logs');
    const now = Timestamp.now();

    const auditLog: Omit<AuditLog, 'id'> = {
      userId: membreId,
      action,
      performedBy,
      performedAt: now.toDate(),
      details: details || {},
      ipAddress: undefined, // À implémenter si besoin
      userAgent: navigator.userAgent,
    };

    await addDoc(auditRef, auditLog);
  } catch (error) {
    console.error('Error logging audit action:', error);
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
      performedAt: doc.data().performedAt?.toDate?.() || new Date(),
    })) as AuditLog[];
  } catch (error) {
    console.error('Error fetching audit logs:', error);
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
    console.error('Error logging login:', error);
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
    console.error('Error checking email existence:', error);
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
    console.error('Error checking LIFRAS ID existence:', error);
    throw error;
  }
}

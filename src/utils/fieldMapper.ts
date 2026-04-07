/**
 * Field Mapper - Centralized access to user/member fields
 *
 * This utility provides a single source of truth for accessing user and member data,
 * handling the transition from French legacy field names to English standard field names.
 *
 * See: docs/FIELD_NAMING_STANDARDIZATION.md
 *
 * @example
 * ```typescript
 * // ❌ BEFORE (direct access, error-prone)
 * const userName = user.nom || user.lastName;
 *
 * // ✅ AFTER (via field mapper, always correct)
 * import { getRole, getLastName } from '@/utils/fieldMapper';
 * const userRole = getRole(user);
 * const userName = getLastName(user);
 * ```
 */

import { Membre } from '@/types';
import { User, UserRole, UserStatus } from '@/types/user.types';

// Type union for Membre and User
export type UserOrMembre = Membre | User | null | undefined;

function normalizeRoleValue(role: unknown): UserRole | null {
  if (typeof role !== 'string' || !role) return null;

  if (role === 'organisateur') {
    return 'user';
  }

  if (['membre', 'user', 'validateur', 'admin', 'superadmin'].includes(role)) {
    return role as UserRole;
  }

  return null;
}

// ============================================================
// ROLE & STATUS
// ============================================================

/**
 * Get user role
 * Uses app_role field (legacy 'role' field was removed in migration)
 */
export function getRole(user: UserOrMembre): UserRole {
  if (!user) return 'user';

  const normalizedAppRole = 'app_role' in user ? normalizeRoleValue(user.app_role) : null;
  if (normalizedAppRole) {
    return normalizedAppRole;
  }

  // Fallback to legacy 'role' field
  const normalizedLegacyRole = 'role' in user ? normalizeRoleValue(user.role) : null;
  if (normalizedLegacyRole) {
    return normalizedLegacyRole;
  }

  return 'user';
}

/**
 * Resolve the effective role for an authenticated session.
 * Firestore downgrades (role `membre` or revoked app access) must win over stale custom claims.
 */
export function resolveSessionRole(params: {
  tokenRole?: unknown;
  firestoreRole?: unknown;
  firestoreHasAppAccess?: unknown;
}): UserRole {
  const tokenRole = normalizeRoleValue(params.tokenRole);
  const firestoreRole = normalizeRoleValue(params.firestoreRole);

  if (params.firestoreHasAppAccess === false) {
    return 'membre';
  }

  if (firestoreRole === 'membre') {
    return 'membre';
  }

  return tokenRole || firestoreRole || 'user';
}

/**
 * Get user status with fallback to legacy fields
 * Priority: app_status (new) > status (legacy) > derived from isActive/actif
 */
export function getStatus(user: UserOrMembre): UserStatus {
  if (!user) return 'inactive';

  // New standard field
  if ('app_status' in user && user.app_status) {
    return user.app_status;
  }

  // Legacy status field
  if ('status' in user && user.status) {
    return user.status;
  }

  // Derive from legacy isActive/actif boolean
  if (isActive(user)) {
    return 'active';
  }

  return 'inactive';
}

/**
 * Check if user is active
 * Checks multiple legacy fields: member_status, app_status, status, isActive, actif
 */
export function isActive(user: UserOrMembre): boolean {
  if (!user) return false;

  // Check member_status (new standard)
  if ('member_status' in user && user.member_status === 'active') {
    return true;
  }

  // Check app_status (new standard)
  if ('app_status' in user && user.app_status === 'active') {
    return true;
  }

  // Check legacy status
  if ('status' in user && user.status === 'active') {
    return true;
  }

  // Check legacy isActive boolean
  if ('isActive' in user && user.isActive === true) {
    return true;
  }

  // Check legacy actif boolean (French)
  if ('actif' in user && user.actif === true) {
    return true;
  }

  return false;
}

/**
 * Check if user has app access
 * Priority: has_app_access (new) > derived from role/app_role
 */
export function hasAppAccess(user: UserOrMembre): boolean {
  if (!user) return false;

  // New standard field
  if ('has_app_access' in user) {
    return user.has_app_access === true;
  }

  // Derive from role when the explicit field is missing.
  // `membre` is mobile-only and must not be treated as CalyCompta access.
  const role = getRole(user);
  return role !== 'membre';
}

/**
 * Check if a member can access the CalyCompta web application.
 * `membre` accounts remain valid for CalyMob but must stay out of the web UI.
 */
export function canAccessCalyCompta(user: UserOrMembre): boolean {
  if (!user) return false;

  const role = getRole(user);
  if (!['user', 'validateur', 'admin', 'superadmin'].includes(role)) {
    return false;
  }

  if ('has_app_access' in user && user.has_app_access === false) {
    return false;
  }

  if ('app_status' in user && user.app_status) {
    return user.app_status === 'active';
  }

  if ('status' in user && user.status) {
    return user.status === 'active';
  }

  return isActive(user);
}

// ============================================================
// PERSONAL DATA
// ============================================================

/**
 * Get first name
 * Priority: firstName (EN) > prenom (FR) > null
 */
export function getFirstName(user: UserOrMembre): string | null {
  if (!user) return null;

  if ('firstName' in user && user.firstName) {
    return user.firstName;
  }

  if ('prenom' in user && user.prenom) {
    return user.prenom;
  }

  return null;
}

/**
 * Get last name
 * Priority: lastName (EN) > nom (FR) > null
 */
export function getLastName(user: UserOrMembre): string | null {
  if (!user) return null;

  if ('lastName' in user && user.lastName) {
    return user.lastName;
  }

  if ('nom' in user && user.nom) {
    return user.nom;
  }

  return null;
}

/**
 * Get full name (displayName or constructed from first/last name)
 */
export function getDisplayName(user: UserOrMembre): string {
  if (!user) return 'Unknown User';

  // Use displayName if available
  if ('displayName' in user && user.displayName) {
    return user.displayName;
  }

  // Construct from first and last name
  const firstName = getFirstName(user);
  const lastName = getLastName(user);

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) return firstName;
  if (lastName) return lastName;

  // Fallback to email
  if ('email' in user && user.email) {
    return user.email;
  }

  return 'Unknown User';
}

/**
 * Get email
 */
export function getEmail(user: UserOrMembre): string {
  if (!user || !('email' in user)) return '';
  return user.email || '';
}

/**
 * Get phone number
 * Priority: phone (EN) > telephone (FR) > phoneNumber > gsm (legacy) > null
 */
export function getPhone(user: UserOrMembre): string | null {
  if (!user) return null;

  // Check various phone field variations
  if ('phone' in user && user.phone) {
    return user.phone;
  }

  if ('telephone' in user && user.telephone) {
    return user.telephone;
  }

  if ('phoneNumber' in user && user.phoneNumber) {
    return user.phoneNumber;
  }

  if ('gsm' in user && user.gsm) {
    return user.gsm;
  }

  return null;
}

/**
 * Get address
 * Priority: address (EN) > adresse (FR) > null
 */
export function getAddress(user: UserOrMembre): string | null {
  if (!user) return null;

  if ('address' in user && user.address) {
    return user.address;
  }

  if ('adresse' in user && user.adresse) {
    return user.adresse;
  }

  return null;
}

/**
 * Get postal code
 * Priority: postalCode (EN) > code_postal (FR) > null
 */
export function getPostalCode(user: UserOrMembre): string | null {
  if (!user) return null;

  if ('postalCode' in user && user.postalCode) {
    return user.postalCode;
  }

  if ('code_postal' in user && user.code_postal) {
    return user.code_postal;
  }

  return null;
}

/**
 * Get city/locality
 * Priority: city (EN) > localite (FR) > ville (FR) > null
 */
export function getCity(user: UserOrMembre): string | null {
  if (!user) return null;

  if ('city' in user && user.city) {
    return user.city;
  }

  if ('localite' in user && user.localite) {
    return user.localite;
  }

  if ('ville' in user && user.ville) {
    return user.ville;
  }

  return null;
}

/**
 * Get country
 * Priority: country (EN) > pays (FR) > null
 */
export function getCountry(user: UserOrMembre): string | null {
  if (!user) return null;

  if ('country' in user && user.country) {
    return user.country;
  }

  if ('pays' in user && user.pays) {
    return user.pays;
  }

  return null;
}

/**
 * Get photo URL
 */
export function getPhotoURL(user: UserOrMembre): string | null {
  if (!user || !('photoURL' in user)) return null;
  return user.photoURL || null;
}

// ============================================================
// MEMBER-SPECIFIC FIELDS
// ============================================================

/**
 * Get LIFRAS ID (diving federation ID)
 */
export function getLifrasId(member: UserOrMembre): string | null {
  if (!member || !('lifras_id' in member)) return null;
  return member.lifras_id || null;
}

/**
 * Get dive level
 * Priority: diveLevel (EN) > niveau_plongee (FR) > niveau_plongeur (legacy FR) > null
 */
export function getDiveLevel(member: UserOrMembre): string | null {
  if (!member) return null;

  if ('diveLevel' in member && member.diveLevel) {
    return member.diveLevel;
  }

  if ('niveau_plongee' in member && member.niveau_plongee) {
    return member.niveau_plongee;
  }

  if ('niveau_plongeur' in member && member.niveau_plongeur) {
    return member.niveau_plongeur;
  }

  return null;
}

/**
 * Check if member is a diver
 */
export function isDiver(member: UserOrMembre): boolean {
  if (!member || !('is_diver' in member)) return false;
  return member.is_diver === true;
}

/**
 * Check if member has LIFRAS license
 */
export function hasLifras(member: UserOrMembre): boolean {
  if (!member || !('has_lifras' in member)) return false;
  return member.has_lifras === true;
}

// ============================================================
// BANKING / IBAN
// ============================================================

/**
 * Get primary IBAN (bank account number)
 */
export function getIBAN(member: UserOrMembre): string | null {
  if (!member || !('iban' in member)) return null;
  return (member as any).iban || null;
}

/**
 * Get all IBANs for a member
 */
export function getIBANs(member: UserOrMembre): string[] {
  if (!member || !('ibans' in member)) return [];
  return (member as any).ibans || [];
}

/**
 * Format IBAN for display (spaces every 4 characters)
 * Example: "BE12345678901234" -> "BE12 3456 7890 1234"
 */
export function formatIBAN(iban: string | null | undefined): string {
  if (!iban) return '';
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Clean IBAN for storage (remove spaces, uppercase)
 */
export function cleanIBAN(iban: string | null | undefined): string {
  if (!iban) return '';
  return iban.replace(/\s/g, '').toUpperCase();
}

/**
 * Validate IBAN format (basic validation)
 * Returns true if format is valid (doesn't verify checksum)
 */
export function isValidIBANFormat(iban: string | null | undefined): boolean {
  if (!iban) return false;
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  // IBAN: 2 letters + 2 digits + up to 30 alphanumeric
  return /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleaned);
}

// ============================================================
// METADATA
// ============================================================

/**
 * Get creation date
 * Priority: createdAt (EN) > created_at (FR) > date_inscription > null
 */
export function getCreatedAt(user: UserOrMembre): Date | null {
  if (!user) return null;

  if ('createdAt' in user && user.createdAt) {
    // Handle both Date and Firestore Timestamp
    const timestamp = user.createdAt;
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'object' && 'toDate' in timestamp) {
      return (timestamp as any).toDate();
    }
  }

  if ('created_at' in user && user.created_at) {
    const timestamp = user.created_at;
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'object' && 'toDate' in timestamp) {
      return (timestamp as any).toDate();
    }
  }

  if ('date_inscription' in user && user.date_inscription) {
    const timestamp = user.date_inscription;
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'object' && 'toDate' in timestamp) {
      return (timestamp as any).toDate();
    }
  }

  return null;
}

/**
 * Get last update date
 * Priority: updatedAt (EN) > updated_at (FR) > null
 */
export function getUpdatedAt(user: UserOrMembre): Date | null {
  if (!user) return null;

  if ('updatedAt' in user && user.updatedAt) {
    const timestamp = user.updatedAt;
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'object' && 'toDate' in timestamp) {
      return (timestamp as any).toDate();
    }
  }

  if ('updated_at' in user && user.updated_at) {
    const timestamp = user.updated_at;
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'object' && 'toDate' in timestamp) {
      return (timestamp as any).toDate();
    }
  }

  return null;
}

/**
 * Get last login date
 */
export function getLastLogin(user: UserOrMembre): Date | null {
  if (!user || !('lastLogin' in user)) return null;

  const timestamp = user.lastLogin;
  if (!timestamp) return null;

  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp) {
    return (timestamp as any).toDate();
  }

  return null;
}

/**
 * Get created by user ID
 */
export function getCreatedBy(user: UserOrMembre): string | null {
  if (!user || !('metadata' in user)) return null;
  return user.metadata?.createdBy || null;
}

/**
 * Get activated by user ID
 */
export function getActivatedBy(user: UserOrMembre): string | null {
  if (!user || !('metadata' in user)) return null;
  return user.metadata?.activatedBy || null;
}

/**
 * Get activated at date
 */
export function getActivatedAt(user: UserOrMembre): Date | null {
  if (!user || !('metadata' in user)) return null;

  const timestamp = user.metadata?.activatedAt;
  if (!timestamp) return null;

  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp) {
    return (timestamp as any).toDate();
  }

  return null;
}

// ============================================================
// PERMISSIONS & PREFERENCES
// ============================================================

/**
 * Check if user requires password change
 * Priority: security.requirePasswordChange (new nested location) > requirePasswordChange (legacy root)
 */
export function requiresPasswordChange(user: UserOrMembre): boolean {
  if (!user) return false;

  // Check in security object first (new location)
  if ('security' in user && user.security && typeof user.security === 'object') {
    const security = user.security as any;
    if (security.requirePasswordChange === true) {
      return true;
    }
  }

  // Check at root level (legacy location)
  if ('requirePasswordChange' in user && user.requirePasswordChange === true) {
    return true;
  }

  return false;
}

/**
 * Get custom permissions
 */
export function getCustomPermissions(user: UserOrMembre): string[] {
  if (!user || !('customPermissions' in user)) return [];
  return user.customPermissions || [];
}

/**
 * Get user language preference
 */
export function getLanguage(user: UserOrMembre): 'fr' | 'nl' | 'en' {
  if (!user || !('preferences' in user)) return 'fr';
  return user.preferences?.language || 'fr';
}

/**
 * Get user theme preference
 */
export function getTheme(user: UserOrMembre): 'light' | 'dark' | 'auto' {
  if (!user || !('preferences' in user)) return 'auto';
  return user.preferences?.theme || 'auto';
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get user ID
 */
export function getUserId(user: UserOrMembre): string | null {
  if (!user || !('id' in user)) return null;
  return user.id || null;
}

/**
 * Get club ID
 */
export function getClubId(user: UserOrMembre): string | null {
  if (!user || !('clubId' in user)) return null;
  return user.clubId || null;
}

/**
 * Check if two users are the same
 */
export function isSameUser(user1: UserOrMembre, user2: UserOrMembre): boolean {
  const id1 = getUserId(user1);
  const id2 = getUserId(user2);
  return id1 !== null && id2 !== null && id1 === id2;
}

/**
 * Check if user is admin or superadmin
 */
export function isAdmin(user: UserOrMembre): boolean {
  const role = getRole(user);
  return role === 'admin' || role === 'superadmin';
}

/**
 * Check if user is superadmin
 */
export function isSuperAdmin(user: UserOrMembre): boolean {
  return getRole(user) === 'superadmin';
}

/**
 * Check if user can manage other users
 */
export function canManageUsers(user: UserOrMembre): boolean {
  return isAdmin(user);
}

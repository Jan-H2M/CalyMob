import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  UserRole,
  UserStatus,
  CreateUserDTO,
  UpdateUserDTO,
  ActivateUserDTO,
  UpdateUserRoleDTO,
  AuditLog,
  AuditAction
} from '@/types/user.types';
import { Membre } from '@/types';

/**
 * User Management Service
 *
 * ⚠️ DEPRECATED: This service is being replaced by membreService.ts (unified members)
 * Use membreService.ts for new code. This service is kept for backward compatibility.
 *
 * IMPORTANT: This service handles Firestore operations only.
 * Firebase Authentication user creation requires Firebase Admin SDK on the backend.
 *
 * For now, users must be created via:
 * 1. Firebase Console (Authentication > Users > Add user)
 * 2. Firebase Admin SDK script (scripts/setup-firebase-auth.js)
 * 3. Backend API endpoint (when implemented)
 *
 * This service creates the corresponding Firestore user document after the Firebase Auth user exists.
 */

export class UserService {
  /**
   * Get all users for a club
   */
  static async getUsers(clubId: string): Promise<Membre[]> {
    try {
      console.log('🔍 Loading users for clubId:', clubId);
      const membersRef = collection(db, `clubs/${clubId}/members`);
      const q = query(membersRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      console.log('📊 Firestore query returned:', snapshot.size, 'documents');

      const users: Membre[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log('👤 Loading user:', doc.id, data.email, '| app_role from Firestore:', data.app_role);

        // Build User object with proper defaults for required fields
        // Support both User type (status/isActive) AND Membre type (member_status)
        // ⚠️ IMPORTANT: Read isActive directly from Firestore, don't recalculate it!
        const isActiveFromDb = data.isActive !== undefined ? data.isActive : (data.actif !== false);
        const memberStatus = data.member_status || (isActiveFromDb ? 'active' : 'inactive');

        const user: Membre = {
          id: doc.id,
          email: data.email || '',
          displayName: data.displayName || `${data.prenom || ''} ${data.nom || ''}`.trim() || data.email?.split('@')[0] || 'Utilisateur',
          firstName: data.firstName || data.prenom,
          lastName: data.lastName || data.nom,
          nom: data.nom || data.lastName || '',
          prenom: data.prenom || data.firstName || '',
          app_role: (data.app_role || data.role || 'user') as UserRole,
          member_status: memberStatus as any,
          status: (data.status || memberStatus) as UserStatus, // Legacy field
          isActive: isActiveFromDb, // Read directly from Firestore!
          has_app_access: data.has_app_access !== false,
          is_diver: data.is_diver !== false,
          has_lifras: data.has_lifras || false,
          lifras_id: data.lifras_id, // ✅ Include LifrasID from Firestore
          isCA: data.isCA || false,
          clubId: data.clubId || 'calypso',
          phoneNumber: data.phoneNumber || data.telephone,
          photoURL: data.photoURL,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          lastLogin: data.lastLogin?.toDate(),
          metadata: data.metadata,
          preferences: data.preferences,
          customPermissions: data.customPermissions
        };

        users.push(user);
      });

      console.log('✅ Successfully loaded', users.length, 'users');
      return users;
    } catch (error) {
      console.error('❌ Error loading users:', error);
      throw new Error('Impossible de charger les utilisateurs');
    }
  }

  /**
   * Get a single user by ID
   */
  static async getUser(clubId: string, userId: string): Promise<Membre | null> {
    try {
      const userRef = doc(db, `clubs/${clubId}/members/${userId}`);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return null;
      }

      const data = userDoc.data();

      // Build User object with proper defaults for required fields
      // Support both User type (status/isActive) AND Membre type (member_status)
      const memberStatus = data.member_status || (data.isActive !== false && data.actif !== false ? 'active' : 'inactive');

      const user: Membre = {
        id: userDoc.id,
        email: data.email || '',
        displayName: data.displayName || `${data.prenom || ''} ${data.nom || ''}`.trim() || data.email?.split('@')[0] || 'Utilisateur',
        firstName: data.firstName || data.prenom,
        lastName: data.lastName || data.nom,
        nom: data.nom || data.lastName || '',
        prenom: data.prenom || data.firstName || '',
        app_role: (data.app_role || data.role || 'user') as UserRole,
        member_status: memberStatus as any,
        status: (data.status || memberStatus) as UserStatus, // Legacy field
        isActive: memberStatus === 'active', // Legacy field
        has_app_access: data.has_app_access !== false,
        is_diver: data.is_diver !== false,
        has_lifras: data.has_lifras || false,
        isCA: data.isCA || false,
        isEncadrant: data.isEncadrant || false,
        clubStatuten: data.clubStatuten || [],
        clubId: data.clubId || clubId,
        phoneNumber: data.phoneNumber || data.telephone,
        photoURL: data.photoURL,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastLogin: data.lastLogin?.toDate(),
        metadata: data.metadata,
        preferences: data.preferences,
        customPermissions: data.customPermissions
      };

      return user;
    } catch (error) {
      console.error('Error loading user:', error);
      throw new Error('Impossible de charger l\'utilisateur');
    }
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(clubId: string, email: string): Promise<User | null> {
    try {
      const membersRef = collection(db, `clubs/${clubId}/members`);
      const q = query(membersRef, where('email', '==', email));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastLogin: data.lastLogin?.toDate()
      } as User;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw new Error('Impossible de trouver l\'utilisateur');
    }
  }

  /**
   * Create a new user document in Firestore
   *
   * NOTE: This only creates the Firestore document. The Firebase Auth user must be created separately
   * using Firebase Console, Admin SDK, or a backend endpoint.
   */
  static async createUser(clubId: string, userId: string, userData: CreateUserDTO, createdBy: string): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await this.getUserByEmail(clubId, userData.email);
      if (existingUser) {
        throw new Error('Un utilisateur avec cet email existe déjà');
      }

      const now = Timestamp.now();

      // If no userId provided, generate auto-ID (Firestore-only member, no Firebase Auth yet)
      const membersRef = collection(db, `clubs/${clubId}/members`);
      const finalUserId = userId || doc(membersRef).id;

      const userDoc: Partial<User> = {
        id: finalUserId,
        email: userData.email,
        displayName: userData.displayName,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        status: 'active',
        // If no Firebase Auth userId provided, member cannot login yet (pending activation)
        isActive: !!userId,
        clubId: clubId,
        createdAt: now,
        updatedAt: now,
        metadata: {
          createdBy: createdBy,
          // Mark as pending activation if no Firebase Auth user ID provided
          ...(userId ? {} : { pendingActivation: true })
        }
      };

      // Only add phoneNumber if it's defined
      if (userData.phoneNumber) {
        userDoc.phoneNumber = userData.phoneNumber;
      }

      const userRef = doc(db, `clubs/${clubId}/members/${finalUserId}`);
      await setDoc(userRef, userDoc);

      // Log audit entry
      await this.createAuditLog(clubId, {
        userId: createdBy,
        userEmail: userData.email,
        action: 'USER_CREATED',
        targetId: finalUserId,
        targetType: 'user',
        targetName: userData.displayName,
        newValue: { role: userData.role },
        details: {
          email: userData.email,
          pendingActivation: !userId // Note if activation is pending
        },
        timestamp: now,
        clubId: clubId,
        severity: 'info'
      });

      return {
        ...userDoc,
        createdAt: now.toDate(),
        updatedAt: now.toDate()
      } as User;
    } catch (error) {
      console.error('Error creating user:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Impossible de créer l\'utilisateur');
    }
  }

  /**
   * Update user information
   */
  static async updateUser(
    clubId: string,
    userId: string,
    updates: UpdateUserDTO,
    updatedBy: string
  ): Promise<void> {
    try {
      const userRef = doc(db, `clubs/${clubId}/members/${userId}`);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('Utilisateur introuvable');
      }

      const previousData = userDoc.data();

      console.log('🔍 [userService] updateUser received:', {
        userId,
        updates,
        hasIsCA: 'isCA' in updates,
        hasIsEncadrant: 'isEncadrant' in updates,
        isCAvalue: updates.isCA,
        isEncadrantValue: updates.isEncadrant
      });

      // Filter out undefined values (Firestore doesn't accept undefined)
      const cleanedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      console.log('🔍 [userService] cleanedUpdates:', cleanedUpdates);

      const updateData = {
        ...cleanedUpdates,
        updatedAt: serverTimestamp(),
        'metadata.updatedBy': updatedBy
      };

      console.log('🔍 [userService] Writing to Firestore:', updateData);

      await updateDoc(userRef, updateData);

      // Log audit entry
      await this.createAuditLog(clubId, {
        userId: updatedBy,
        userEmail: previousData.email,
        action: 'USER_UPDATED',
        targetId: userId,
        targetType: 'user',
        targetName: previousData.displayName,
        previousValue: previousData,
        newValue: updates,
        timestamp: Timestamp.now(),
        clubId: clubId,
        severity: 'info'
      });
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error('Impossible de mettre à jour l\'utilisateur');
    }
  }

  /**
   * Activate or deactivate a user
   */
  static async activateUser(
    clubId: string,
    dto: ActivateUserDTO,
    actionBy: string
  ): Promise<void> {
    try {
      const userRef = doc(db, `clubs/${clubId}/members/${dto.userId}`);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('Utilisateur introuvable');
      }

      const userData = userDoc.data();

      console.log('🔄 Current user status:', {
        userId: dto.userId,
        currentIsActive: userData.isActive,
        currentActif: userData.actif,
        currentStatus: userData.status,
        wantToActivate: dto.activate
      });

      const updateData: any = {
        isActive: dto.activate,
        actif: dto.activate, // For backward compatibility with old field name
        status: dto.activate ? 'active' : 'inactive',
        updatedAt: serverTimestamp()
      };

      if (dto.activate) {
        updateData['metadata.activatedBy'] = actionBy;
        updateData['metadata.activatedAt'] = serverTimestamp();
      } else {
        updateData['metadata.deactivatedBy'] = actionBy;
        updateData['metadata.deactivatedAt'] = serverTimestamp();
        if (dto.reason) {
          updateData['metadata.deactivationReason'] = dto.reason;
        }
      }

      console.log('💾 About to update with data:', updateData);
      console.log('📍 Document path:', `clubs/${clubId}/members/${dto.userId}`);

      await updateDoc(userRef, updateData);

      console.log('✅ Update completed successfully');

      // Log audit entry
      console.log('🔍 userData before audit log:', {
        email: userData.email,
        displayName: userData.displayName,
        allKeys: Object.keys(userData)
      });

      const auditLogData: any = {
        userId: actionBy,
        userEmail: userData.email,
        action: dto.activate ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        targetId: dto.userId,
        targetType: 'user',
        targetName: userData.displayName,
        previousValue: { isActive: !dto.activate },
        newValue: { isActive: dto.activate },
        timestamp: Timestamp.now(),
        clubId: clubId,
        severity: 'info'
      };

      // Only add details if reason is provided
      if (dto.reason) {
        auditLogData.details = { reason: dto.reason };
      }

      console.log('📝 Audit log keys:', Object.keys(auditLogData));
      console.log('📝 Has undefined values:', Object.entries(auditLogData).filter(([k, v]) => v === undefined));

      await this.createAuditLog(clubId, auditLogData);
    } catch (error) {
      console.error('Error toggling user activation:', error);
      throw new Error('Impossible de modifier le statut de l\'utilisateur');
    }
  }

  /**
   * Change user role
   */
  static async changeUserRole(
    clubId: string,
    dto: UpdateUserRoleDTO,
    changedBy: string
  ): Promise<void> {
    try {
      const userRef = doc(db, `clubs/${clubId}/members/${dto.userId}`);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('Utilisateur introuvable');
      }

      const userData = userDoc.data();
      const previousRole = userData.app_role || userData.role;

      await updateDoc(userRef, {
        app_role: dto.newRole,
        updatedAt: serverTimestamp(),
        'metadata.roleChangedBy': changedBy,
        'metadata.roleChangedAt': serverTimestamp()
      });

      // Log audit entry
      const auditLogData: any = {
        userId: changedBy,
        userEmail: userData.email,
        action: 'ROLE_CHANGED',
        targetId: dto.userId,
        targetType: 'user',
        targetName: userData.displayName,
        previousValue: { app_role: previousRole },
        newValue: { app_role: dto.newRole },
        timestamp: Timestamp.now(),
        clubId: clubId,
        severity: 'warning'
      };

      // Only add details if reason is provided
      if (dto.reason) {
        auditLogData.details = { reason: dto.reason };
      }

      await this.createAuditLog(clubId, auditLogData);
    } catch (error) {
      console.error('Error changing user role:', error);
      throw new Error('Impossible de changer le rôle de l\'utilisateur');
    }
  }

  /**
   * Soft delete a user (mark as deleted, don't actually remove)
   */
  static async deleteUser(
    clubId: string,
    userId: string,
    deletedBy: string
  ): Promise<void> {
    try {
      const userRef = doc(db, `clubs/${clubId}/members/${userId}`);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('Utilisateur introuvable');
      }

      const userData = userDoc.data();

      await updateDoc(userRef, {
        status: 'deleted',
        isActive: false,
        actif: false,
        updatedAt: serverTimestamp(),
        'metadata.deletedBy': deletedBy,
        'metadata.deletedAt': serverTimestamp()
      });

      // Log audit entry
      await this.createAuditLog(clubId, {
        userId: deletedBy,
        userEmail: userData.email,
        action: 'USER_DELETED',
        targetId: userId,
        targetType: 'user',
        targetName: userData.displayName,
        timestamp: Timestamp.now(),
        clubId: clubId,
        severity: 'warning'
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      throw new Error('Impossible de supprimer l\'utilisateur');
    }
  }

  /**
   * Get audit logs for a specific user or all users
   * @param clubId - Club ID
   * @param userId - Optional user ID to filter logs by target user
   * @param limitCount - Maximum number of logs to retrieve (default: 200)
   * @returns Promise with array of audit logs
   */
  static async getAuditLogs(
    clubId: string,
    userId?: string,
    limitCount: number = 200
  ): Promise<AuditLog[]> {
    try {
      const auditRef = collection(db, `clubs/${clubId}/audit_logs`);
      let q;

      if (userId) {
        // Filter by target user ID with limit
        q = query(
          auditRef,
          where('targetId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
      } else {
        // All logs with limit (efficient query)
        q = query(
          auditRef,
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(q);

      const logs: AuditLog[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        logs.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date()
        } as AuditLog);
      });

      return logs;
    } catch (error) {
      console.error('Error loading audit logs:', error);
      throw new Error('Impossible de charger le journal d\'audit');
    }
  }

  /**
   * Create an audit log entry
   */
  private static async createAuditLog(clubId: string, logData: Omit<AuditLog, 'id'>): Promise<void> {
    try {
      const auditRef = collection(db, `clubs/${clubId}/audit_logs`);

      // Recursively filter out undefined values to prevent Firestore errors
      const cleanValue = (obj: any): any => {
        if (obj === null || obj === undefined) {
          return null;
        }
        if (typeof obj !== 'object') {
          return obj;
        }
        if (Array.isArray(obj)) {
          return obj.map(cleanValue);
        }

        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          if (value !== undefined) {
            cleaned[key] = cleanValue(value);
          }
        });
        return cleaned;
      };

      const cleanedData = cleanValue(logData);

      console.log('🧹 Cleaned audit data:', JSON.stringify(cleanedData, null, 2));
      console.log('🧹 Final data to save:', {
        ...cleanedData,
        timestamp: 'serverTimestamp()'
      });

      const finalData = {
        ...cleanedData,
        timestamp: logData.timestamp || serverTimestamp()
      };

      console.log('🧹 Has undefined in final?', Object.entries(finalData).filter(([k, v]) => v === undefined));

      await setDoc(doc(auditRef), finalData);
    } catch (error) {
      console.error('Error creating audit log:', error);
      // Don't throw - audit logging failure shouldn't block the main operation
    }
  }

  /**
   * Check if an email is already in use
   */
  static async isEmailInUse(clubId: string, email: string): Promise<boolean> {
    const user = await this.getUserByEmail(clubId, email);
    return user !== null;
  }

  /**
   * Log user login to audit trail
   */
  static async logLogin(
    clubId: string,
    userId: string,
    userEmail: string,
    userName: string,
    success: boolean = true
  ): Promise<void> {
    try {
      const now = Timestamp.now();

      // Get browser and device info
      const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown';
      const ipAddress = 'client'; // IP is client-side, would need server-side for real IP

      await this.createAuditLog(clubId, {
        userId: userId,
        userEmail: userEmail,
        userName: userName,
        action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
        targetId: userId,
        targetType: 'user',
        targetName: userName,
        details: {
          userAgent,
          timestamp: now.toDate().toISOString()
        },
        timestamp: now,
        ipAddress,
        userAgent,
        clubId: clubId,
        severity: success ? 'info' : 'warning'
      });

      // Update lastLogin in user document if successful
      if (success) {
        const userRef = doc(db, `clubs/${clubId}/members/${userId}`);
        await updateDoc(userRef, {
          lastLogin: now,
          updatedAt: now
        });
      }
    } catch (error) {
      console.error('Error logging login:', error);
      // Don't throw - audit logging failure shouldn't block login
    }
  }

  /**
   * Log user logout to audit trail
   */
  static async logLogout(
    clubId: string,
    userId: string,
    userEmail: string,
    userName: string,
    reason: 'manual' | 'timeout' | 'forced' = 'manual'
  ): Promise<void> {
    try {
      const now = Timestamp.now();
      const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown';

      await this.createAuditLog(clubId, {
        userId: userId,
        userEmail: userEmail,
        userName: userName,
        action: reason === 'timeout' ? 'SESSION_EXPIRED' : 'LOGOUT',
        targetId: userId,
        targetType: 'user',
        targetName: userName,
        details: {
          reason,
          userAgent,
          timestamp: now.toDate().toISOString()
        },
        timestamp: now,
        userAgent,
        clubId: clubId,
        severity: 'info'
      });
    } catch (error) {
      console.error('Error logging logout:', error);
      // Don't throw - audit logging failure shouldn't block logout
    }
  }
}

import React from 'react';
import { User, UserRole } from '@/types/user.types';
import { PermissionService } from '@/services/permissionService';
import { Eye, Shield, Check, X, Clock, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { formatDate } from '@/utils/utils';

interface UserListProps {
  users: User[];
  onSelectUser: (user: User) => void;
  currentUser: User | null;
  sortBy: 'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt') => void;
}

export function UserList({
  users,
  onSelectUser,
  currentUser,
  sortBy,
  sortOrder,
  onSort
}: UserListProps) {
  const canManage = (targetUser: User) => {
    if (!currentUser) return false;
    return PermissionService.canManageUser(currentUser, targetUser.role);
  };

  const SortableHeader = ({ column, children }: { column: 'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt', children: React.ReactNode }) => {
    const isActive = sortBy === column;
    return (
      <th
        className="text-left py-2 px-3 font-medium text-sm text-gray-700 dark:text-dark-text-primary cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition select-none"
        onClick={() => onSort(column)}
      >
        <div className="flex items-center gap-1.5">
          <span>{children}</span>
          {isActive && (
            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
          )}
        </div>
      </th>
    );
  };

  const getRoleBadge = (role: UserRole) => {
    const config = PermissionService.getRoleConfig(role);

    // Fallback pour les rôles non configurés (ex: 'membre' pour club members sans accès app)
    if (!config) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          <Shield className="w-3 h-3" />
          {role === 'membre' ? 'Membre' : role}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
          PermissionService.getRoleBadgeClass(role)
        }`}
      >
        <Shield className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (user: User) => {
    // Check for pending activation first (highest priority)
    if (user.metadata?.pendingActivation) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          En attente d'activation
        </span>
      );
    }

    if (user.status === 'deleted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted">
          <X className="w-3 h-3" />
          Supprimé
        </span>
      );
    }

    if (user.status === 'suspended') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          <AlertTriangle className="w-3 h-3" />
          Suspendu
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
          PermissionService.getStatusBadgeClass(user.isActive)
        }`}
      >
        {user.isActive ? (
          <>
            <Check className="w-3 h-3" />
            Actif
          </>
        ) : (
          <>
            <X className="w-3 h-3" />
            Inactif
          </>
        )}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-dark-border">
            <SortableHeader column="name">Utilisateur</SortableHeader>
            <SortableHeader column="lastName">Nom</SortableHeader>
            <SortableHeader column="role">Rôle</SortableHeader>
            <SortableHeader column="status">Statut</SortableHeader>
            <SortableHeader column="lastLogin">Dernière connexion</SortableHeader>
            <th className="text-center py-2 px-3 font-medium text-sm text-gray-700 dark:text-dark-text-primary">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => {
            // Check for two types of dividers: CA → non-CA AND active → inactive
            const isCA = user.isCA === true;
            const isActive = user.member_status === 'active' || user.status === 'active' || user.isActive;

            const prevUser = index > 0 ? users[index - 1] : null;
            const prevIsCA = prevUser ? prevUser.isCA === true : false;
            const prevIsActive = prevUser ? (prevUser.member_status === 'active' || prevUser.status === 'active' || prevUser.isActive) : true;

            // RED divider: CA → non-CA transition
            const showCADivider = index > 0 && prevIsCA && !isCA;

            // GRAY divider: active → inactive transition (but not if we just showed CA divider)
            const showActiveDivider = index > 0 && prevIsActive && !isActive && !showCADivider;

            return (
              <React.Fragment key={user.id}>
                {showCADivider && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div className="h-1 bg-red-500 my-2"></div>
                    </td>
                  </tr>
                )}
                {showActiveDivider && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div className="h-1 bg-gray-400 dark:bg-gray-600 my-2"></div>
                    </td>
                  </tr>
                )}
                <tr
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    user.status === 'deleted' ? 'opacity-50' : ''
                  }`}
                >
              <td className="py-2.5 px-2">
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      className="w-7 h-7 rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-600 dark:text-dark-text-secondary font-medium text-xs">
                        {user.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-dark-text-primary">
                      {user.displayName}
                      {user.id === currentUser?.id && (
                        <span className="ml-1.5 text-xs text-gray-500 dark:text-dark-text-muted">(Vous)</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-dark-text-secondary">{user.email}</div>
                  </div>
                </div>
              </td>

              <td className="py-2.5 px-2">
                <span className="text-sm text-gray-900 dark:text-dark-text-primary">
                  {user.lastName || user.nom || '-'}
                </span>
              </td>

              <td className="py-2.5 px-3">
                {getRoleBadge(user.role)}
              </td>

              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  {getStatusBadge(user)}
                  {user.isCA && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      CA
                    </span>
                  )}
                  {user.isEncadrant && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      E
                    </span>
                  )}
                </div>
              </td>

              <td className="py-2.5 px-3">
                {user.lastLogin ? (
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-dark-text-secondary">
                    <Clock className="w-3 h-3" />
                    {formatDate(user.lastLogin)}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-dark-text-muted">Jamais</span>
                )}
              </td>

              <td className="py-2.5 px-3">
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => onSelectUser(user)}
                    className="p-1.5 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg"
                    title="Voir les détails"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      
      {users.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-dark-text-muted">Aucun utilisateur trouvé</p>
        </div>
      )}
    </div>
  );
}
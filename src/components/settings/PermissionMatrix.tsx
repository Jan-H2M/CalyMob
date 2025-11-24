import React from 'react';
import { UserRole, Permission, RoleConfig } from '@/types/user.types';
import { Check, X, Lock, ShieldOff, Filter } from 'lucide-react';
import { cn } from '@/utils/utils';
import { PermissionService } from '@/services/permissionService';

interface PermissionMatrixProps {
  roles: Record<UserRole, RoleConfig>;
  onPermissionToggle: (role: UserRole, permission: Permission) => void;
  readOnly?: boolean;
}

// Groupes de permissions par catégorie
const permissionGroups: {
  category: string;
  icon: string;
  permissions: { id: Permission; label: string }[];
}[] = [
  {
    category: 'Tableau de bord',
    icon: '📊',
    permissions: [
      { id: 'dashboard.view', label: 'Voir' }
    ]
  },
  {
    category: 'Transactions',
    icon: '💳',
    permissions: [
      { id: 'transactions.view', label: 'Voir' },
      { id: 'transactions.create', label: 'Créer' },
      { id: 'transactions.update', label: 'Modifier' },
      { id: 'transactions.sign', label: 'Signer' },
      { id: 'transactions.link', label: 'Lier' },
      { id: 'transactions.delete', label: 'Supprimer' }
    ]
  },
  {
    category: 'Demandes',
    icon: '💰',
    permissions: [
      { id: 'demands.view', label: 'Voir' },
      { id: 'demands.create', label: 'Créer' },
      { id: 'demands.update', label: 'Modifier' },
      { id: 'demands.approve', label: 'Approuver' },
      { id: 'demands.reject', label: 'Rejeter' },
      { id: 'demands.delete', label: 'Supprimer' },
      { id: 'demands.addDocument', label: 'Ajouter docs' },
      { id: 'demands.deleteDocument', label: 'Supprimer docs' }
    ]
  },
  {
    category: 'Activités',
    icon: '📅',
    permissions: [
      { id: 'events.view', label: 'Voir' },
      { id: 'events.create', label: 'Créer' },
      { id: 'events.manage', label: 'Gérer' },
      { id: 'events.delete', label: 'Supprimer' }
    ]
  },
  {
    category: 'Paramètres',
    icon: '⚙️',
    permissions: [
      { id: 'settings.view', label: 'Voir' },
      { id: 'settings.manage', label: 'Gérer' }
    ]
  },
  {
    category: 'Utilisateurs',
    icon: '👥',
    permissions: [
      { id: 'users.view', label: 'Voir' },
      { id: 'users.create', label: 'Créer' },
      { id: 'users.update', label: 'Modifier' },
      { id: 'users.delete', label: 'Supprimer' },
      { id: 'users.activate', label: 'Activer/Désactiver' },
      { id: 'users.assignRole', label: 'Attribuer rôles' }
    ]
  },
  {
    category: 'Rapports',
    icon: '📊',
    permissions: [
      { id: 'reports.view', label: 'Voir' },
      { id: 'reports.export', label: 'Exporter' },
      { id: 'reports.create', label: 'Créer' }
    ]
  },
  {
    category: 'Audit',
    icon: '🔍',
    permissions: [
      { id: 'audit.view', label: 'Voir journaux' }
    ]
  }
];

const roleOrder: UserRole[] = ['user', 'validateur', 'admin', 'superadmin'];

export function PermissionMatrix({ roles, onPermissionToggle, readOnly = false }: PermissionMatrixProps) {
  const hasPermission = (role: UserRole, permission: Permission): boolean => {
    return roles[role]?.permissions.includes(permission) || false;
  };

  const isLocked = (role: UserRole, permission: Permission): boolean => {
    // SuperAdmin ne peut pas perdre ses permissions critiques
    if (role === 'superadmin') {
      const criticalPerms: Permission[] = ['users.view', 'users.assignRole', 'settings.manage'];
      return criticalPerms.includes(permission);
    }

    // Check if permission is rule-enforced (BLOCKED)
    const enforcement = PermissionService.getRuleEnforcement(permission, role);
    if (enforcement && enforcement.enforcementType === 'BLOCKED') {
      return true;
    }

    return false;
  };

  const getRuleEnforcementInfo = (role: UserRole, permission: Permission) => {
    return PermissionService.getRuleEnforcement(permission, role);
  };

  const getRoleColor = (role: UserRole): string => {
    const colors: Record<UserRole, string> = {
      user: 'text-gray-700 bg-gray-50',
      validateur: 'text-blue-700 bg-blue-50',
      admin: 'text-orange-700 bg-orange-50',
      superadmin: 'text-purple-700 bg-purple-50'
    };
    return colors[role] || 'text-gray-700 bg-gray-50';
  };

  const handleToggle = (role: UserRole, permission: Permission) => {
    if (readOnly || isLocked(role, permission)) return;
    onPermissionToggle(role, permission);
  };

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* En-tête avec les rôles */}
          <thead>
            <tr className="border-b border-gray-200 dark:border-dark-border">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary sticky left-0 z-10">
                Permissions
              </th>
              {roleOrder.map(role => (
                <th
                  key={role}
                  className={cn(
                    'px-4 py-3 text-center text-sm font-medium border-l border-gray-200',
                    getRoleColor(role)
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-semibold">{roles[role]?.label}</span>
                    <span className="text-xs font-normal opacity-75">
                      {roles[role]?.permissions.length} permissions
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {permissionGroups.map((group, groupIndex) => (
              <React.Fragment key={group.category}>
                {/* En-tête de catégorie */}
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <td
                    colSpan={roleOrder.length + 1}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-dark-text-primary sticky left-0"
                  >
                    {group.icon} {group.category}
                  </td>
                </tr>

                {/* Permissions de la catégorie */}
                {group.permissions.map((perm, permIndex) => (
                  <tr
                    key={perm.id}
                    className={cn(
                      'border-b border-gray-100 hover:bg-gray-50 transition-colors',
                      permIndex === group.permissions.length - 1 && groupIndex !== permissionGroups.length - 1
                        ? 'border-b-2 border-gray-200'
                        : ''
                    )}
                  >
                    {/* Label de la permission */}
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary sticky left-0 z-10 border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{perm.label}</span>
                        <span className="text-xs text-gray-400 dark:text-dark-text-muted">({perm.id})</span>
                      </div>
                    </td>

                    {/* Checkbox pour chaque rôle */}
                    {roleOrder.map(role => {
                      const checked = hasPermission(role, perm.id);
                      const locked = isLocked(role, perm.id);
                      const enforcement = getRuleEnforcementInfo(role, perm.id);

                      // Determine the display icon and color
                      let icon: React.ReactNode;
                      let bgColor = '';
                      let textColor = '';
                      let tooltip = '';

                      if (enforcement) {
                        if (enforcement.enforcementType === 'BLOCKED') {
                          // BLOCKED: Red shield with X
                          icon = <ShieldOff className="w-4 h-4" />;
                          bgColor = 'bg-red-100 dark:bg-red-900/20';
                          textColor = 'text-red-600 dark:text-red-400';
                          tooltip = `🔒 Bloqué par Firestore: ${enforcement.reason}`;
                        } else if (enforcement.enforcementType === 'SCOPED') {
                          // SCOPED: Orange filter icon
                          icon = <Filter className="w-4 h-4" />;
                          bgColor = 'bg-orange-100 dark:bg-orange-900/20';
                          textColor = 'text-orange-600 dark:text-orange-400';
                          tooltip = `🔍 Filtré par Firestore: ${enforcement.reason}`;
                        }
                      } else if (locked) {
                        // Standard locked (superadmin critical perms)
                        icon = <Lock className="w-4 h-4" />;
                        bgColor = 'bg-gray-100';
                        textColor = 'text-gray-400';
                        tooltip = 'Permission verrouillée pour ce rôle';
                      } else if (checked) {
                        // Standard checked
                        icon = <Check className="w-5 h-5" />;
                        bgColor = 'bg-green-100';
                        textColor = 'text-green-600';
                        tooltip = 'Cliquer pour retirer';
                      } else {
                        // Standard unchecked
                        icon = <X className="w-5 h-5" />;
                        bgColor = 'bg-gray-100';
                        textColor = 'text-gray-400';
                        tooltip = 'Cliquer pour ajouter';
                      }

                      return (
                        <td
                          key={`${role}-${perm.id}`}
                          className="px-4 py-3 text-center border-l border-gray-100"
                        >
                          <button
                            onClick={() => handleToggle(role, perm.id)}
                            disabled={readOnly || locked || !!enforcement}
                            className={cn(
                              'relative inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                              bgColor,
                              textColor,
                              (locked || enforcement) && 'cursor-not-allowed opacity-75',
                              !readOnly && !locked && !enforcement && 'cursor-pointer hover:opacity-80',
                              readOnly && 'cursor-default'
                            )}
                            title={tooltip}
                          >
                            {icon}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>

          {/* Pied de tableau avec résumé */}
          <tfoot className="bg-gray-50 dark:bg-dark-bg-tertiary border-t-2 border-gray-200 dark:border-dark-border">
            <tr>
              <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-dark-text-primary sticky left-0 z-10 bg-gray-50 dark:bg-dark-bg-tertiary">
                Total par rôle
              </td>
              {roleOrder.map(role => (
                <td
                  key={role}
                  className="px-4 py-3 text-center text-sm font-semibold text-gray-700 dark:text-dark-text-primary border-l border-gray-200 dark:border-dark-border"
                >
                  {roles[role]?.permissions.length || 0} permissions
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Légende */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-t border-gray-200 dark:border-dark-border">
        <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 dark:text-dark-text-secondary">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <span>Permis</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted flex items-center justify-center">
              <X className="w-5 h-5" />
            </div>
            <span>Non permis</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted opacity-50 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <span>Verrouillé (système)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 opacity-75 flex items-center justify-center">
              <ShieldOff className="w-4 h-4" />
            </div>
            <span>Bloqué (Firestore)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 opacity-75 flex items-center justify-center">
              <Filter className="w-4 h-4" />
            </div>
            <span>Filtré (Firestore)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import { User, UserRole } from '@/types/user.types';
import { PermissionService } from '@/services/permissionService';
import { Eye, Shield, Check, X, Clock, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { formatDate } from '@/utils/utils';
import { getRole } from '@/utils/fieldMapper';
import { NIVEAU_OPTIONS } from '@/utils/plongeurUtils';

type SortColumn = 'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt' | 'certifValidite';

interface UserListProps {
  users: User[];
  onSelectUser: (user: User) => void;
  currentUser: User | null;
  sortBy: SortColumn;
  sortOrder: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  /** Map of membership category code → label (from active season) */
  categoryLabels?: Record<string, string>;
  /** ID of currently selected user (for highlight) */
  selectedUserId?: string | null;
}

export function UserList({
  users,
  onSelectUser,
  currentUser,
  sortBy,
  sortOrder,
  onSort,
  categoryLabels = {},
  selectedUserId,
}: UserListProps) {
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  // Scroll selected row into view when navigating with arrows
  useEffect(() => {
    if (selectedUserId && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedUserId]);

  // Helper: Parse date from various formats (Date, Timestamp, string)
  const parseDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.toDate) return value.toDate(); // Firestore Timestamp
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  // Helper: Check if certificate is expired
  const isCertificatExpired = (user: User): boolean => {
    const validite = (user as any).certificat_medical_validite;
    const date = parseDate(validite);
    return date ? date < new Date() : false;
  };

  // Helper: Get certificate validity date
  const getCertificatValidite = (user: User): Date | null => {
    return parseDate((user as any).certificat_medical_validite);
  };

  const SortableHeader = ({ column, children }: { column: SortColumn, children: React.ReactNode }) => {
    const isActive = sortBy === column;
    return (
      <th
        className="text-left py-2 px-3 font-medium text-sm text-gray-700 dark:text-dark-text-primary cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition select-none"
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

  const getRoleBadge = (role: UserRole, user?: User) => {
    // Use getRole() for correct role (app_role takes priority over legacy role field)
    const effectiveRole = user ? getRole(user) : role;
    const config = PermissionService.getRoleConfig(effectiveRole);

    if (!config) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary">
          <Shield className="w-3 h-3" />
          {effectiveRole === 'membre' ? 'Membre' : effectiveRole}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${PermissionService.getRoleBadgeClass(effectiveRole)
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
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${PermissionService.getStatusBadgeClass(user.isActive)
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
            <th className="text-center py-2 px-2 font-medium text-sm text-gray-700 dark:text-dark-text-primary" title="Niveau de plongée">Niv.</th>
            <SortableHeader column="role">Rôle</SortableHeader>
            <th className="text-left py-2 px-3 font-medium text-sm text-gray-700 dark:text-dark-text-primary">Type</th>
            <SortableHeader column="status">Statut</SortableHeader>
            <th className="text-center py-2 px-2 font-medium text-sm text-gray-700 dark:text-dark-text-primary" title="Certificat médical en ordre">Méd.</th>
            <th className="text-center py-2 px-2 font-medium text-sm text-gray-700 dark:text-dark-text-primary" title="Cotisation CLOP en ordre">Coti.</th>
            <SortableHeader column="lastLogin">Dernière connexion</SortableHeader>
            <th className="text-center py-2 px-3 font-medium text-sm text-gray-700 dark:text-dark-text-primary">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => {
            // Check for two types of dividers: CA → non-CA AND active → inactive
            // Use clubStatuten array to check for CA function
            const isCA = Array.isArray(user.clubStatuten) && user.clubStatuten.includes('CA');
            const isActive = user.member_status === 'active' || user.status === 'active' || user.isActive;

            const prevUser = index > 0 ? users[index - 1] : null;
            const prevIsCA = prevUser ? (Array.isArray(prevUser.clubStatuten) && prevUser.clubStatuten.includes('CA')) : false;
            const prevIsActive = prevUser ? (prevUser.member_status === 'active' || prevUser.status === 'active' || prevUser.isActive) : true;

            // RED divider: CA → non-CA transition
            const showCADivider = index > 0 && prevIsCA && !isCA;

            // GRAY divider: active → inactive transition (but not if we just showed CA divider)
            const showActiveDivider = index > 0 && prevIsActive && !isActive && !showCADivider;

            const certifExpired = isCertificatExpired(user);
            const certifDate = getCertificatValidite(user);
            const cotisationDate = parseDate((user as any).cotisation_validite);
            const cotisationExpired = cotisationDate ? cotisationDate < new Date() : false;
            const hasExpiredDocument = certifExpired || cotisationExpired;

            return (
              <React.Fragment key={user.id}>
                {showCADivider && (
                  <tr>
                    <td colSpan={10} className="p-0">
                      <div className="h-1 bg-red-500 my-2"></div>
                    </td>
                  </tr>
                )}
                {showActiveDivider && (
                  <tr>
                    <td colSpan={10} className="p-0">
                      <div className="h-1 bg-gray-400 dark:bg-gray-600 my-2"></div>
                    </td>
                  </tr>
                )}
                <tr
                  ref={selectedUserId === user.id ? selectedRowRef : undefined}
                  className={`border-b border-gray-100 cursor-pointer ${
                    selectedUserId === user.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                      : hasExpiredDocument
                        ? 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30'
                        : 'bg-white hover:bg-gray-50 dark:bg-dark-bg-secondary dark:hover:bg-dark-bg-tertiary'
                    } ${user.status === 'deleted' ? 'opacity-50' : ''}`}
                  onClick={() => onSelectUser(user)}
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

                  <td className="py-2.5 px-2 text-center">
                    {(user as any).plongeur_code ? (() => {
                      const code = (user as any).plongeur_code;
                      const option = NIVEAU_OPTIONS.find(o => o.code === code);
                      const isNageur = code === 'NAG';
                      return (
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded text-xs font-semibold ${
                            isNageur
                              ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          }`}
                          title={option?.fullName || (user as any).plongeur_niveau || code}
                        >
                          {option?.label || code}
                        </span>
                      );
                    })() : (
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3">
                    {getRoleBadge(user.role, user)}
                  </td>

                  <td className="py-2.5 px-3">
                    <span className="text-xs text-gray-600 dark:text-dark-text-secondary">
                      {user.membership_category_code && categoryLabels[user.membership_category_code]
                        ? categoryLabels[user.membership_category_code]
                        : '-'}
                    </span>
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(user)}
                      {/* Display fonction badges from clubStatuten */}
                      {Array.isArray(user.clubStatuten) && user.clubStatuten.length > 0 && user.clubStatuten.map(fonction => {
                        // Map fonction to badge style
                        const getBadgeStyle = (f: string) => {
                          switch (f) {
                            case 'CA':
                              return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
                            case 'Encadrants':
                              return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
                            case 'Membre':
                              return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
                            case 'Accueil':
                              return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
                            default:
                              return 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-gray-900/30';
                          }
                        };

                        const getShortCode = (statut: string) => {
                          switch (statut) {
                            case 'CA': return 'CA';
                            case 'Encadrants': return 'E';
                            case 'Accueil': return 'A';
                            default: return 'M';
                          }
                        };

                        // Skip "Membre" badge to avoid clutter
                        if (fonction === 'Membre') return null;

                        return (
                          <span
                            key={fonction}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getBadgeStyle(fonction)}`}
                            title={fonction}
                          >
                            {getShortCode(fonction)}
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  {/* Colonne Méd. - Certificat médical */}
                  <td className="py-2.5 px-2 text-center">
                    {certifDate ? (
                      certifExpired ? (
                        <span className="text-red-500" title={`Expiré le ${certifDate.toLocaleDateString('fr-BE')}`}>
                          <X className="w-4 h-4 inline" />
                        </span>
                      ) : (
                        <span className="text-green-600" title={`Valide jusqu'au ${certifDate.toLocaleDateString('fr-BE')}`}>
                          <Check className="w-4 h-4 inline" />
                        </span>
                      )
                    ) : user.has_pending_medical ? (
                      <span className="text-amber-500" title="Certificat à valider">
                        <Clock className="w-4 h-4 inline" />
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                    )}
                  </td>

                  {/* Colonne Coti. - Cotisation CLOP */}
                  <td className="py-2.5 px-2 text-center">
                    {cotisationDate ? (
                      cotisationExpired ? (
                        <span className="text-red-500" title={`Expiré le ${cotisationDate.toLocaleDateString('fr-BE')}`}>
                          <X className="w-4 h-4 inline" />
                        </span>
                      ) : (
                        <span className="text-green-600" title={`Valide jusqu'au ${cotisationDate.toLocaleDateString('fr-BE')}`}>
                          <Check className="w-4 h-4 inline" />
                        </span>
                      )
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                    )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectUser(user);
                        }}
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
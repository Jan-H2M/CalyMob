import React, { useState } from 'react';
import { AuditLog, AuditAction, User } from '@/types/user.types';
import {
  Activity, UserPlus, UserMinus, UserCheck, UserX,
  Key, LogIn, LogOut, AlertTriangle, Info,
  FileText, CheckCircle, XCircle, Edit, Trash,
  Filter, Search, Calendar, Eye, X as XIcon
} from 'lucide-react';
import { formatDate } from '@/utils/utils';
import { cn } from '@/utils/utils';

interface AuditLogListProps {
  logs: AuditLog[];
  users: User[];
}

export function AuditLogList({ logs, users }: AuditLogListProps) {
  const [filterAction, setFilterAction] = useState<AuditAction | 'all'>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const getActionIcon = (action: AuditAction) => {
    switch (action) {
      case 'USER_CREATED':
        return <UserPlus className="w-4 h-4" />;
      case 'USER_DELETED':
        return <UserMinus className="w-4 h-4" />;
      case 'USER_ACTIVATED':
        return <UserCheck className="w-4 h-4" />;
      case 'USER_DEACTIVATED':
      case 'USER_SUSPENDED':
        return <UserX className="w-4 h-4" />;
      case 'ROLE_CHANGED':
      case 'PERMISSION_GRANTED':
      case 'PERMISSION_REVOKED':
        return <Key className="w-4 h-4" />;
      case 'LOGIN_SUCCESS':
        return <LogIn className="w-4 h-4" />;
      case 'LOGIN_FAILED':
        return <AlertTriangle className="w-4 h-4" />;
      case 'LOGOUT':
        return <LogOut className="w-4 h-4" />;
      case 'SESSION_EXPIRED':
        return <AlertTriangle className="w-4 h-4" />;
      case 'TRANSACTION_CREATED':
      case 'TRANSACTION_SIGNED':
      case 'TRANSACTION_LINKED':
        return <FileText className="w-4 h-4" />;
      case 'TRANSACTION_DELETED':
        return <Trash className="w-4 h-4" />;
      case 'DEMAND_CREATED':
        return <FileText className="w-4 h-4" />;
      case 'DEMAND_APPROVED':
        return <CheckCircle className="w-4 h-4" />;
      case 'DEMAND_REJECTED':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActionColor = (action: AuditAction, severity?: string) => {
    if (severity === 'error' || severity === 'critical') {
      return 'text-red-600 bg-red-50';
    }
    if (severity === 'warning') {
      return 'text-orange-600 bg-orange-50';
    }

    if (action.includes('FAILED') || action.includes('REJECTED') || action.includes('DELETED')) {
      return 'text-red-600 bg-red-50';
    }
    if (action.includes('CREATED') || action.includes('APPROVED') || action.includes('SUCCESS')) {
      return 'text-green-600 bg-green-50';
    }
    if (action.includes('CHANGED') || action.includes('UPDATED')) {
      return 'text-blue-600 bg-blue-50';
    }
    if (action.includes('SUSPENDED') || action.includes('DEACTIVATED')) {
      return 'text-orange-600 bg-orange-50';
    }
    return 'text-gray-600 bg-gray-50';
  };

  const getActionLabel = (action: AuditAction): string => {
    const labels: Record<AuditAction, string> = {
      'USER_CREATED': 'Utilisateur créé',
      'USER_UPDATED': 'Utilisateur modifié',
      'USER_DELETED': 'Utilisateur supprimé',
      'USER_ACTIVATED': 'Utilisateur activé',
      'USER_DEACTIVATED': 'Utilisateur désactivé',
      'USER_SUSPENDED': 'Utilisateur suspendu',
      'ROLE_CHANGED': 'Rôle modifié',
      'PERMISSION_GRANTED': 'Permission accordée',
      'PERMISSION_REVOKED': 'Permission révoquée',
      'LOGIN_SUCCESS': 'Connexion',
      'LOGIN_FAILED': 'Échec connexion',
      'LOGOUT': 'Déconnexion',
      'SESSION_EXPIRED': 'Session expirée',
      'PASSWORD_RESET': 'Mot de passe réinitialisé',
      'TRANSACTION_CREATED': 'Transaction créée',
      'TRANSACTION_SIGNED': 'Transaction signée',
      'TRANSACTION_LINKED': 'Transaction liée',
      'TRANSACTION_DELETED': 'Transaction supprimée',
      'DEMAND_CREATED': 'Demande créée',
      'DEMAND_APPROVED': 'Demande approuvée',
      'DEMAND_REJECTED': 'Demande rejetée'
    };
    return labels[action] || action;
  };

  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesUser = filterUser === 'all' || log.userId === filterUser || log.targetId === filterUser;
    
    const matchesSearch = searchTerm === '' || 
      log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getActionLabel(log.action).toLowerCase().includes(searchTerm.toLowerCase());

    let matchesDate = true;
    if (dateRange.start) {
      const logDate = new Date(log.timestamp);
      const startDate = new Date(dateRange.start);
      matchesDate = logDate >= startDate;
    }
    if (dateRange.end && matchesDate) {
      const logDate = new Date(log.timestamp);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      matchesDate = logDate <= endDate;
    }

    return matchesAction && matchesUser && matchesSearch && matchesDate;
  });

  const uniqueActions = Array.from(new Set(logs.map(log => log.action)));

  // Extract browser from userAgent
  const getBrowserInfo = (userAgent?: string): string => {
    if (!userAgent) return 'Inconnu';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Autre';
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: Date | any): string => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 dark:bg-dark-bg-tertiary p-4 rounded-lg space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value as AuditAction | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes les actions</option>
            {uniqueActions.map(action => (
              <option key={action} value={action}>
                {getActionLabel(action)}
              </option>
            ))}
          </select>

          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous les utilisateurs</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="flex-1 px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-sm"
              placeholder="Du"
            />
            <span className="text-gray-500 dark:text-dark-text-muted">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="flex-1 px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-sm"
              placeholder="Au"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary">
            <Filter className="w-4 h-4" />
            {filteredLogs.length} entrée{filteredLogs.length > 1 ? 's' : ''} trouvée{filteredLogs.length > 1 ? 's' : ''}
          </div>
          {logs.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-dark-text-muted">
              {logs.length} log{logs.length > 1 ? 's' : ''} chargé{logs.length > 1 ? 's' : ''} sur un maximum de 200
            </div>
          )}
        </div>
      </div>

      {/* Liste compacte des logs */}
      <div className="relative">
        <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase w-12"></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Nom</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Action</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Date & Heure</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase w-12"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-100">
              {filteredLogs.map(log => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={cn(
                    'h-9 cursor-pointer transition-colors',
                    selectedLog?.id === log.id
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                  )}
                >
                  {/* Icône */}
                  <td className="px-3 py-1">
                    <div className={cn('p-1 rounded', getActionColor(log.action, log.severity))}>
                      {getActionIcon(log.action)}
                    </div>
                  </td>

                  {/* Nom */}
                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate max-w-xs">
                    {log.userName || log.userEmail}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-1 text-sm text-gray-700 dark:text-dark-text-primary">
                    {getActionLabel(log.action)}
                  </td>

                  {/* Date & Heure */}
                  <td className="px-3 py-1 text-sm text-gray-600 dark:text-dark-text-secondary font-mono">
                    {formatTimestamp(log.timestamp)}
                  </td>

                  {/* Icône œil */}
                  <td className="px-3 py-1 text-center">
                    <Eye className="w-4 h-4 text-gray-400 dark:text-dark-text-muted hover:text-blue-600 transition" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg-tertiary">
              <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 dark:text-dark-text-muted">Aucune entrée trouvée</p>
              <p className="text-sm text-gray-400 dark:text-dark-text-muted mt-1">
                Essayez de modifier vos filtres de recherche
              </p>
            </div>
          )}
        </div>

        {/* Panneau de détail à droite */}
        {selectedLog && (
          <>
            {/* Overlay */}
            <div
              className="fixed inset-0 bg-black bg-opacity-30 z-40"
              onClick={() => setSelectedLog(null)}
            />

            {/* Panneau */}
            <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-white dark:bg-dark-bg-secondary shadow-2xl z-50 overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border p-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Détails de l'activité</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-6">
                {/* Action */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn('p-2 rounded-lg', getActionColor(selectedLog.action, selectedLog.severity))}>
                      {getActionIcon(selectedLog.action)}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                        {getActionLabel(selectedLog.action)}
                      </div>
                      {selectedLog.severity && selectedLog.severity !== 'info' && (
                        <div className="text-sm text-gray-500 dark:text-dark-text-muted">
                          Sévérité: {selectedLog.severity}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Utilisateur */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Utilisateur</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="font-medium">Nom:</span> {selectedLog.userName || 'N/A'}</div>
                    <div><span className="font-medium">Email:</span> {selectedLog.userEmail}</div>
                  </div>
                </div>

                {/* Date & Heure */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Date & Heure</h4>
                  <div className="text-sm font-mono text-gray-900 dark:text-dark-text-primary">
                    {formatTimestamp(selectedLog.timestamp)}
                  </div>
                </div>

                {/* Navigateur (pour LOGIN/LOGOUT) */}
                {(selectedLog.action === 'LOGIN_SUCCESS' || selectedLog.action === 'LOGOUT' || selectedLog.action === 'SESSION_EXPIRED') && selectedLog.userAgent && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Navigateur</h4>
                    <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                      {getBrowserInfo(selectedLog.userAgent)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-dark-text-muted mt-1 break-all">
                      {selectedLog.userAgent}
                    </div>
                  </div>
                )}

                {/* Raison de déconnexion */}
                {(selectedLog.action === 'LOGOUT' || selectedLog.action === 'SESSION_EXPIRED') && selectedLog.details?.reason && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Raison</h4>
                    <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                      {selectedLog.details.reason === 'manual' ? 'Déconnexion manuelle' :
                       selectedLog.details.reason === 'timeout' ? 'Inactivité' :
                       selectedLog.details.reason === 'forced' ? 'Déconnexion forcée' :
                       selectedLog.details.reason}
                    </div>
                  </div>
                )}

                {/* IP Address */}
                {selectedLog.ipAddress && selectedLog.ipAddress !== 'client' && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Adresse IP</h4>
                    <div className="text-sm font-mono text-gray-900 dark:text-dark-text-primary">
                      {selectedLog.ipAddress}
                    </div>
                  </div>
                )}

                {/* Cible (pour autres actions) */}
                {selectedLog.targetName && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Cible</h4>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Nom:</span> {selectedLog.targetName}</div>
                      {selectedLog.targetType && (
                        <div><span className="font-medium">Type:</span> {selectedLog.targetType}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Changements (previousValue → newValue) */}
                {selectedLog.previousValue && selectedLog.newValue && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Modifications</h4>
                    <div className="space-y-2">
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <div className="text-xs text-red-600 font-medium mb-1">Avant</div>
                        <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                          {typeof selectedLog.previousValue === 'object'
                            ? JSON.stringify(selectedLog.previousValue, null, 2)
                            : selectedLog.previousValue}
                        </div>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded p-2">
                        <div className="text-xs text-green-600 font-medium mb-1">Après</div>
                        <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                          {typeof selectedLog.newValue === 'object'
                            ? JSON.stringify(selectedLog.newValue, null, 2)
                            : selectedLog.newValue}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Détails supplémentaires */}
                {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Détails supplémentaires</h4>
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded p-3 text-xs font-mono">
                      <pre className="whitespace-pre-wrap text-gray-700 dark:text-dark-text-primary">
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
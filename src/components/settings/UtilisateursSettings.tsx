import React, { useState } from 'react';
import { Users, Shield, Clock } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { UserManagement } from '../users/UserManagement';
import { PermissionsManagement } from './PermissionsManagement';
import { SecuritySettings } from './SecuritySettings';
import { cn } from '@/utils/utils';

type Tab = 'membres' | 'permissions' | 'security';

export function UtilisateursSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('membres');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Membres & Sécurité']}
          title="Membres & Sécurité"
          description="Gestion des membres, permissions et sécurité de session"
        />

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-dark-border mb-6">
          <button
            onClick={() => setActiveTab('membres')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'membres'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Membres
            </div>
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'permissions'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Permissions
            </div>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'security'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Sécurité
            </div>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'membres' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
            <UserManagement />
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <PermissionsManagement />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <SecuritySettings />
          </div>
        )}
      </div>
    </div>
  );
}

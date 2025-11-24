/**
 * SecuriteSettingsPage
 *
 * Standalone page for security settings (session timeout, auto-logout)
 * Wraps the SecuritySettings component with header and layout
 */

import React from 'react';
import { SettingsHeader } from './SettingsHeader';
import { SecuritySettings } from './SecuritySettings';

export function SecuriteSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Système', 'Sécurité']}
          title="Sécurité"
          description="Paramètres de déconnexion automatique et timeout de session"
        />

        <SecuritySettings />
      </div>
    </div>
  );
}

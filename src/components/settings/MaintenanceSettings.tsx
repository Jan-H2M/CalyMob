import React from 'react';
import { SettingsHeader } from './SettingsHeader';
import { AppVersionControl } from './AppVersionControl';

export function MaintenanceSettings() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Maintenance']}
          title="Maintenance"
          description="Contrôle de version et force refresh"
        />

        <div className="space-y-6">
          {/* App Version Control - the only functional component */}
          <AppVersionControl />
        </div>
      </div>
    </div>
  );
}

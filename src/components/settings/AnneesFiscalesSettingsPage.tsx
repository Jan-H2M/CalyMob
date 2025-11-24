/**
 * AnneesFiscalesSettingsPage
 *
 * Standalone page for fiscal years management
 * Wraps the FiscalYearsManagement component with header and layout
 */

import React from 'react';
import { SettingsHeader } from './SettingsHeader';
import { FiscalYearsManagement } from './FiscalYearsManagement';

export function AnneesFiscalesSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Système', 'Années Fiscales']}
          title="Années Fiscales"
          description="Gestion des années comptables et clôture annuelle"
        />

        <FiscalYearsManagement />
      </div>
    </div>
  );
}

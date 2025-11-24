/**
 * ListesValeursSettingsPage
 *
 * Standalone page for value lists management (dynamic dropdowns)
 * Wraps the ValueListsSettings component with header and layout
 */

import React from 'react';
import { SettingsHeader } from './SettingsHeader';
import ValueListsSettings from './ValueListsSettings';

export function ListesValeursSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Listes de Valeurs']}
          title="Listes de Valeurs"
          description="Gestion des listes déroulantes dynamiques"
        />

        <ValueListsSettings />
      </div>
    </div>
  );
}

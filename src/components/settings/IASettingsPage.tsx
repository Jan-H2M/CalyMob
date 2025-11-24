/**
 * IASettingsPage
 *
 * Standalone page for AI configuration (OpenAI, Anthropic API keys)
 * Wraps the AISettings component with header and layout
 */

import React from 'react';
import { SettingsHeader } from './SettingsHeader';
import { AISettings } from './AISettings';

export function IASettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Système', 'Intelligence Artificielle']}
          title="Intelligence Artificielle"
          description="Configuration des clés API pour OpenAI et Anthropic"
        />

        <AISettings />
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { ArrowLeft, Package, ClipboardList, Euro, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TypesMaterielConfig } from '@/components/inventaire/settings/TypesMaterielConfig';
import { ChecklistsConfig } from '@/components/inventaire/settings/ChecklistsConfig';
import { CautionsConfig } from '@/components/inventaire/settings/CautionsConfig';
import { EmplacementsConfig } from '@/components/inventaire/settings/EmplacementsConfig';
import { cn } from '@/utils/utils';

type TabType = 'types' | 'checklists' | 'cautions' | 'emplacements';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: 'types', label: 'Types de Matériel', icon: Package },
  { id: 'checklists', label: 'Checklists', icon: ClipboardList },
  { id: 'cautions', label: 'Cautions', icon: Euro },
  { id: 'emplacements', label: 'Emplacements', icon: MapPin }
];

export function InventaireSettings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('types');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/parametres')}
          className="mb-6 inline-flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux paramètres
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-3">
            <Package className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            Configuration Inventaire
          </h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
            Configurez les types de matériel, checklists, cautions et emplacements
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">
                Module en développement - Accès superadmin uniquement
              </h3>
              <div className="mt-1 text-sm text-orange-700 dark:text-orange-300">
                <p>
                  Cette configuration est nécessaire avant de pouvoir utiliser le module inventaire.
                  Configurez d'abord les types de matériel et les checklists, puis créez vos emplacements.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="border-b border-gray-200 dark:border-dark-border">
            <nav className="flex -mb-px overflow-x-auto" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex-1 min-w-0 py-4 px-6 text-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
                      isActive
                        ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                        : 'border-transparent text-gray-500 dark:text-dark-text-secondary hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-dark-border'
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'types' && <TypesMaterielConfig />}
            {activeTab === 'checklists' && <ChecklistsConfig />}
            {activeTab === 'cautions' && <CautionsConfig />}
            {activeTab === 'emplacements' && <EmplacementsConfig />}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { ArrowLeft, Package, ClipboardList, Euro } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TypesMaterielConfig } from '@/components/inventaire/settings/TypesMaterielConfig';
import { ChecklistsConfig } from '@/components/inventaire/settings/ChecklistsConfig';
import { CautionsConfig } from '@/components/inventaire/settings/CautionsConfig';
import { cn } from '@/utils/utils';

type TabType = 'types' | 'checklists' | 'cautions';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: 'types', label: 'Types de Matériel', icon: Package },
  { id: 'checklists', label: 'Checklists', icon: ClipboardList },
  { id: 'cautions', label: 'Cautions', icon: Euro }
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
          className="mb-6 inline-flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary transition-colors"
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
            Configurez les types de matériel, checklists et cautions
          </p>
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
                        : 'border-transparent text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary hover:border-gray-300 dark:border-dark-border dark:hover:border-dark-border'
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
          </div>
        </div>
      </div>
    </div>
  );
}

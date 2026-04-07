import React, { useState } from 'react';
import { Package, ClipboardList, ClipboardCheck, BookOpen } from 'lucide-react';
import { cn } from '@/utils/utils';
import { MaterielPage } from './materiel/MaterielPage';
import { PretsPage } from './prets/PretsPage';
import { InventoryAuditPage } from './audit/InventoryAuditPage';
import { InventoryDocumentation } from './documentation/InventoryDocumentation';

type TabType = 'materiel' | 'prets' | 'audit' | 'docs';

interface TabDefinition {
  id: TabType;
  label: string;
  icon: React.ElementType;
  description: string;
}

const tabs: TabDefinition[] = [
  {
    id: 'materiel',
    label: 'Matériel',
    icon: Package,
    description: 'Gestion du matériel unitaire (régulateurs, BC, lampes...)'
  },
  {
    id: 'prets',
    label: 'Prêts',
    icon: ClipboardList,
    description: 'Suivi des prêts de matériel aux membres'
  },
  {
    id: 'audit',
    label: 'Inventaire',
    icon: ClipboardCheck,
    description: 'Contrôle annuel du matériel'
  },
  {
    id: 'docs',
    label: 'Documentation',
    icon: BookOpen,
    description: 'Guide d\'utilisation du module'
  }
];

export function InventairePage() {
  const [activeTab, setActiveTab] = useState<TabType>('materiel');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Inventaire</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
          Gestion du matériel et des prêts
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:border-gray-300 dark:border-dark-border hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary',
                  'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors'
                )}
              >
                <Icon
                  className={cn(
                    isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-dark-text-muted group-hover:text-gray-500 dark:text-dark-text-muted',
                    '-ml-0.5 mr-2 h-5 w-5'
                  )}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'materiel' && <MaterielPage />}
        {activeTab === 'prets' && <PretsPage />}
        {activeTab === 'audit' && <InventoryAuditPage />}
        {activeTab === 'docs' && <InventoryDocumentation />}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Package, ClipboardList, ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/utils';
import { MaterielPage } from './materiel/MaterielPage';
import { PretsPage } from './prets/PretsPage';
import { StockPage } from './stock/StockPage';

type TabType = 'materiel' | 'prets' | 'stock';

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
    id: 'stock',
    label: 'Stock',
    icon: ShoppingCart,
    description: 'Gestion des produits en stock (masques, palmes...)'
  }
];

export function InventairePage() {
  const [activeTab, setActiveTab] = useState<TabType>('materiel');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Inventaire</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestion du matériel, des prêts et du stock
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
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
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                  'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors'
                )}
              >
                <Icon
                  className={cn(
                    isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500',
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
      <div className="bg-white rounded-lg shadow p-6">
        {activeTab === 'materiel' && <MaterielPage />}

        {activeTab === 'prets' && <PretsPage />}

        {activeTab === 'stock' && <StockPage />}
      </div>

      {/* Dev Note */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Module en développement
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Ce module est actuellement en phase de développement.
                Seul le superadmin a accès à cette page.
              </p>
              <p className="mt-2">
                <strong>✅ Modules disponibles:</strong>
              </p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li><strong>Configuration</strong> (Paramètres → Inventaire): Types, checklists, cautions, emplacements</li>
                <li><strong>Membres</strong>: Gestion centralisée dans Paramètres → Membres</li>
                <li><strong>Matériel unitaire</strong>: Gestion du matériel avec photos et maintenance</li>
                <li><strong>Prêts</strong>: Système de prêt avec cautions, checklists et signatures digitales</li>
                <li><strong>Produits en stock</strong>: Gestion du stock, ventes et commandes fournisseurs</li>
              </ul>
              <p className="mt-2">
                <strong>✅ Phase 1 TERMINÉE:</strong> Module inventaire complet et opérationnel!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

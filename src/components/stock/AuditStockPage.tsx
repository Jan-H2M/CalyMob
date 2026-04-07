/**
 * AuditStockPage - Pagina voor alle jaarlijkse stock afsluitingen
 *
 * Bevat drie tabs:
 * - Audit Matériel: Inventory audit (fysieke controle materiaal)
 * - Clôture Matériel: Waarde snapshots voor Bilan 01.01
 * - Boutique: Stock clôtures voor Bilan 02.01.xx
 */

import { useState } from 'react';
import { ClipboardCheck, ShoppingBag, Package } from 'lucide-react';
import { StockHeader } from './StockHeader';
import { InventoryAuditPage } from '../inventaire/audit/InventoryAuditPage';
import { BoutiqueSnapshotsList } from '../inventaire/audit/BoutiqueSnapshotsList';
import { InventoryValueSnapshotsList } from '../inventaire/audit/InventoryValueSnapshotsList';

type TabType = 'audit_materiel' | 'cloture_materiel' | 'boutique';

export function AuditStockPage() {
  const [activeTab, setActiveTab] = useState<TabType>('audit_materiel');

  const tabs = [
    {
      id: 'audit_materiel' as TabType,
      label: 'Audit Matériel',
      icon: ClipboardCheck,
      description: 'Contrôle physique annuel du matériel'
    },
    {
      id: 'cloture_materiel' as TabType,
      label: 'Clôture Matériel',
      icon: Package,
      description: 'Clôtures valeur matériel pour le Bilan (01.01)'
    },
    {
      id: 'boutique' as TabType,
      label: 'Boutique',
      icon: ShoppingBag,
      description: 'Clôtures stock boutique pour le Bilan (02.01)'
    }
  ];

  const activeTabInfo = tabs.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <StockHeader
          title="Inventaire"
          description={activeTabInfo?.description || 'Gestion des inventaires'}
        />

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-dark-border">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm
                      ${isActive
                        ? 'border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua'
                        : 'border-transparent text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary hover:border-gray-300 dark:border-dark-border dark:hover:border-dark-border'
                      }
                    `}
                  >
                    <Icon
                      className={`
                        -ml-0.5 mr-2 h-5 w-5
                        ${isActive
                          ? 'text-calypso-blue dark:text-calypso-aqua'
                          : 'text-gray-400 dark:text-dark-text-muted group-hover:text-gray-500 dark:text-dark-text-muted dark:group-hover:text-dark-text-secondary'
                        }
                      `}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'audit_materiel' && <InventoryAuditPage />}
          {activeTab === 'cloture_materiel' && <InventoryValueSnapshotsList />}
          {activeTab === 'boutique' && <BoutiqueSnapshotsList />}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';

interface FilterTab {
  id: string;
  title: string;
  icon?: React.ReactNode;
  activeFilters: number;
  content: React.ReactNode;
}

interface FilterAccordionWithTabsProps {
  tabs: FilterTab[];
  onReset?: () => void;
  persistKey?: string;
  defaultExpanded?: boolean;
  searchBar?: React.ReactNode;
  recordsFound?: number;
  totalRecords?: number;
}

export const FilterAccordionWithTabs: React.FC<FilterAccordionWithTabsProps> = ({
  tabs,
  onReset,
  persistKey,
  defaultExpanded = false,
  searchBar,
  recordsFound,
  totalRecords
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || '');

  // Load persisted state
  useEffect(() => {
    if (persistKey) {
      const saved = localStorage.getItem(`filter-accordion-tabs-${persistKey}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setIsExpanded(parsed.expanded);
          setActiveTabId(parsed.activeTab || tabs[0]?.id || '');
        } catch (e) {
          console.error('Failed to load filter accordion state:', e);
        }
      }
    }
  }, [persistKey, tabs]);

  // Save state
  useEffect(() => {
    if (persistKey) {
      const state = {
        expanded: isExpanded,
        activeTab: activeTabId
      };
      localStorage.setItem(`filter-accordion-tabs-${persistKey}`, JSON.stringify(state));
    }
  }, [isExpanded, activeTabId, persistKey]);

  const toggleAccordion = () => {
    setIsExpanded(!isExpanded);
  };

  const totalActiveFilters = tabs.reduce((sum, tab) => sum + tab.activeFilters, 0);
  const activeTab = tabs.find(tab => tab.id === activeTabId);

  return (
    <div className="w-full bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
      <div className="p-3">
        {/* Search bar and filters toggle on same line */}
        <div className="flex items-center gap-2">
          {/* Search bar takes most space */}
          {searchBar && (
            <div className="flex-1">
              {searchBar}
            </div>
          )}

          {/* Accordion toggle button with integrated record counter */}
          <button
            onClick={toggleAccordion}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors border border-gray-200 dark:border-dark-border relative group"
            aria-label={isExpanded ? "Masquer les filtres" : "Afficher les filtres"}
          >
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Filtres avancés
            </span>
            {recordsFound !== undefined && totalRecords !== undefined && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({recordsFound}/{totalRecords})
              </span>
            )}
            {totalActiveFilters > 0 && (
              <span className="px-2 py-0.5 bg-calypso-blue text-white text-xs rounded-full">
                {totalActiveFilters}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />

            {/* Tooltip on hover */}
            {recordsFound !== undefined && totalRecords !== undefined && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-2 text-xs text-white bg-gray-800 dark:bg-gray-900 rounded-lg shadow-lg whitespace-normal min-w-[200px] max-w-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[10000] pointer-events-none">
                {totalActiveFilters === 0 ? (
                  // No filters applied
                  recordsFound < totalRecords ? (
                    `Les transactions enfants (lignes de ventilation) ne sont pas comptées dans le nombre affiché pour éviter le double comptage. Seules les transactions principales sont visibles. (${recordsFound} principales sur ${totalRecords} au total)`
                  ) : (
                    `Toutes les transactions sont affichées (${totalRecords} transactions)`
                  )
                ) : (
                  // Filters are active
                  <>
                    <div className="font-semibold mb-1">Filtres actifs ({totalActiveFilters})</div>
                    <div className="mb-1">Résultat: {recordsFound} transaction{recordsFound > 1 ? 's' : ''} trouvée{recordsFound > 1 ? 's' : ''} sur {totalRecords}</div>
                    {recordsFound === 0 && (
                      <div className="text-yellow-300 mt-1">Aucune transaction ne correspond aux critères de recherche</div>
                    )}
                  </>
                )}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-800 dark:border-b-gray-900"></div>
              </div>
            )}
          </button>

          {/* Reset button */}
          {totalActiveFilters > 0 && (
            <button
              onClick={onReset}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors group border border-gray-200 dark:border-dark-border"
              aria-label="Réinitialiser"
              title="Réinitialiser tous les filtres"
            >
              <X className="w-4 h-4 text-gray-500 group-hover:text-red-500 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* Expandable content */}
        <div
          className={`transition-all duration-200 ${
            isExpanded ? 'opacity-100 mt-2' : 'max-h-0 opacity-0 overflow-hidden'
          }`}
        >
          {/* Tab navigation */}
          <div className="border-b border-gray-200 dark:border-dark-border mb-2">
            <nav className="flex -mb-px space-x-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`
                    px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap
                    flex items-center gap-1
                    ${activeTabId === tab.id
                      ? 'border-calypso-blue text-calypso-blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }
                  `}
                >
                  {tab.icon}
                  <span>{tab.title}</span>
                  {tab.activeFilters > 0 && (
                    <span className={`
                      px-1.5 py-0.5 text-xs rounded-full
                      ${activeTabId === tab.id
                        ? 'bg-calypso-blue text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }
                    `}>
                      {tab.activeFilters}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="max-h-[150px] overflow-visible py-2">
            {activeTab && activeTab.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterAccordionWithTabs;
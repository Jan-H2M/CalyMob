import React, { useState, useEffect } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';

interface FilterSection {
  id: string;
  title: string;
  icon?: React.ReactNode;
  activeFilters?: number;
  children: React.ReactNode;
}

interface FilterAccordionProps {
  sections: FilterSection[];
  onReset?: () => void;
  persistKey?: string; // Key for localStorage persistence
  defaultExpanded?: string[]; // Default expanded sections
}

export const FilterAccordion: React.FC<FilterAccordionProps> = ({
  sections,
  onReset,
  persistKey,
  defaultExpanded = []
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(defaultExpanded)
  );
  const [isMainExpanded, setIsMainExpanded] = useState(false);

  // Load persisted state from localStorage
  useEffect(() => {
    if (persistKey) {
      const saved = localStorage.getItem(`filter-accordion-${persistKey}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setExpandedSections(new Set(parsed.expanded));
          setIsMainExpanded(parsed.mainExpanded);
        } catch (e) {
          console.error('Failed to load filter accordion state:', e);
        }
      }
    }
  }, [persistKey]);

  // Save state to localStorage
  useEffect(() => {
    if (persistKey) {
      const state = {
        expanded: Array.from(expandedSections),
        mainExpanded: isMainExpanded
      };
      localStorage.setItem(`filter-accordion-${persistKey}`, JSON.stringify(state));
    }
  }, [expandedSections, isMainExpanded, persistKey]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const toggleMain = () => {
    setIsMainExpanded(!isMainExpanded);
  };

  const totalActiveFilters = sections.reduce(
    (sum, section) => sum + (section.activeFilters || 0),
    0
  );

  return (
    <div className="w-full">
      {/* Main header with search and toggle */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={toggleMain}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-bg-secondary rounded-lg transition-colors"
          aria-label={isMainExpanded ? "Hide filters" : "Show filters"}
        >
          <ChevronDown
            className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${
              isMainExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Filtres
          </span>
          {totalActiveFilters > 0 && !isMainExpanded && (
            <span className="ml-2 px-2 py-0.5 bg-calypso-blue text-white text-xs rounded-full">
              {totalActiveFilters} actif{totalActiveFilters > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {totalActiveFilters > 0 && (
          <button
            onClick={onReset}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors group"
            aria-label="Reset all filters"
          >
            <X className="w-4 h-4 text-gray-500 group-hover:text-red-500 dark:text-gray-400" />
          </button>
        )}
      </div>

      {/* Accordion sections */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isMainExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-2 pt-2">
          {sections.map((section) => (
            <FilterSectionComponent
              key={section.id}
              section={section}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface FilterSectionComponentProps {
  section: FilterSection;
  isExpanded: boolean;
  onToggle: () => void;
}

const FilterSectionComponent: React.FC<FilterSectionComponentProps> = ({
  section,
  isExpanded,
  onToggle
}) => {
  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          {section.icon}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {section.title}
          </span>
          {section.activeFilters && section.activeFilters > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-calypso-blue text-white text-xs rounded">
              {section.activeFilters}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`transition-all duration-300 ${
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        } overflow-hidden`}
      >
        <div className="p-3 bg-white dark:bg-dark-bg border-t border-gray-200 dark:border-dark-border">
          {section.children}
        </div>
      </div>
    </div>
  );
};

export default FilterAccordion;
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, User, UserX, Check } from 'lucide-react';
import { Membre } from '../../types';
import { getFirstName, getLastName } from '../../utils/fieldMapper';
import { cn } from '../../utils/utils';

interface ExternalOption {
  prenom: string;
  nom: string;
}

interface MemberSearchSelectProps {
  members: Membre[];
  value: string | null; // member ID or 'externe'
  onChange: (value: string | null) => void;
  externalOption?: ExternalOption | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  confidenceColor?: string;
  showConfidence?: boolean;
  confidenceValue?: number;
}

export const MemberSearchSelect: React.FC<MemberSearchSelectProps> = ({
  members,
  value,
  onChange,
  externalOption,
  placeholder = "Rechercher un membre...",
  className = "",
  disabled = false,
  confidenceColor,
  showConfidence = false,
  confidenceValue = 0
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    if (!searchTerm.trim()) return members;

    const term = searchTerm.toLowerCase();
    return members.filter(member => {
      const firstName = getFirstName(member)?.toLowerCase() || '';
      const lastName = getLastName(member)?.toLowerCase() || '';
      const fullName = `${firstName} ${lastName}`;
      return fullName.includes(term) || firstName.includes(term) || lastName.includes(term);
    });
  }, [members, searchTerm]);

  // Sort members alphabetically by first name then last name
  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const aName = `${getFirstName(a)} ${getLastName(a)}`.toLowerCase();
      const bName = `${getFirstName(b)} ${getLastName(b)}`.toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [filteredMembers]);

  // Get selected display value
  const selectedDisplay = useMemo(() => {
    if (!value) return null;
    if (value === 'externe' && externalOption) {
      return `Externe: ${externalOption.prenom} ${externalOption.nom}`;
    }
    const member = members.find(m => m.id === value);
    if (member) {
      return `${getFirstName(member)} ${getLastName(member)}`;
    }
    return null;
  }, [value, members, externalOption]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownHeight = 320; // max-h-80 = 320px
      const dropdownWidth = 300;

      // Check if there's enough space below
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      let top: number;
      let left = rect.left;

      // Position vertically
      if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
        top = rect.bottom + 4;
      } else {
        top = rect.top - dropdownHeight - 4;
      }

      // Ensure dropdown doesn't go off right edge
      if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 16;
      }

      // Ensure dropdown doesn't go off left edge
      if (left < 16) {
        left = 16;
      }

      setDropdownStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${Math.max(dropdownWidth, rect.width)}px`,
        zIndex: 9999
      });
    }
  }, [isOpen]);

  const handleSelect = (memberId: string | null) => {
    onChange(memberId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm border rounded-lg transition-colors text-left",
          "dark:bg-dark-bg-tertiary dark:border-dark-border",
          disabled
            ? "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
            : "bg-white hover:border-gray-400 cursor-pointer",
          value === 'externe'
            ? "text-purple-600 dark:text-purple-400 border-purple-300"
            : confidenceColor || "text-gray-900 dark:text-dark-text-primary"
        )}
      >
        <span className="truncate flex-1">
          {selectedDisplay || (
            <span className="text-gray-400 dark:text-dark-text-muted">-- Sélectionner --</span>
          )}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {showConfidence && value && value !== 'externe' && confidenceValue > 0 && (
            <span className={cn("text-xs font-medium", confidenceColor)}>
              {confidenceValue}%
            </span>
          )}
          {value === 'externe' && (
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              Ext.
            </span>
          )}
          <ChevronDown className={cn(
            "h-4 w-4 text-gray-400 dark:text-dark-text-muted transition-transform",
            isOpen && "rotate-180"
          )} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-xl overflow-hidden"
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-secondary focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-dark-text-primary"
                autoFocus
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-64 overflow-y-auto">
            {/* Clear selection option */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors",
                !value && "bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              <UserX className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              <span className="text-gray-500 dark:text-dark-text-muted">-- Sélectionner --</span>
              {!value && <Check className="h-4 w-4 text-blue-500 ml-auto" />}
            </button>

            {/* External option */}
            {externalOption && (
              <>
                <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 border-y border-purple-100 dark:border-purple-800">
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                    Externe (depuis transaction)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelect('externe')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors",
                    value === 'externe' && "bg-purple-100 dark:bg-purple-900/30"
                  )}
                >
                  <User className="h-4 w-4 text-purple-500" />
                  <span className="text-purple-700 dark:text-purple-300">
                    {externalOption.prenom} {externalOption.nom}
                  </span>
                  {value === 'externe' && <Check className="h-4 w-4 text-purple-500 ml-auto" />}
                </button>
              </>
            )}

            {/* Members section */}
            <div className="px-3 py-1.5 bg-gray-100 dark:bg-dark-bg-tertiary border-y border-gray-200 dark:border-dark-border">
              <span className="text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">
                Membres du club ({sortedMembers.length})
              </span>
            </div>

            {sortedMembers.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-dark-text-muted">
                Aucun membre trouvé
              </div>
            ) : (
              sortedMembers.map(member => {
                const isSelected = value === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleSelect(member.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors",
                      isSelected && "bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                    <User className="h-4 w-4 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
                    <span className={cn(
                      "flex-1 truncate",
                      isSelected ? "text-blue-700 dark:text-blue-300 font-medium" : "text-gray-700 dark:text-dark-text-primary"
                    )}>
                      {getFirstName(member)} <span className="font-medium uppercase">{getLastName(member)}</span>
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberSearchSelect;

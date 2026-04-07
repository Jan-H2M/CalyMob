/**
 * Member Email Selector Component
 * 
 * Allows selecting member emails from the club's member list
 * with search/autocomplete functionality.
 */

import { useState, useEffect, useRef } from 'react';
import { getMembres } from '@/services/membreService';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import type { Membre } from '@/types';
import { X, Search, ChevronDown } from 'lucide-react';

interface MemberEmailSelectorProps {
  clubId: string;
  value: string[];  // Array of email addresses
  onChange: (emails: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MemberEmailSelector({
  clubId,
  value,
  onChange,
  disabled = false,
  placeholder = 'Rechercher un membre par nom ou email...'
}: MemberEmailSelectorProps) {
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load all members on mount
  useEffect(() => {
    async function loadMembres() {
      try {
        const data = await getMembres(clubId);
        // Filter out members without email and sort by name
        const withEmail = data.filter(m => m.email);
        withEmail.sort((a, b) => {
          const nameA = `${getLastName(a)} ${getFirstName(a)}`.toLowerCase();
          const nameB = `${getLastName(b)} ${getFirstName(b)}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
        setMembres(withEmail);
      } catch (err) {
        console.error('Error loading members:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMembres();
  }, [clubId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter membres based on search
  const filteredMembres = membres.filter(m => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const fullName = `${getFirstName(m)} ${getLastName(m)}`.toLowerCase();
    const reverseName = `${getLastName(m)} ${getFirstName(m)}`.toLowerCase();
    return (
      fullName.includes(searchLower) || 
      reverseName.includes(searchLower) || 
      m.email.toLowerCase().includes(searchLower)
    );
  });

  // Get display name for an email
  const getDisplayName = (email: string): string => {
    const membre = membres.find(m => m.email === email);
    if (membre) {
      return `${getFirstName(membre)} ${getLastName(membre)}`;
    }
    return email;
  };

  const handleSelect = (email: string) => {
    if (!value.includes(email)) {
      onChange([...value, email]);
    }
    setSearch('');
    setIsOpen(false);
  };

  const handleRemove = (email: string) => {
    onChange(value.filter(e => e !== email));
  };

  // Handle manual email entry
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.includes('@') && search.includes('.')) {
      e.preventDefault();
      const email = search.trim().toLowerCase();
      if (!value.includes(email)) {
        onChange([...value, email]);
      }
      setSearch('');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected emails as badges */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(email => (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300"
              title={email}
            >
              {getDisplayName(email)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(email)}
                  className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <ChevronDown 
          className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-dark-text-muted text-center">
              <span className="inline-block animate-spin mr-2">⟳</span>
              Chargement des membres...
            </div>
          ) : filteredMembres.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-dark-text-muted text-center">
              {search ? (
                <>
                  Aucun membre trouvé pour "{search}"
                  {search.includes('@') && (
                    <p className="mt-1 text-xs">
                      Appuyez sur <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary rounded">Entrée</kbd> pour ajouter cette adresse
                    </p>
                  )}
                </>
              ) : (
                'Aucun membre avec email'
              )}
            </div>
          ) : (
            <>
              {search && search.includes('@') && !filteredMembres.some(m => m.email.toLowerCase() === search.toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => handleSelect(search.trim().toLowerCase())}
                  className="w-full px-4 py-2 text-left text-sm bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-b border-gray-200 dark:border-dark-border"
                >
                  <span className="text-blue-700 dark:text-blue-300">
                    ➕ Ajouter "{search}" (email externe)
                  </span>
                </button>
              )}
              {filteredMembres.slice(0, 50).map(membre => {
                const isSelected = value.includes(membre.email);
                return (
                  <button
                    key={membre.id}
                    type="button"
                    onClick={() => handleSelect(membre.email)}
                    disabled={isSelected}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary flex justify-between items-center ${
                      isSelected ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-dark-bg-tertiary' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {getFirstName(membre)} {getLastName(membre)}
                      </span>
                      <span className="ml-2 text-gray-500 dark:text-dark-text-muted truncate">
                        {membre.email}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-xs text-green-600 dark:text-green-400 ml-2 flex-shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
              {filteredMembres.length > 50 && (
                <div className="px-4 py-2 text-xs text-gray-500 dark:text-dark-text-muted text-center border-t border-gray-200 dark:border-dark-border">
                  {filteredMembres.length - 50} membres supplémentaires - affinez votre recherche
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

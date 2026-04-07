import { useEffect } from 'react';
import { logger } from '@/utils/logger';

interface UseKeyboardNavigationProps<T> {
  items: T[];              // Gefilterde lijst (bv. filteredDemandes)
  currentItem: T | null;   // Huidig getoond item
  onNavigate: (item: T) => void;  // Callback om nieuw item te tonen
  isOpen: boolean;         // Of detail view open is
  idKey?: keyof T;         // Key voor ID vergelijking (default: 'id')
}

/**
 * Custom hook voor keyboard navigatie in detail views
 * Ondersteunt pijltjestoetsen (← →) om te navigeren door een lijst items
 *
 * @example
 * useKeyboardNavigation({
 *   items: filteredDemandes,
 *   currentItem: detailViewDemand,
 *   onNavigate: setDetailViewDemand,
 *   isOpen: !!detailViewDemand
 * });
 */
export function useKeyboardNavigation<T extends Record<string, any>>({
  items,
  currentItem,
  onNavigate,
  isOpen,
  idKey = 'id' as keyof T
}: UseKeyboardNavigationProps<T>) {
  useEffect(() => {
    // Alleen luisteren als detail view open is
    if (!isOpen || !currentItem) {
      logger.debug('🔍 [useKeyboardNavigation] Not listening:', { isOpen, hasCurrentItem: !!currentItem });
      return;
    }

    logger.debug('👂 [useKeyboardNavigation] Adding listener - items:', items.length, 'current:', currentItem[idKey]);

    const handleKeyDown = (event: KeyboardEvent) => {
      // Alleen reageren op pijltjestoetsen
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      logger.debug('⌨️ [useKeyboardNavigation] Arrow key pressed:', event.key);

      // Niet reageren als gebruiker in een input field of textarea is
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Zoek index van huidig item
      const currentIndex = items.findIndex(item => item[idKey] === currentItem[idKey]);

      // Als item niet gevonden, doe niets
      if (currentIndex === -1) return;

      // Bereken nieuwe index
      let newIndex: number;
      if (event.key === 'ArrowRight') {
        // Volgende item (wrap naar begin als aan eind)
        newIndex = (currentIndex + 1) % items.length;
      } else {
        // Vorige item (wrap naar eind als aan begin)
        newIndex = (currentIndex - 1 + items.length) % items.length;
      }

      // Navigeer naar nieuw item
      const newItem = items[newIndex];
      if (newItem) {
        logger.debug('✅ [useKeyboardNavigation] Navigating to:', newItem[idKey], 'at index', newIndex);
        event.preventDefault(); // Voorkom default browser gedrag
        onNavigate(newItem);
      }
    };

    // Voeg event listener toe
    window.addEventListener('keydown', handleKeyDown);
    logger.debug('✅ [useKeyboardNavigation] Listener added');

    // Cleanup
    return () => {
      logger.debug('🗑️ [useKeyboardNavigation] Removing listener');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [items, currentItem, onNavigate, isOpen, idKey]);
}

/**
 * Helper functie om huidige positie in lijst te vinden
 * Retourneert { current: number, total: number } of null als item niet gevonden
 */
export function getNavigationPosition<T extends Record<string, any>>(
  items: T[],
  currentItem: T | null,
  idKey: keyof T = 'id' as keyof T
): { current: number; total: number } | null {
  if (!currentItem || items.length === 0) return null;

  const currentIndex = items.findIndex(item => item[idKey] === currentItem[idKey]);
  if (currentIndex === -1) return null;

  return {
    current: currentIndex + 1, // 1-based voor display
    total: items.length
  };
}

/**
 * Icon Helper Utility
 *
 * Helper functies voor het dynamisch renderen van Lucide iconen.
 */

import * as LucideIcons from 'lucide-react';

/**
 * Render een Lucide icon dynamisch op basis van naam
 *
 * @param iconName - Naam van het Lucide icon (bijv. "Shield", "User")
 * @param className - Optional Tailwind classes voor styling
 * @returns React component of null als icon niet bestaat
 */
export function renderIcon(iconName: string | undefined, className?: string) {
  if (!iconName) return null;

  const Icon = (LucideIcons as any)[iconName];

  if (!Icon) {
    console.warn(`Icon "${iconName}" not found in Lucide icons`);
    return null;
  }

  return <Icon className={className} />;
}

/**
 * Check of een icon naam geldig is
 *
 * @param iconName - Naam van het icon om te valideren
 * @returns true als het icon bestaat in Lucide
 */
export function isValidIcon(iconName: string | undefined): boolean {
  if (!iconName) return false;
  return iconName in LucideIcons;
}

/**
 * Haal alle beschikbare Lucide icon namen op
 *
 * @returns Array van alle icon namen
 */
export function getAllIconNames(): string[] {
  return Object.keys(LucideIcons).filter(key => {
    // Filter out non-icon exports (like createLucideIcon, etc.)
    return typeof (LucideIcons as any)[key] === 'function' &&
           key !== 'createLucideIcon' &&
           !key.startsWith('default');
  });
}

/**
 * Types pour le système de thèmes (Dark Mode)
 */

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  name: string;
  value: Theme;
  icon: string; // Nom de l'icône Lucide
  description: string;
}

export const THEME_OPTIONS: ThemeConfig[] = [
  {
    name: 'Mode Clair',
    value: 'light',
    icon: 'Sun',
    description: 'Interface claire avec fond blanc'
  },
  {
    name: 'Mode Sombre',
    value: 'dark',
    icon: 'Moon',
    description: 'Interface sombre avec fond noir'
  },
  {
    name: 'Système',
    value: 'system',
    icon: 'Monitor',
    description: 'Suivre les préférences du système'
  },
];

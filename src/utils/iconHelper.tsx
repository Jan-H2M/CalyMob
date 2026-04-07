import { logger } from '@/utils/logger';
/**
 * Icon Helper Utility
 *
 * Helper functies voor het dynamisch renderen van Lucide iconen.
 * 
 * PERFORMANCE: Only imports icons from the allowlist (~45 icons)
 * instead of all 1000+ Lucide icons (~500KB savings)
 */

import {
  // Users category
  User, Users, Shield, UserCheck, UserCog, UserPlus,
  UserMinus, UserX, Award, Crown, Briefcase,
  // Finance category
  Wallet, CreditCard, Banknote, TrendingUp, TrendingDown,
  PiggyBank, Receipt, DollarSign, Euro, Coins,
  // Operations category
  Calendar, Target, FileText, ClipboardList, CheckCircle,
  Flag, Activity, BarChart, PieChart, Package,
  // General category
  Settings, Bell, Mail, Home, Star, Heart,
  Tag, Hash, AlertCircle, Info, HelpCircle,
  // Theme icons (used in ThemeSwitcher)
  Sun, Moon, Monitor,
  type LucideIcon
} from 'lucide-react';

/**
 * Allowlist of dynamically-renderable icons
 * Add new icons here when needed
 */
const ICON_MAP: Record<string, LucideIcon> = {
  // Users
  User, Users, Shield, UserCheck, UserCog, UserPlus,
  UserMinus, UserX, Award, Crown, Briefcase,
  // Finance
  Wallet, CreditCard, Banknote, TrendingUp, TrendingDown,
  PiggyBank, Receipt, DollarSign, Euro, Coins,
  // Operations
  Calendar, Target, FileText, ClipboardList, CheckCircle,
  Flag, Activity, BarChart, PieChart, Package,
  // General
  Settings, Bell, Mail, Home, Star, Heart,
  Tag, Hash, AlertCircle, Info, HelpCircle,
  // Theme
  Sun, Moon, Monitor,
};

/**
 * Render een Lucide icon dynamisch op basis van naam
 *
 * @param iconName - Naam van het Lucide icon (bijv. "Shield", "User")
 * @param className - Optional Tailwind classes voor styling
 * @returns React component of null als icon niet bestaat
 */
export function renderIcon(iconName: string | undefined, className?: string) {
  if (!iconName) return null;

  const Icon = ICON_MAP[iconName];

  if (!Icon) {
    logger.warn(`Icon "${iconName}" not found in allowlist. Add it to iconHelper.tsx if needed.`);
    return null;
  }

  return <Icon className={className} />;
}

/**
 * Check of een icon naam geldig is
 *
 * @param iconName - Naam van het icon om te valideren
 * @returns true als het icon bestaat in de allowlist
 */
export function isValidIcon(iconName: string | undefined): boolean {
  if (!iconName) return false;
  return iconName in ICON_MAP;
}

/**
 * Haal alle beschikbare icon namen op
 *
 * @returns Array van alle icon namen in de allowlist
 */
export function getAllIconNames(): string[] {
  return Object.keys(ICON_MAP);
}

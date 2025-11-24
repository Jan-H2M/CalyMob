import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// Utility pour combiner les classes Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formater un montant en euros
export function formatMontant(montant: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(montant);
}

// Formater une date
export function formatDate(date: Date | string | undefined | null | any, formatStr: string = 'dd/MM/yyyy'): string {
  if (!date) return 'Date non disponible';

  try {
    let dateObj: Date;

    // Handle Firestore Timestamp objects
    if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      console.error('Erreur lors du formatage de la date:', date);
      return 'Date invalide';
    }

    // Vérifier si la date est valide
    if (isNaN(dateObj.getTime())) {
      return 'Date invalide';
    }
    return format(dateObj, formatStr, { locale: fr });
  } catch (error) {
    console.error('Erreur lors du formatage de la date:', date, error);
    return 'Date invalide';
  }
}

// Formater une date avec heure
export function formatDateTime(date: Date | string | undefined | null): string {
  return formatDate(date, 'dd/MM/yyyy HH:mm');
}

// Formater une date relative (il y a X jours)
export function formatRelativeDate(date: Date | string | undefined | null): string {
  if (!date) return 'Date non disponible';

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    // Vérifier si la date est valide
    if (isNaN(dateObj.getTime())) {
      return 'Date invalide';
    }

    const now = new Date();
    const diff = now.getTime() - dateObj.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    if (days < 30) return `Il y a ${Math.floor(days / 7)} semaines`;
    if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`;
    return `Il y a ${Math.floor(days / 365)} ans`;
  } catch (error) {
    console.error('Erreur lors du formatage de la date relative:', date, error);
    return 'Date invalide';
  }
}

// Générer un hash pour la déduplication des transactions
export function generateTransactionHash(transaction: {
  numero_sequence: string;
  date_execution: Date | string;
  montant: number;
  contrepartie_nom: string;
  communication: string;
}): string {
  const str = `${transaction.numero_sequence}|${transaction.date_execution}|${transaction.montant}|${transaction.contrepartie_nom}|${transaction.communication}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Détecte si un numero_sequence est incomplet
 * Exemple: "2025-" → true, "2025-00928" → false, "2024-" → true
 */
export function isIncompleteSequenceNumber(numeroSequence: string): boolean {
  return /^\d{4}-$/.test(numeroSequence);
}

/**
 * Trouve une transaction avec numéro incomplet qui correspond
 * à la transaction donnée (par matching strict sur date, montant, contrepartie, communication)
 *
 * @param newTransaction - Transaction du CSV avec numéro complet
 * @param existingTransactions - Transactions existantes dans Firestore
 * @returns Transaction existante avec numéro incomplet qui match, ou null
 */
export function findIncompleteMatch(
  newTransaction: {
    numero_sequence: string;
    date_execution: Date | string;
    montant: number;
    contrepartie_nom: string;
    communication: string;
  },
  existingTransactions: Array<{
    id: string;
    numero_sequence: string;
    date_execution: Date | string;
    montant: number;
    contrepartie_nom: string;
    communication: string;
  }>
): { id: string } | null {
  // Vérifier que la nouvelle transaction a un numéro complet
  if (isIncompleteSequenceNumber(newTransaction.numero_sequence)) {
    return null;
  }

  const match = existingTransactions.find(existing => {
    // Critère 1: Numéro existant est incomplet
    if (!isIncompleteSequenceNumber(existing.numero_sequence)) {
      return false;
    }

    // Critère 2: Date d'exécution identique (skip si dates invalides)
    const existingDate = existing.date_execution instanceof Date
      ? existing.date_execution
      : new Date(existing.date_execution);
    const newDate = newTransaction.date_execution instanceof Date
      ? newTransaction.date_execution
      : new Date(newTransaction.date_execution);

    // Comparer les dates seulement si les deux sont valides
    const existingDateValid = !isNaN(existingDate.getTime());
    const newDateValid = !isNaN(newDate.getTime());

    if (existingDateValid && newDateValid) {
      const existingDateStr = existingDate.toISOString().split('T')[0];
      const newDateStr = newDate.toISOString().split('T')[0];

      // Comparer uniquement les dates (ignorer l'heure)
      if (existingDateStr !== newDateStr) {
        return false;
      }
    }
    // Si une des deux dates est invalide, on skip la vérification de date
    // et on continue avec les autres critères (montant, contrepartie, communication)

    // Critère 3: Montant identique
    if (existing.montant !== newTransaction.montant) {
      return false;
    }

    // Critère 4: Contrepartie identique
    if (existing.contrepartie_nom !== newTransaction.contrepartie_nom) {
      return false;
    }

    // Critère 5: Communication identique
    if (existing.communication !== newTransaction.communication) {
      return false;
    }

    // Tous les critères correspondent!
    return true;
  });

  return match ? { id: match.id } : null;
}

// Générer un hash pour la déduplication des événements VP Dive
export function generateEventHash(event: {
  titre: string;
  date_debut: Date | string;
  lieu: string;
  source_filename?: string;
}): string {
  // Normaliser la date en format ISO (YYYY-MM-DD)
  const dateStr = typeof event.date_debut === 'string'
    ? event.date_debut
    : event.date_debut.toISOString().split('T')[0];

  // Créer une chaîne unique combinant titre, date, lieu et nom de fichier
  // On normalise en minuscules et on trim pour éviter les variations
  const str = `${event.titre.toLowerCase().trim()}|${dateStr}|${event.lieu.toLowerCase().trim()}|${event.source_filename || ''}`;

  // Algorithme de hash simple (même que pour les transactions)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Déterminer la catégorie d'une transaction basée sur la communication
export function detecterCategorie(communication: string): string {
  const com = communication.toLowerCase();
  
  if (com.includes('cotisation') || com.includes('membership')) return 'cotisation';
  if (com.includes('piscine') || com.includes('pool')) return 'piscine';
  if (com.includes('sortie') || com.includes('plongée') || com.includes('dive')) return 'sortie';
  if (com.includes('assurance') || com.includes('insurance')) return 'assurance';
  if (com.includes('calyfiesta') || com.includes('soirée') || com.includes('fête')) return 'evenement';
  if (com.includes('remboursement') || com.includes('note de frais')) return 'remboursement';
  if (com.includes('materiel') || com.includes('équipement')) return 'materiel';
  if (com.includes('formation') || com.includes('brevet')) return 'formation';
  
  return 'autre';
}

// Couleurs pour les catégories (DEPRECATED - use getCategoryColorClasses instead)
export const CATEGORY_COLORS: Record<string, string> = {
  cotisation: 'bg-green-100 text-green-800',
  piscine: 'bg-blue-100 text-blue-800',
  sortie: 'bg-purple-100 text-purple-800',
  assurance: 'bg-orange-100 text-orange-800',
  evenement: 'bg-pink-100 text-pink-800',
  remboursement: 'bg-yellow-100 text-yellow-800',
  materiel: 'bg-indigo-100 text-indigo-800',
  formation: 'bg-teal-100 text-teal-800',
  autre: 'bg-gray-100 text-gray-800',
};

/**
 * Get Tailwind color classes for a category badge with full dark mode support
 * Maps category hex colors from CategorizationService to Tailwind classes
 * @param categoryId - The category ID (e.g., 'sorties_revenu', 'piscine')
 * @param categories - Array of categories from CategorizationService.getAllCategories()
 * @returns Tailwind classes string with light and dark mode variants
 */
export function getCategoryColorClasses(categoryId: string | undefined, categories: any[]): string {
  if (!categoryId) return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';

  const category = categories.find(c => c.id === categoryId);
  if (!category) return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';

  // Map hex colors from Categorie.couleur to Tailwind classes with dark mode support
  const colorMap: Record<string, string> = {
    '#10b981': 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',       // cotisation (green)
    '#06b6d4': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-400',           // sorties_revenu (cyan)
    '#0891b2': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-400',           // sorties_depense (dark cyan)
    '#3b82f6': 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',           // evenement (blue)
    '#f59e0b': 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400',       // piscine (amber)
    '#ef4444': 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',               // materiel (red)
    '#8b5cf6': 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-400',   // reunions (violet)
    '#a855f7': 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400',   // formation (purple)
    '#6366f1': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400',   // administration (indigo)
    '#ec4899': 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-400',           // assurance (pink)
    '#64748b': 'bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-400',       // frais_bancaires (slate)
    '#14b8a6': 'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-400',           // subside (teal)
  };

  return colorMap[category.couleur] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
}

// Couleurs pour les statuts
export const STATUS_COLORS: Record<string, string> = {
  soumis: 'bg-blue-100 text-blue-800',
  approuve: 'bg-green-100 text-green-800',
  rembourse: 'bg-gray-100 text-gray-800',
  refuse: 'bg-red-100 text-red-800',
  brouillon: 'bg-gray-100 text-gray-800',
  ouvert: 'bg-green-100 text-green-800',
  ferme: 'bg-gray-100 text-gray-800',
  annule: 'bg-red-100 text-red-800',
};

// Vérifier si un utilisateur a un rôle suffisant
export function hasRole(userRole: string, requiredRole: string): boolean {
  const roleHierarchy = ['membre', 'organisateur', 'validateur', 'admin'];
  const userLevel = roleHierarchy.indexOf(userRole);
  const requiredLevel = roleHierarchy.indexOf(requiredRole);
  return userLevel >= requiredLevel;
}

// Valider un IBAN
export function validateIBAN(iban: string): boolean {
  const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIBAN)) return false;
  
  // Validation simplifiée pour IBAN belge
  if (cleanIBAN.startsWith('BE') && cleanIBAN.length === 16) {
    return true;
  }
  
  return false;
}

// Parser un montant depuis une chaîne (format belge avec virgule)
export function parseMontant(str: string): number {
  // Remplacer la virgule par un point et enlever les espaces
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

// Générer un ID unique
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Télécharger un fichier
export function downloadFile(content: string, filename: string, type: string = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Obtenir les initiales d'un nom
export function getInitials(nom: string, prenom?: string): string {
  if (prenom) {
    return `${prenom[0]}${nom[0]}`.toUpperCase();
  }
  const parts = nom.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return nom.substring(0, 2).toUpperCase();
}
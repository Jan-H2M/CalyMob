/**
 * IBAN Lookup Service
 * Searches for IBANs in bank transactions that match a member's name
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface IbanMatch {
  iban: string;
  contrepartieNom: string;
  transactionCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  score: number; // 0-100 similarity score
}

/**
 * Levenshtein distance for string similarity
 */
function levenshtein(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

/**
 * Calculate similarity between two strings (0-1)
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : (maxLen - levenshtein(a, b)) / maxLen;
}

/**
 * Normalize a name for comparison
 */
function normalize(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/^(m\.|mme\.?|mr\.?|monsieur|madame|mlle\.?)\s+/i, '') // Remove titles
    .replace(/[^a-z\s]/g, '') // Keep only letters and spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare two names, also trying reversed order
 */
function compareName(txName: string, memberName: string): number {
  const a = normalize(txName);
  const b = normalize(memberName);
  const s1 = similarity(a, b);

  // Also try reversed name order (e.g., "Dupont Jean" vs "Jean Dupont")
  const parts = b.split(' ');
  if (parts.length >= 2) {
    const s2 = similarity(a, parts.reverse().join(' '));
    return Math.max(s1, s2);
  }
  return s1;
}

/**
 * Search for IBANs in transactions that match a member's name
 */
export async function searchIbansForMember(
  clubId: string,
  firstName: string,
  lastName: string
): Promise<IbanMatch[]> {
  const memberName = `${firstName} ${lastName}`;
  const normalizedMemberName = normalize(memberName);

  if (!normalizedMemberName) {
    return [];
  }

  // Load all transactions
  const txRef = collection(db, `clubs/${clubId}/transactions_bancaires`);
  const txSnap = await getDocs(txRef);

  // Group transactions by IBAN
  const ibanMap = new Map<string, {
    names: Set<string>;
    count: number;
    firstDate: Date | null;
    lastDate: Date | null;
  }>();

  txSnap.forEach(doc => {
    const data = doc.data();
    const iban = (data.contrepartie_iban || '').replace(/\s/g, '').toUpperCase();
    const nom = data.contrepartie_nom || '';

    // Only process valid IBANs
    if (iban && /^[A-Z]{2}\d{2}/.test(iban)) {
      if (!ibanMap.has(iban)) {
        ibanMap.set(iban, { names: new Set(), count: 0, firstDate: null, lastDate: null });
      }
      const entry = ibanMap.get(iban)!;
      if (nom) entry.names.add(nom);
      entry.count++;

      const txDate = data.date_execution?.toDate?.();
      if (txDate) {
        if (!entry.firstDate || txDate < entry.firstDate) entry.firstDate = txDate;
        if (!entry.lastDate || txDate > entry.lastDate) entry.lastDate = txDate;
      }
    }
  });

  // Find matches
  const matches: IbanMatch[] = [];

  for (const [iban, data] of ibanMap) {
    const names = Array.from(data.names);

    // Find best name match score
    let bestScore = 0;
    let bestName = names[0] || '';

    for (const name of names) {
      const score = compareName(name, memberName);
      if (score > bestScore) {
        bestScore = score;
        bestName = name;
      }
    }

    // Only include if score >= 50%
    if (bestScore >= 0.50) {
      matches.push({
        iban,
        contrepartieNom: bestName,
        transactionCount: data.count,
        firstSeen: data.firstDate,
        lastSeen: data.lastDate,
        score: Math.round(bestScore * 100)
      });
    }
  }

  // Sort by score descending, then by transaction count
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.transactionCount - a.transactionCount;
  });

  return matches;
}

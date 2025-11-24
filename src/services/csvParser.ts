import Papa from 'papaparse';
import { TransactionBancaire, BankFormat, CSVMapping } from '@/types';
import { generateTransactionHash, parseMontant, detecterCategorie } from '@/utils/utils';
import { parse, format } from 'date-fns';

// Configuration pour chaque format bancaire belge
const BANK_MAPPINGS: Record<BankFormat, CSVMapping> = {
  bnp: {
    bank: 'bnp',
    delimiter: ';',
    encoding: 'UTF-8',
    columns: {
      numero_sequence: 'Nº de séquence',
      date_execution: "Date d'exécution",
      date_valeur: 'Date valeur',
      montant: 'Montant',
      devise: 'Devise du compte',
      numero_compte: 'Numéro de compte',
      type_transaction: 'Type de transaction',
      contrepartie_iban: 'Contrepartie',
      contrepartie_nom: 'Nom de la contrepartie',
      communication: 'Communication',
      details: 'Détails',
      statut: 'Statut',
      motif_refus: 'Motif du refus'
    },
    date_format: 'dd/MM/yyyy',
    decimal_separator: ','
  },
  kbc: {
    bank: 'kbc',
    delimiter: ';',
    encoding: 'UTF-8',
    columns: {
      numero_sequence: 'Volgnummer',
      numero_compte: 'Rekeningnummer',
      date_execution: 'Datum',
      montant: 'Bedrag',
      devise: 'Munt',
      contrepartie_nom: 'Naam tegenpartij',
      contrepartie_iban: 'Rekening tegenpartij',
      communication: 'Omschrijving',
      type_transaction: 'Type verrichting'
    },
    date_format: 'dd/MM/yyyy',
    decimal_separator: ','
  },
  ing: {
    bank: 'ing',
    delimiter: ';',
    encoding: 'UTF-8',
    columns: {
      numero_sequence: 'Référence',
      date_execution: 'Date',
      contrepartie_nom: 'Nom / Description',
      numero_compte: 'Compte',
      contrepartie_iban: 'Contrepartie',
      montant: 'Montant',
      type_transaction: 'Type de transaction',
      communication: 'Communications'
    },
    date_format: 'dd/MM/yyyy',
    decimal_separator: ','
  },
  belfius: {
    bank: 'belfius',
    delimiter: ';',
    encoding: 'UTF-8',
    columns: {
      date_execution: 'Date de comptabilisation',
      numero_sequence: 'Numéro de transaction',
      numero_compte: 'Compte',
      type_transaction: 'Type de transaction',
      communication: 'Communication',
      montant: 'Montant',
      devise: 'Devise',
      date_valeur: 'Date valeur'
    },
    date_format: 'dd/MM/yyyy',
    decimal_separator: ','
  }
};

/**
 * Extraire le nom du commerçant depuis le champ "Détails" BNP
 * Pattern BNP pour paiements carte: "PAIEMENT AVEC LA CARTE DE DEBIT NUMERO XXXX ... [MERCHANT] [LOCATION] [DATE]"
 *
 * Exemples:
 * - "PAIEMENT AVEC LA CARTE DE DEBIT NUMERO 5255 65XX XXXX 8184 A.V.O.S. ANTWERPEN 17/08/2025..."
 *   → "A.V.O.S. ANTWERPEN"
 * - "PAIEMENT AVEC LA CARTE DE DEBIT NUMERO 5255 65XX XXXX 8184 CARREFOUR BRUXELLES 20/08/2025..."
 *   → "CARREFOUR BRUXELLES"
 */
export function extractMerchantNameFromDetails(details: string): string {
  if (!details || details.trim() === '') return '';

  // Pattern pour paiements par carte BNP
  // Chercher après "NUMERO XXXX XXXX" et avant la date (format DD/MM/YYYY)
  const cardPaymentMatch = details.match(/NUMERO\s+\d{4}\s+\d{2}[X\d]{2}\s+[X\d]{4}\s+\d{4}\s+(.+?)\s+\d{2}\/\d{2}\/\d{4}/i);

  if (cardPaymentMatch && cardPaymentMatch[1]) {
    const merchantName = cardPaymentMatch[1].trim();
    // Nettoyer les espaces multiples
    return merchantName.replace(/\s+/g, ' ');
  }

  // Pattern alternatif: chercher entre la fin du numéro de carte et "BANCONTACT" ou "REFERENCE"
  const altMatch = details.match(/\d{4}\s+(.+?)\s+(?:BANCONTACT|REFERENCE|MAESTRO)/i);
  if (altMatch && altMatch[1]) {
    const merchantName = altMatch[1].trim();
    return merchantName.replace(/\s+/g, ' ');
  }

  return '';
}

/**
 * Vérifier si un numéro de séquence BNP est incomplet
 * Format incomplet: "YYYY-" (ex: "2025-")
 * Format complet: "YYYY-XXXXX" (ex: "2025-00790")
 */
export function isIncompleteSequenceNumber(numeroSequence: string): boolean {
  return /^\d{4}-$/.test(numeroSequence);
}

// Détecter automatiquement le format bancaire
export function detectBankFormat(headers: string[]): BankFormat | null {
  // Nettoyer les headers
  const cleanHeaders = headers.map(h => h.trim());
  
  // Vérifier BNP (présence de "Nº de séquence")
  if (cleanHeaders.some(h => h.includes('Nº de séquence') || h.includes("Date d'exécution"))) {
    return 'bnp';
  }
  
  // Vérifier KBC (headers en néerlandais)
  if (cleanHeaders.some(h => h.includes('Rekeningnummer') || h.includes('Bedrag'))) {
    return 'kbc';
  }
  
  // Vérifier ING
  if (cleanHeaders.some(h => h === 'Date' && cleanHeaders.some(h2 => h2 === 'Communications'))) {
    return 'ing';
  }
  
  // Vérifier Belfius
  if (cleanHeaders.some(h => h.includes('Date de comptabilisation'))) {
    return 'belfius';
  }
  
  return null;
}

// Parser une date selon le format bancaire
function parseDate(dateStr: string, format: string): Date {
  try {
    // Nettoyer la chaîne de date
    const cleaned = dateStr.trim();
    if (!cleaned) return new Date();
    
    // Parser selon le format (dd/MM/yyyy pour les banques belges)
    const parts = cleaned.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Les mois sont 0-indexés
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    
    return new Date(cleaned);
  } catch (error) {
    console.error('Erreur parsing date:', dateStr, error);
    return new Date();
  }
}

// Parser le fichier CSV
export async function parseCSVFile(
  file: File,
  bankFormat?: BankFormat
): Promise<{ transactions: Partial<TransactionBancaire>[], errors: string[] }> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    const transactions: Partial<TransactionBancaire>[] = [];

    Papa.parse(file, {
      header: true,
      delimiter: ';', // Délimiteur standard pour les banques belges
      encoding: 'UTF-8',
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          errors.push(...results.errors.map(e => e.message));
        }

        // Détecter le format si non fourni
        const headers = results.meta.fields || [];
        const detectedFormat = bankFormat || detectBankFormat(headers);
        
        if (!detectedFormat) {
          errors.push('Format bancaire non reconnu. Veuillez vérifier le fichier CSV.');
          resolve({ transactions: [], errors });
          return;
        }

        const mapping = BANK_MAPPINGS[detectedFormat];
        
        // Parser chaque ligne
        results.data.forEach((row: any, index: number) => {
          try {
            const transaction = parseTransaction(row, mapping);
            if (transaction) {
              transactions.push(transaction);
            }
          } catch (error) {
            errors.push(`Ligne ${index + 2}: ${error}`);
          }
        });

        resolve({ transactions, errors });
      },
      error: (error) => {
        errors.push(`Erreur de lecture: ${error.message}`);
        resolve({ transactions: [], errors });
      }
    });
  });
}

// Parser une transaction individuelle
function parseTransaction(
  row: any,
  mapping: CSVMapping
): Partial<TransactionBancaire> | null {
  // Ignorer les lignes vides
  if (!row || Object.values(row).every(v => !v)) {
    return null;
  }

  const cols = mapping.columns;
  
  // Extraire les données selon le mapping
  const montantStr = row[cols.montant!] || '0';
  const montant = parseMontant(montantStr);
  
  // Ignorer les transactions à montant zéro
  if (montant === 0) {
    return null;
  }

  const dateExecution = cols.date_execution ? 
    parseDate(row[cols.date_execution], mapping.date_format) : new Date();
  
  const dateValeur = cols.date_valeur ? 
    parseDate(row[cols.date_valeur], mapping.date_format) : dateExecution;

  const communication = row[cols.communication!] || '';
  let contrepartieNom = row[cols.contrepartie_nom!] || '';
  const contrepartieIban = row[cols.contrepartie_iban!] || '';
  const details = row[cols.details!] || '';
  const numeroSequence = row[cols.numero_sequence!] || generateSequenceNumber(dateExecution);

  // SKIP: Ignorer les numéros de séquence incomplets (BNP uniquement)
  // Format incomplet: "YYYY-" (ex: "2025-")
  // Ces transactions seront disponibles après 1-2 jours avec le numéro complet
  if (mapping.bank === 'bnp' && isIncompleteSequenceNumber(numeroSequence)) {
    return null;  // Skip cette transaction
  }

  // ENRICHISSEMENT: Extraire le nom du commerçant depuis le champ "Détails" BNP
  // Si contrepartie_nom est vide ET details contient des informations
  if (mapping.bank === 'bnp' && !contrepartieNom && details) {
    const merchantName = extractMerchantNameFromDetails(details);
    if (merchantName) {
      contrepartieNom = merchantName;
    }
  }

  // Créer la transaction de base
  const transaction: Partial<TransactionBancaire> = {
    numero_sequence: numeroSequence,
    date_execution: dateExecution,
    date_valeur: dateValeur,
    montant: montant,
    devise: row[cols.devise!] || 'EUR',
    numero_compte: row[cols.numero_compte!] || '',
    type_transaction: row[cols.type_transaction!] || 'Virement',
    contrepartie_iban: contrepartieIban,
    contrepartie_nom: contrepartieNom,
    communication: communication,
    details: details,
    statut: 'accepte',
    reconcilie: false,
    created_at: new Date(),
    updated_at: new Date()
  };

  // NOTE: Auto-categorization is intentionally DISABLED during CSV import
  // CSV files do not contain category or accounting code information
  // These fields should remain empty for manual user input via the UI
  // The CategoryAccountSelector component will show suggestions when both fields are empty

  // HASH DE DEDUPLICATION
  // Pour BNP avec numéro complet: utiliser uniquement numero_sequence (garanti unique)
  // Cela permet d'enrichir contrepartie_nom sans changer le hash (pas de doublons)
  // Pour autres banques: utiliser l'ancien hash multi-champs
  if (mapping.bank === 'bnp' && /^\d{4}-\d+$/.test(numeroSequence)) {
    // Hash simplifié BNP: uniquement numero_sequence
    transaction.hash_dedup = generateTransactionHash({
      numero_sequence: numeroSequence,
      date_execution: dateExecution,
      montant: montant,
      contrepartie_nom: '',  // Vide pour stabilité du hash
      communication: ''      // Vide pour stabilité du hash
    });
  } else {
    // Hash classique (autres banques ou BNP avec numéro généré)
    transaction.hash_dedup = generateTransactionHash({
      numero_sequence: numeroSequence,
      date_execution: dateExecution,
      montant: montant,
      contrepartie_nom: contrepartieNom,
      communication: communication
    });
  }

  return transaction;
}

// Générer un numéro de séquence
function generateSequenceNumber(date: Date): string {
  const year = date.getFullYear();
  const timestamp = date.getTime();
  return `${year}-${timestamp}`;
}

// Exporter les transactions au format CSV
export function exportTransactionsToCSV(transactions: TransactionBancaire[]): string {
  const headers = [
    'Date',
    'Montant',
    'Contrepartie',
    'Communication',
    'Catégorie',
    'Réconcilié',
    'Événement'
  ];

  const rows = transactions.map(tx => [
    format(tx.date_execution, 'dd/MM/yyyy'),
    tx.montant.toString().replace('.', ','),
    tx.contrepartie_nom,
    tx.communication,
    tx.categorie || '',
    tx.reconcilie ? 'Oui' : 'Non',
    tx.evenement_id || ''
  ]);

  const csv = Papa.unparse({
    fields: headers,
    data: rows
  }, {
    delimiter: ';',
    header: true
  });

  // Ajouter le BOM pour Excel
  return '\ufeff' + csv;
}
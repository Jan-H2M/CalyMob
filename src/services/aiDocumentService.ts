import { Evenement, Membre, Categorie, TransactionBancaire } from '@/types';
import { extractSequenceFromFilename, findTransactionBySequence } from './transactionMatchingService';

/**
 * Extrait la date depuis le nom de fichier au format YYMMDD
 *
 * @param filename Nom du fichier (ex: "250317_facture.pdf")
 * @returns Date extraite ou null si pas de pattern trouvé
 *
 * @example
 * extractDateFromFilename("250317_facture.pdf") // 17 mars 2025
 * extractDateFromFilename("241225_recu.jpg")    // 25 décembre 2024
 */
export function extractDateFromFilename(filename: string): Date | null {
  // Pattern: YYMMDD (6 chiffres consécutifs)
  // Exemples: 250317 = 17/03/2025, 241225 = 25/12/2024
  const match = filename.match(/(\d{2})(\d{2})(\d{2})/);

  if (!match) {
    console.log(`ℹ️ Aucune date trouvée dans "${filename}"`);
    return null;
  }

  const [, yy, mm, dd] = match;
  const year = 2000 + parseInt(yy);
  const month = parseInt(mm) - 1; // JS months are 0-indexed
  const day = parseInt(dd);

  // Validation des valeurs
  if (month < 0 || month > 11) {
    console.log(`⚠️ Mois invalide dans "${filename}": ${parseInt(mm)}`);
    return null;
  }

  if (day < 1 || day > 31) {
    console.log(`⚠️ Jour invalide dans "${filename}": ${day}`);
    return null;
  }

  const date = new Date(year, month, day);

  // Vérifier que la date est valide (ex: 30 février n'existe pas)
  if (date.getMonth() !== month) {
    console.log(`⚠️ Date invalide dans "${filename}": ${day}/${parseInt(mm)}/${year}`);
    return null;
  }

  console.log(`✅ Date extraite du nom "${filename}": ${date.toLocaleDateString('fr-FR')}`);
  return date;
}

/**
 * Extrait la description depuis le nom de fichier
 * Format attendu : "XXXX - Description.ext"
 *
 * @param filename Nom du fichier (ex: "2025-00416 - 3Tilleuls piscine 25 01.pdf")
 * @returns Description extraite ou "xxxxx" si pas de pattern trouvé
 *
 * @example
 * extractDescriptionFromFilename("2025-00416 - 3Tilleuls piscine 25 01.pdf") // "3Tilleuls piscine 25 01"
 * extractDescriptionFromFilename("facture.pdf") // "xxxxx"
 */
export function extractDescriptionFromFilename(filename: string): string {
  // Enlever l'extension
  const nameWithoutExt = filename.replace(/\.(pdf|jpg|jpeg|png)$/i, '');

  // Chercher le tiret et prendre tout ce qui suit
  const dashIndex = nameWithoutExt.indexOf(' - ');

  if (dashIndex !== -1) {
    const description = nameWithoutExt.substring(dashIndex + 3).trim();
    if (description && description.length > 0) {
      console.log(`✅ Description extraite du nom "${filename}": "${description}"`);
      return description;
    }
  }

  // Fallback : pas de tiret trouvé ou rien après le tiret
  console.log(`⚠️ Aucune description trouvée dans "${filename}", utilisation de "xxxxx"`);
  return 'xxxxx';
}

export interface DocumentAnalysis {
  // Données extraites
  montant: number;
  date: Date;
  fournisseur: {
    nom: string;
    tva?: string;
    adresse?: string;
  };

  // Catégorisation
  categorie?: string;
  code_comptable?: string;

  // Détails
  description: string;
  commentaire?: string; // Commentaire manuel ajouté après l'analyse
  articles?: Array<{
    description: string;
    quantite: number;
    prix_unitaire: number;
    tva?: number;
  }>;

  // Liaison automatique avec transaction bancaire
  transaction_sequence?: string; // Numéro extrait du nom de fichier (ex: "2024-123")
  transaction_found?: boolean;   // Transaction trouvée automatiquement
  transaction_id?: string;        // ID de la transaction liée
  transaction?: TransactionBancaire; // Données complètes de la transaction

  // Métadonnées
  confiance: number; // Score 0-100
  suggestions: {
    demandeur?: string;
    evenement?: string;
    compte_comptable?: string;
    type_depense?: string;
  };

  // Données brutes
  texte_ocr?: string;
  langue_detectee?: string;

  // Statut
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  error?: string;
}

export interface AnalysisOptions {
  categories?: Categorie[];
  fournisseurs_frequents?: string[];
  evenements_recents?: Evenement[];
  membres?: Membre[];
  useAI?: boolean;
  userComment?: string; // Commentaire manuel de l'utilisateur
  clubId?: string; // ID du club pour le matching de transactions
}

class AIDocumentService {
  private apiKey: string | null = null;
  private apiProvider: 'openai' | 'anthropic' | 'mock' = 'mock';
  
  constructor() {
    // Get API key from environment or localStorage
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY || localStorage.getItem('ai_api_key') || null;
    const savedProvider = localStorage.getItem('ai_provider') as 'openai' | 'anthropic' | 'mock';

    // Set provider based on saved settings or default to mock if no API key
    if (this.apiKey && savedProvider) {
      this.apiProvider = savedProvider;
    } else if (!this.apiKey) {
      this.apiProvider = 'mock';
    } else {
      this.apiProvider = 'openai';
    }
  }
  
  /**
   * Analyser un document unique
   */
  async analyzeDocument(
    file: File,
    options: AnalysisOptions = {}
  ): Promise<DocumentAnalysis> {
    // Start with pending status
    const analysis: DocumentAnalysis = {
      montant: 0,
      date: new Date(),
      fournisseur: { nom: '' },
      description: '',
      confiance: 0,
      suggestions: {},
      status: 'analyzing'
    };

    try {
      // 🆕 ÉTAPE 1: Extraction automatique du numéro de séquence depuis le nom de fichier
      console.log(`📄 Analyse du fichier: "${file.name}"`);
      const sequence = extractSequenceFromFilename(file.name);

      if (sequence) {
        analysis.transaction_sequence = sequence;
        console.log(`✅ Numéro de séquence détecté: ${sequence}`);

        // 🆕 ÉTAPE 2: Recherche de la transaction correspondante
        if (options.clubId) {
          console.log(`🔍 Recherche de la transaction avec numero_sequence="${sequence}"`);
          const transaction = await findTransactionBySequence(sequence, options.clubId);

          if (transaction) {
            analysis.transaction_found = true;
            analysis.transaction_id = transaction.id;
            analysis.transaction = transaction;
            console.log(`✅ Transaction trouvée automatiquement! ID=${transaction.id}, Montant=${transaction.montant}€`);
          } else {
            analysis.transaction_found = false;
            console.log(`⚠️ Aucune transaction trouvée avec ce numéro de séquence`);
          }
        } else {
          console.warn(`⚠️ clubId non fourni, impossible de rechercher la transaction`);
        }
      } else {
        console.log(`ℹ️ Aucun numéro de séquence dans le nom du fichier`);
      }

      // ÉTAPE 3: Analyse IA du document (comme avant)
      // Si pas d'IA configurée, faire une extraction basique (non bloquante)
      if (this.apiProvider === 'mock' || !options.useAI) {
        console.log('💡 Mode extraction basique (sans IA)');

        // Extraire la date du nom de fichier
        const extractedDate = extractDateFromFilename(file.name);

        // Nom du fichier nettoyé comme fournisseur
        const cleanedName = file.name
          .replace(/\.(pdf|jpg|jpeg|png)$/i, '')
          .replace(/[_-]/g, ' ')
          .replace(/\d{6}/g, '') // Enlever la date YYMMDD
          .trim();

        const basicAnalysis: DocumentAnalysis = {
          ...analysis,
          date: extractedDate || new Date(),
          fournisseur: {
            nom: cleanedName || 'Fournisseur à identifier'
          },
          description: extractDescriptionFromFilename(file.name), // Utilise le nom de fichier
          montant: 0, // À remplir manuellement
          status: 'completed',
          confiance: 30 // Faible confiance car extraction basique
        };

        console.log('✅ Extraction basique terminée (sans appel IA)');
        return basicAnalysis;
      }

      // Convert PDF to image if needed
      let fileToAnalyze = file;
      if (file.type === 'application/pdf') {
        console.log('Converting PDF to image...');
        fileToAnalyze = await this.pdfToImage(file);
      }

      // Convert file to base64 for API
      const base64 = await this.fileToBase64(fileToAnalyze);

      // Call real AI API
      if (this.apiProvider === 'openai') {
        console.log('Calling OpenAI API for document analysis...');
        const aiResult = await this.analyzeWithOpenAI(base64, file.name, options);

        // 🆕 Fusionner les résultats AI avec les infos de transaction
        return {
          ...aiResult,
          transaction_sequence: analysis.transaction_sequence,
          transaction_found: analysis.transaction_found,
          transaction_id: analysis.transaction_id,
          transaction: analysis.transaction
        };
      }

      return {
        ...analysis,
        status: 'error',
        error: 'Provider IA non supporté'
      };

    } catch (error) {
      console.error('Document analysis error:', error);

      // Return error instead of mock data
      return {
        ...analysis,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erreur inconnue lors de l\'analyse'
      };
    }
  }
  
  /**
   * Analyser plusieurs documents en batch
   */
  async analyzeBatch(
    files: File[],
    options: AnalysisOptions = {}
  ): Promise<Map<string, DocumentAnalysis>> {
    const results = new Map<string, DocumentAnalysis>();
    
    // Process files in parallel with rate limiting
    const batchSize = 3; // Process 3 at a time
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const analyses = await Promise.all(
        batch.map(file => this.analyzeDocument(file, options))
      );
      
      batch.forEach((file, index) => {
        results.set(file.name, analyses[index]);
      });
      
      // Add delay between batches to avoid rate limits
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
  
  /**
   * Mock analysis pour développement/demo
   */
  private mockAnalysis(file: File): DocumentAnalysis {
    // Generate realistic mock data based on filename
    const fileName = file.name.toLowerCase();
    const isDecathlon = fileName.includes('decathlon');
    const isCarrefour = fileName.includes('carrefour');
    const isRestaurant = fileName.includes('restaurant') || fileName.includes('resto');
    
    const mockSuppliers = [
      { name: 'Decathlon Namur', category: 'materiel', tva: 'BE0475.341.234' },
      { name: 'Carrefour Market', category: 'alimentation', tva: 'BE0456.789.123' },
      { name: 'La Brasserie du Port', category: 'restaurant', tva: 'BE0412.345.678' },
      { name: 'Total Belgium', category: 'transport', tva: 'BE0403.123.456' },
      { name: 'Proximus', category: 'communication', tva: 'BE0202.239.951' }
    ];
    
    const supplier = isDecathlon ? mockSuppliers[0] :
                    isCarrefour ? mockSuppliers[1] :
                    isRestaurant ? mockSuppliers[2] :
                    mockSuppliers[Math.floor(Math.random() * mockSuppliers.length)];
    
    const amount = Math.floor(Math.random() * 20000) / 100 + 10; // 10-210€
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30)); // Last 30 days
    
    return {
      montant: amount,
      date: date,
      fournisseur: {
        nom: supplier.name,
        tva: supplier.tva,
        adresse: `${Math.floor(Math.random() * 100) + 1} Rue du Commerce, 5000 Namur`
      },
      categorie: supplier.category,
      description: extractDescriptionFromFilename(file.name), // Utilise le nom de fichier
      articles: [
        {
          description: supplier.category === 'materiel' ? 'Masque de plongée' :
                      supplier.category === 'alimentation' ? 'Boissons et snacks' :
                      supplier.category === 'restaurant' ? 'Repas équipe' :
                      'Article divers',
          quantite: 1,
          prix_unitaire: amount * 0.79, // Remove TVA
          tva: 21
        }
      ],
      confiance: 85 + Math.floor(Math.random() * 15), // 85-99%
      suggestions: {
        type_depense: supplier.category,
        evenement: Math.random() > 0.5 ? 'Sortie Zélande 2025' : undefined,
        demandeur: 'Jean Dupont'
      },
      texte_ocr: `FACTURE\n${supplier.name}\n${supplier.tva}\n\nMontant: ${amount.toFixed(2)} EUR\nDate: ${date.toLocaleDateString('fr-BE')}`,
      langue_detectee: 'fr',
      status: 'completed'
    };
  }
  
  /**
   * Analyse avec OpenAI GPT-4 Vision
   */
  private async analyzeWithOpenAI(
    base64Image: string,
    fileName: string,
    options: AnalysisOptions
  ): Promise<DocumentAnalysis> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildAnalysisPrompt(options, fileName);

    console.log('Making OpenAI API request via proxy...');

    // Call Vercel serverless function instead of direct OpenAI API
    const apiUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api/analyze-document'
      : '/api/analyze-document';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: base64Image,
        filename: fileName,
        prompt: prompt,
        apiKey: this.apiKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Proxy API error:', errorData);
      throw new Error(`API error: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    console.log('API response received:', result);

    if (!result.success || !result.data) {
      throw new Error('Invalid API response format');
    }

    const data = result.data;
    let content = data.choices[0].message.content;

    // Remove markdown code blocks if present (```json ... ```)
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      // Parse JSON response
      const parsed = JSON.parse(content);
      console.log('Parsed analysis:', parsed);
      return this.mapAPIResponseToAnalysis(parsed);
    } catch (error) {
      // Fallback if JSON parsing fails
      console.error('JSON parsing failed:', error, 'Content:', content);
      throw new Error('Failed to parse AI response');
    }
  }
  
  /**
   * Construire le prompt pour l'analyse
   */
  private buildAnalysisPrompt(options: AnalysisOptions, fileName?: string): string {
    const categories = options.categories?.map(c => c.nom).join(', ') || '';

    return `Analyse ce document (facture, ticket ou reçu) et extrais les informations en JSON strict.

IMPORTANT: Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après.

Contexte: Comptabilité d'un club de plongée belge.
${categories ? `Catégories disponibles: ${categories}` : ''}
${fileName ? `Nom du fichier (peut contenir des indices utiles): ${fileName}` : ''}
${options.userComment ? `Commentaire de l'utilisateur: ${options.userComment}` : ''}

Format JSON attendu:
{
  "montant_total": number,
  "montant_htva": number,
  "tva": { "taux": number, "montant": number },
  "date": "YYYY-MM-DD",
  "fournisseur": {
    "nom": string,
    "tva": string ou null,
    "adresse": string ou null
  },
  "articles": [
    {
      "description": string,
      "quantite": number,
      "prix_unitaire": number,
      "tva": number
    }
  ],
  "type_document": "facture" | "ticket" | "recu",
  "numero_document": string ou null,
  "categorie_suggeree": string,
  "confiance": number (0-100),
  "description": string (résumé en 1 phrase, UTILISE les informations du nom de fichier si pertinentes)
}

Règles:
- Les montants sont des nombres sans symboles (pas de €, $, etc.)
- La date au format ISO (YYYY-MM-DD)
- La confiance est un score de 0 à 100
- Si une information n'est pas visible, utilise null
- Utilise le nom du fichier pour enrichir la description et identifier le fournisseur/événement`;
  }
  
  /**
   * Mapper la réponse API vers notre format
   */
  private mapAPIResponseToAnalysis(apiResponse: any): DocumentAnalysis {
    return {
      montant: apiResponse.montant_total || 0,
      date: apiResponse.date ? new Date(apiResponse.date) : new Date(),
      fournisseur: {
        nom: apiResponse.fournisseur?.nom || 'Inconnu',
        tva: apiResponse.fournisseur?.tva || undefined,
        adresse: apiResponse.fournisseur?.adresse || undefined
      },
      categorie: apiResponse.categorie_suggeree,
      description: apiResponse.description || '',
      articles: apiResponse.articles || [],
      confiance: apiResponse.confiance || 50,
      suggestions: {
        type_depense: apiResponse.categorie_suggeree
      },
      status: 'completed'
    };
  }
  
  /**
   * Convertir un fichier en base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data:image/xxx;base64, prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  }

  /**
   * Convert PDF to image (first page)
   */
  private async pdfToImage(pdfFile: File): Promise<File> {
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker source - use local copy
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';

    // Load PDF
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Get first page
    const page = await pdf.getPage(1);

    // Set scale for good quality
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    // Convert canvas to blob then to File
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob'));
          return;
        }
        const imageFile = new File([blob], pdfFile.name.replace('.pdf', '.png'), {
          type: 'image/png'
        });
        resolve(imageFile);
      }, 'image/png', 0.95);
    });
  }
  
  /**
   * Configure API settings
   */
  setApiKey(key: string, provider: 'openai' | 'anthropic' = 'openai') {
    this.apiKey = key;
    this.apiProvider = provider;
    localStorage.setItem('ai_api_key', key);
    localStorage.setItem('ai_provider', provider);
  }
  
  /**
   * Check if AI is available
   */
  isAIAvailable(): boolean {
    return this.apiKey !== null && this.apiProvider !== 'mock';
  }
  
  /**
   * Get current configuration
   */
  getConfig() {
    return {
      hasApiKey: !!this.apiKey,
      provider: this.apiProvider,
      isConfigured: this.isAIAvailable()
    };
  }
}

export const aiDocumentService = new AIDocumentService();
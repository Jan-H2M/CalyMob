/**
 * Claude Report Templates
 *
 * Defines report templates that use Claude for document generation.
 * Each template specifies formats, prompts, and metadata.
 */

import { FinancialSummary } from '@/types';
import {
  buildExcelAnnualReportPrompt,
  buildPowerPointAGPrompt,
  buildSimpleExcelPrompt,
  buildMonthlyExcelPrompt,
  buildMonthlyWordPrompt
} from '@/prompts/claudeReportPrompts';
import { ClaudeDocumentFormat } from './claudeDocumentService';

export interface ClaudeReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  formats: ClaudeDocumentFormat[];
  estimatedCost: number; // in EUR
  estimatedTime: number; // in minutes
  requiresData: boolean;
  implemented: boolean; // Whether this template is fully implemented

  // Prompt builders
  buildExcelPrompt?: (data: FinancialSummary, clubName: string) => string;
  buildPowerPointPrompt?: (data: FinancialSummary, clubName: string) => string;
  buildPDFPrompt?: (data: FinancialSummary, clubName: string) => string;
  buildWordPrompt?: (data: FinancialSummary, clubName: string) => string;

  // Features
  includeCharts: boolean;
  includeInsights: boolean;
  includeForecasts: boolean;
}

/**
 * All available Claude report templates
 */
export const claudeReportTemplates: ClaudeReportTemplate[] = [
  {
    id: 'annual_report',
    name: 'Rapport Annuel Complet',
    description: 'Rapport financier complet avec 8 sheets Excel, présentation PowerPoint 15 slides, et PDF imprimable',
    icon: '📊',
    formats: ['excel', 'pptx', 'pdf'],
    estimatedCost: 0.30,
    estimatedTime: 5,
    requiresData: true,
    implemented: false, // TODO: Implement prompts and multi-format generation
    buildExcelPrompt: buildExcelAnnualReportPrompt,
    buildPowerPointPrompt: buildPowerPointAGPrompt,
    buildPDFPrompt: (data, clubName) => {
      // PDF uses same structure as Excel but formatted for print
      return `Crée un rapport PDF professionnel pour ${clubName} année ${data.period.fiscal_year}.

Structure:
1. Page de garde avec logo
2. Synthèse exécutive (1 page)
3. Chiffres clés (tableaux et graphiques)
4. Détails revenus et dépenses
5. Analyse événements
6. Annexes

Format: A4, printable, professional business style.
Données: Utiliser les mêmes données que l'Excel.`;
    },
    includeCharts: true,
    includeInsights: true,
    includeForecasts: true
  },

  {
    id: 'excel_only',
    name: 'Rapport Excel Détaillé',
    description: 'Fichier Excel complet avec 8 feuilles, formules, graphiques et analyse détaillée',
    icon: '📈',
    formats: ['excel'],
    estimatedCost: 0.20,
    estimatedTime: 3,
    requiresData: true,
    implemented: false, // TODO: Implement detailed Excel report
    buildExcelPrompt: buildExcelAnnualReportPrompt,
    includeCharts: true,
    includeInsights: true,
    includeForecasts: false
  },

  {
    id: 'powerpoint_ag',
    name: 'Présentation Assemblée Générale',
    description: 'PowerPoint 15 slides pour présentation AG, design professionnel, charts et KPIs',
    icon: '🎯',
    formats: ['pptx'],
    estimatedCost: 0.20,
    estimatedTime: 3,
    requiresData: true,
    implemented: false, // TODO: Implement PowerPoint generation
    buildPowerPointPrompt: buildPowerPointAGPrompt,
    includeCharts: true,
    includeInsights: true,
    includeForecasts: true
  },

  {
    id: 'quarterly_report',
    name: 'Rapport Trimestriel',
    description: 'Rapport simplifié pour un trimestre: Excel 5 sheets + PowerPoint 10 slides',
    icon: '📅',
    formats: ['excel', 'pptx'],
    estimatedCost: 0.18,
    estimatedTime: 4,
    requiresData: true,
    implemented: false, // TODO: Implement quarterly report
    buildExcelPrompt: (data, clubName) => {
      // Simplified version of annual report
      return `Crée un rapport Excel trimestriel pour ${clubName}.

Période: ${data.period.label}

5 Feuilles:
1. Dashboard (KPIs + 2 charts)
2. Revenus (table + pie chart)
3. Dépenses (table + bar chart)
4. Événements (liste + rentabilité)
5. Cash Flow (évolution)

Format belge, formules Excel fonctionnelles.`;
    },
    buildPowerPointPrompt: (data, clubName) => {
      return `Crée une présentation PowerPoint de 10 slides pour le trimestre ${data.period.label}.

Structure:
1. Titre
2. Chiffres clés (4 KPIs)
3. Revenus (pie chart)
4. Dépenses (bar chart)
5. Évolution (line chart)
6. Événements (top 5)
7. Cash flow
8. Points d'attention
9. Questions
10. Merci

Design professionnel, couleurs Calypso blue/aqua.`;
    },
    includeCharts: true,
    includeInsights: false,
    includeForecasts: false
  },

  {
    id: 'monthly_summary',
    name: 'Synthèse Mensuelle',
    description: 'Rapport mensuel rapide: Excel 3 sheets + Word document professionnel avec KPIs essentiels',
    icon: '📆',
    formats: ['excel', 'docx'],
    estimatedCost: 0.18,
    estimatedTime: 3,
    requiresData: true,
    implemented: true, // ✅ Ready to use - monthly summary with Excel + Word base64 output
    buildExcelPrompt: buildMonthlyExcelPrompt,
    buildWordPrompt: buildMonthlyWordPrompt,
    includeCharts: true,
    includeInsights: false,
    includeForecasts: false
  },

  {
    id: 'test_simple',
    name: 'Test Simple (Demo)',
    description: 'Fichier Excel simple pour tester la connexion Claude (gratuit)',
    icon: '🧪',
    formats: ['excel'],
    estimatedCost: 0.05,
    estimatedTime: 1,
    requiresData: false,
    implemented: true, // ✅ Ready to use - simple test file
    buildExcelPrompt: () => buildSimpleExcelPrompt(),
    includeCharts: false,
    includeInsights: false,
    includeForecasts: false
  }
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ClaudeReportTemplate | undefined {
  return claudeReportTemplates.find(t => t.id === id);
}

/**
 * Get templates by format
 */
export function getTemplatesByFormat(format: ClaudeDocumentFormat): ClaudeReportTemplate[] {
  return claudeReportTemplates.filter(t => t.formats.includes(format));
}

/**
 * Get templates sorted by cost (cheapest first)
 */
export function getTemplatesByCost(): ClaudeReportTemplate[] {
  return [...claudeReportTemplates].sort((a, b) => a.estimatedCost - b.estimatedCost);
}

/**
 * Calculate total cost for multiple templates
 */
export function calculateTotalCost(templateIds: string[]): number {
  return templateIds.reduce((total, id) => {
    const template = getTemplateById(id);
    return total + (template?.estimatedCost || 0);
  }, 0);
}

/**
 * Get recommended template for use case
 */
export function getRecommendedTemplate(useCase: 'ag' | 'annual' | 'quarterly' | 'monthly' | 'test'): ClaudeReportTemplate | undefined {
  switch (useCase) {
    case 'ag':
      return getTemplateById('powerpoint_ag');
    case 'annual':
      return getTemplateById('annual_report');
    case 'quarterly':
      return getTemplateById('quarterly_report');
    case 'monthly':
      return getTemplateById('monthly_summary');
    case 'test':
      return getTemplateById('test_simple');
    default:
      return getTemplateById('annual_report');
  }
}

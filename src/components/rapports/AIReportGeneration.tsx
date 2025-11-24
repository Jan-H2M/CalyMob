/**
 * AI Report Generation Component
 *
 * UI for generating reports with Claude AI.
 * Allows users to select templates, configure options, and download generated files.
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Download,
  Loader2,
  FileSpreadsheet,
  Presentation,
  FileText,
  CheckCircle,
  AlertCircle,
  Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { claudeReportTemplates, ClaudeReportTemplate } from '@/services/claudeReportTemplates';
import { claudeDocumentService, ClaudeGenerationProgress } from '@/services/claudeDocumentService';
import { ReportService } from '@/services/reportService';
import { aiProviderService } from '@/services/aiProviderService';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { saveAs } from 'file-saver';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export function AIReportGeneration() {
  const { user } = useAuth();
  const { selectedFiscalYear: selectedYear } = useFiscalYear();

  const [selectedTemplate, setSelectedTemplate] = useState<ClaudeReportTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ClaudeGenerationProgress | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<{
    excel?: Blob;
    pptx?: Blob;
    pdf?: Blob;
  } | null>(null);

  // Skills availability checker state
  const [isCheckingSkills, setIsCheckingSkills] = useState(false);
  const [skillsStatus, setSkillsStatus] = useState<{
    available: boolean;
    message: string;
    testedAt: Date;
  } | null>(null);

  const clubId = 'calypso'; // TODO: Get from context
  const clubName = 'Calypso Diving Club';

  // Check if Claude is configured
  const isClaudeAvailable = aiProviderService.isProviderAvailable('anthropic');

  // Load cached skills status from localStorage
  React.useEffect(() => {
    const cached = localStorage.getItem('claude_skills_status');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setSkillsStatus({
          ...parsed,
          testedAt: new Date(parsed.testedAt)
        });
      } catch (e) {
        console.error('Error parsing cached skills status:', e);
      }
    }
  }, []);

  /**
   * Handle report generation
   */
  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast.error('Veuillez sélectionner un template');
      return;
    }

    if (!isClaudeAvailable) {
      toast.error('Claude API non configurée. Allez dans Paramètres → IA pour ajouter votre clé API Anthropic.');
      return;
    }

    if (!selectedYear) {
      toast.error('Veuillez sélectionner une année fiscale');
      return;
    }

    setIsGenerating(true);
    setProgress({ step: 'Initialisation', percent: 0 });
    setGeneratedFiles(null);

    try {
      // 1. Collect data from reportService
      setProgress({ step: 'Collecte des données', percent: 10, message: 'Récupération des transactions...' });

      const period = ReportService.createPeriodFromFiscalYear(selectedYear);
      const financialSummary = await ReportService.generateFinancialSummary(clubId, period, selectedYear);

      setProgress({ step: 'Préparation prompts', percent: 20, message: 'Construction des prompts Claude...' });

      // 2. Build prompts using template
      const prompts: { excel?: string; pptx?: string; pdf?: string } = {};

      if (selectedTemplate.formats.includes('excel') && selectedTemplate.buildExcelPrompt) {
        prompts.excel = selectedTemplate.buildExcelPrompt(financialSummary, clubName);
      }

      if (selectedTemplate.formats.includes('pptx') && selectedTemplate.buildPowerPointPrompt) {
        prompts.pptx = selectedTemplate.buildPowerPointPrompt(financialSummary, clubName);
      }

      if (selectedTemplate.formats.includes('pdf') && selectedTemplate.buildPDFPrompt) {
        prompts.pdf = selectedTemplate.buildPDFPrompt(financialSummary, clubName);
      }

      // 3. Generate documents with Claude
      const result = await claudeDocumentService.generateMultiFormat(
        selectedTemplate.formats,
        prompts,
        {
          includeCharts: selectedTemplate.includeCharts,
          includeInsights: selectedTemplate.includeInsights,
          includeForecasts: selectedTemplate.includeForecasts,
          language: 'fr',
          clubName
        },
        (p) => setProgress(p)
      );

      if (!result.success) {
        throw new Error(result.error || 'Erreur lors de la génération');
      }

      setGeneratedFiles(result.files || null);
      toast.success('Rapports générés avec succès!');
    } catch (error) {
      console.error('Error generating reports:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erreur lors de la génération des rapports'
      );
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  /**
   * Check if Claude Skills API is available
   */
  const handleCheckSkills = async () => {
    if (!isClaudeAvailable) {
      toast.error('Claude API non configurée. Ajoutez votre clé API Anthropic dans les paramètres.');
      return;
    }

    setIsCheckingSkills(true);

    try {
      const result = await claudeDocumentService.checkSkillsAvailability();

      setSkillsStatus(result);

      // Cache result in localStorage
      localStorage.setItem('claude_skills_status', JSON.stringify(result));

      // Show toast feedback
      if (result.available) {
        toast.success(result.message, { duration: 5000 });
      } else if (result.error === 'SKILLS_NOT_AVAILABLE') {
        toast.error(result.message, { duration: 6000 });
      } else {
        toast.error(result.message, { duration: 4000 });
      }
    } catch (error) {
      console.error('Error checking skills:', error);
      toast.error('Erreur lors de la vérification des Skills');
    } finally {
      setIsCheckingSkills(false);
    }
  };

  /**
   * Download a single file
   */
  const handleDownload = (type: 'excel' | 'pptx' | 'pdf') => {
    if (!generatedFiles || !generatedFiles[type]) {
      toast.error('Fichier non disponible');
      return;
    }

    const extensions = {
      excel: 'xlsx',
      pptx: 'pptx',
      pdf: 'pdf'
    };

    const fileNames = {
      excel: `Rapport_${selectedYear?.year}_${selectedTemplate?.id}.xlsx`,
      pptx: `Presentation_${selectedYear?.year}_${selectedTemplate?.id}.pptx`,
      pdf: `Rapport_${selectedYear?.year}_${selectedTemplate?.id}.pdf`
    };

    saveAs(generatedFiles[type]!, fileNames[type]);
    toast.success(`${type.toUpperCase()} téléchargé`);
  };

  /**
   * Download all files as ZIP (future enhancement)
   */
  const handleDownloadAll = () => {
    if (!generatedFiles) return;

    // Download each file individually for now
    if (generatedFiles.excel) handleDownload('excel');
    if (generatedFiles.pptx) handleDownload('pptx');
    if (generatedFiles.pdf) handleDownload('pdf');

    toast.success('Tous les fichiers téléchargés');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8" />
          <div>
            <h2 className="text-2xl font-bold">Génération de Rapports avec IA</h2>
            <p className="text-purple-100 text-sm mt-1">
              Powered by Claude Sonnet 4.5 - Documents professionnels en quelques minutes
            </p>
          </div>
        </div>
      </div>

      {/* Claude Not Configured Warning */}
      {!isClaudeAvailable && (
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-orange-900 dark:text-orange-300">Claude API non configurée</p>
              <p className="text-sm text-orange-800 dark:text-orange-400 mt-1">
                Pour utiliser cette fonctionnalité, allez dans{' '}
                <a href="/parametres" className="underline font-medium">
                  Paramètres → Intelligence Artificielle
                </a>{' '}
                et ajoutez votre clé API Anthropic.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Skills Availability Checker */}
      {isClaudeAvailable && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                Claude Skills Status
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Vérifiez si les Skills API (Excel, PowerPoint, PDF) sont disponibles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleCheckSkills}
              disabled={isCheckingSkills}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingSkills ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vérification en cours...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Vérifier Skills
                </>
              )}
            </button>

            {skillsStatus && (
              <div className="flex items-center gap-3">
                {skillsStatus.available ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-lg">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Skills disponibles</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Pas encore disponibles</span>
                  </div>
                )}
                <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                  Vérifié {formatDistanceToNow(skillsStatus.testedAt, { locale: fr, addSuffix: true })}
                </span>
              </div>
            )}
          </div>

          {skillsStatus && !skillsStatus.available && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                💡 <strong>Pour activer Skills:</strong> Visitez{' '}
                <a
                  href="https://console.anthropic.com/settings/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-blue-700"
                >
                  console.anthropic.com/settings/billing
                </a>
                {' '}et upgradez vers un plan Pro, Team ou Enterprise.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Template Selection */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">
          Choisissez un Template
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {claudeReportTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => template.implemented && setSelectedTemplate(template)}
              disabled={isGenerating || !template.implemented}
              className={cn(
                'p-4 rounded-lg border-2 text-left transition-all relative',
                selectedTemplate?.id === template.id
                  ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-dark-border hover:border-purple-300',
                (isGenerating || !template.implemented) && 'opacity-50 cursor-not-allowed',
                !template.implemented && 'bg-gray-50 dark:bg-gray-800/50'
              )}
            >
              {/* Coming Soon Badge */}
              {!template.implemented && (
                <div className="absolute top-2 right-2 px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-medium rounded">
                  À venir
                </div>
              )}

              <div className="flex items-start gap-3">
                <span className="text-3xl">{template.icon}</span>
                <div className="flex-1">
                  <h4 className={cn(
                    "font-medium",
                    !template.implemented
                      ? "text-gray-500 dark:text-gray-400"
                      : "text-gray-900 dark:text-dark-text-primary"
                  )}>
                    {template.name}
                  </h4>
                  <p className={cn(
                    "text-xs mt-1",
                    !template.implemented
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-600 dark:text-dark-text-secondary"
                  )}>
                    {template.description}
                  </p>

                  {/* Formats */}
                  <div className="flex gap-2 mt-3">
                    {template.formats.includes('excel') && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                        <FileSpreadsheet className="h-3 w-3" />
                        Excel
                      </span>
                    )}
                    {template.formats.includes('pptx') && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                        <Presentation className="h-3 w-3" />
                        PPT
                      </span>
                    )}
                    {template.formats.includes('pdf') && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                        <FileText className="h-3 w-3" />
                        PDF
                      </span>
                    )}
                  </div>

                  {/* Cost & Time */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-dark-border">
                    <span className="text-sm font-medium text-purple-600">
                      ~€{template.estimatedCost.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                      {template.estimatedTime} min
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      {selectedTemplate && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">
                Template sélectionné: {selectedTemplate.name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Année fiscale: {selectedYear?.year || 'Non sélectionnée'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-600">
                €{selectedTemplate.estimatedCost.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                Coût estimé
              </p>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !isClaudeAvailable || !selectedYear}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Générer avec Claude
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress Bar */}
      {isGenerating && progress && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                {progress.step}
              </p>
              {progress.message && (
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  {progress.message}
                </p>
              )}
            </div>
            <span className="text-sm font-medium text-purple-600">
              {progress.percent}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-dark-bg-tertiary rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2 text-center">
            Temps estimé: {selectedTemplate?.estimatedTime} minutes
          </p>
        </div>
      )}

      {/* Download Section */}
      {generatedFiles && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <h4 className="font-medium text-green-900 dark:text-green-100">
                Rapports générés avec succès!
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Cliquez pour télécharger vos fichiers
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {generatedFiles.excel && (
              <button
                onClick={() => handleDownload('excel')}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    Excel
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Rapport_{selectedYear?.year}.xlsx
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}

            {generatedFiles.pptx && (
              <button
                onClick={() => handleDownload('pptx')}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <Presentation className="h-8 w-8 text-blue-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    PowerPoint
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Presentation_{selectedYear?.year}.pptx
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}

            {generatedFiles.pdf && (
              <button
                onClick={() => handleDownload('pdf')}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <FileText className="h-8 w-8 text-red-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    PDF
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Rapport_{selectedYear?.year}.pdf
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}
          </div>

          {(generatedFiles.excel || generatedFiles.pptx || generatedFiles.pdf) &&
            Object.values(generatedFiles).filter(Boolean).length > 1 && (
              <button
                onClick={handleDownloadAll}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="h-5 w-5" />
                Télécharger Tout
              </button>
            )}
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-2">Comment ça marche?</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Sélectionnez un template adapté à vos besoins</li>
              <li>Claude analyse vos données et génère des documents professionnels</li>
              <li>Les fichiers Excel contiennent des formules fonctionnelles</li>
              <li>Les présentations PowerPoint sont prêtes pour l'AG</li>
              <li>Génération en 2-5 minutes selon le template</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

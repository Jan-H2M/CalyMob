import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Calendar, FileSpreadsheet, Presentation, Sparkles, Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { FiscalYearService } from '@/services/fiscalYearService';
import { ReportService } from '@/services/reportService';
import { FiscalYear, ReportType, ReportPeriod, FinancialSummary, ReportMetadata, PDFReport, EventStatistics } from '@/types';
import { claudeReportTemplates, ClaudeReportTemplate } from '@/services/claudeReportTemplates';
import { claudeDocumentService, ClaudeGenerationProgress } from '@/services/claudeDocumentService';
import { aiProviderService } from '@/services/aiProviderService';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { saveAs } from 'file-saver';

// Import des templates PDF (gardés pour backward compatibility)
import { ReportPreview } from './ReportPreview';
import { PptxExportService } from '@/services/pptxExportService';
import { ExcelExportService } from '@/services/excelExportService';

// Ancien système gardé pour backward compatibility si besoin
// const REPORT_TYPES = [...] (supprimé - remplacé par claudeReportTemplates)

export function RapportsPage() {
  const { clubId, appUser } = useAuth();
  const navigate = useNavigate();

  // États pour la sélection
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ClaudeReportTemplate | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<ClaudeDocumentFormat[]>([]);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [periodType, setPeriodType] = useState<'year' | 'quarter' | 'month' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // Default to October (0-indexed, month 9 = October)

  // États pour la génération avec Claude Skills
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ClaudeGenerationProgress | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<{
    excel?: Blob;
    pptx?: Blob;
    pdf?: Blob;
    docx?: Blob;
  } | null>(null);

  // Check if Claude is configured
  const isClaudeAvailable = aiProviderService.isProviderAvailable('anthropic');

  // Charger les années fiscales au montage
  useEffect(() => {
    loadFiscalYears();
  }, [clubId]);

  // Initialiser les formats sélectionnés quand le template change
  useEffect(() => {
    if (selectedTemplate) {
      // Ne sélectionner aucun format par défaut - l'utilisateur doit choisir
      setSelectedFormats([]);
    } else {
      setSelectedFormats([]);
    }
  }, [selectedTemplate]);

  const loadFiscalYears = async () => {
    try {
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);

      // Sélectionner l'année fiscale courante par défaut
      const currentYear = await FiscalYearService.getCurrentFiscalYear(clubId);
      if (currentYear) {
        setSelectedFiscalYear(currentYear);
      } else if (years.length > 0) {
        setSelectedFiscalYear(years[0]);
      }
    } catch (error) {
      console.error('Erreur chargement années fiscales:', error);
      toast.error('Erreur lors du chargement des années fiscales');
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedTemplate) {
      toast.error('Veuillez sélectionner un template');
      return;
    }

    if (!isClaudeAvailable) {
      toast.error('Claude API non configurée. Allez dans Paramètres → IA pour ajouter votre clé API Anthropic.');
      return;
    }

    if (!selectedFiscalYear) {
      toast.error('Veuillez sélectionner une année fiscale');
      return;
    }

    setIsGenerating(true);
    setProgress({ step: 'Initialisation', percent: 0 });
    setGeneratedFiles(null);

    try {
      // 1. Créer la période
      let period: ReportPeriod;
      if (periodType === 'custom') {
        if (!customStartDate || !customEndDate) {
          toast.error('Veuillez sélectionner une période personnalisée');
          setIsGenerating(false);
          return;
        }
        period = ReportService.createCustomPeriod(
          new Date(customStartDate),
          new Date(customEndDate),
          selectedFiscalYear.year
        );
      } else if (periodType === 'month') {
        // For monthly reports, use selected month of the selected fiscal year
        const fiscalYear = selectedFiscalYear.year;
        const targetDate = new Date(fiscalYear, selectedMonth, 1);
        const monthStart = startOfMonth(targetDate);
        const monthEnd = endOfMonth(targetDate);

        period = {
          start_date: monthStart,
          end_date: monthEnd,
          fiscal_year: selectedFiscalYear.year,
          label: `${format(targetDate, 'MMMM yyyy', { locale: fr })}`,
          type: 'month'
        };
      } else {
        period = ReportService.createPeriodFromFiscalYear(selectedFiscalYear, periodType);
      }

      // 2. Collect data from reportService
      setProgress({ step: 'Collecte des données', percent: 10, message: 'Récupération des transactions...' });
      const financialSummary = await ReportService.generateFinancialSummary(clubId, period, selectedFiscalYear);

      // 🔴 VALIDATION: Check if we have data before generating
      if (financialSummary.transaction_count === 0) {
        toast.error('Aucune transaction trouvée pour cette période. Impossible de générer un rapport.', {
          duration: 5000
        });
        setIsGenerating(false);
        setProgress(null);
        return;
      }

      setProgress({ step: 'Préparation prompts', percent: 20, message: 'Construction des prompts Claude...' });

      // 3. Build prompts using template (only for selected formats)
      const prompts: { excel?: string; pptx?: string; pdf?: string; docx?: string } = {};
      const clubName = 'Calypso Diving Club';

      if (selectedFormats.includes('excel') && selectedTemplate.buildExcelPrompt) {
        prompts.excel = selectedTemplate.buildExcelPrompt(financialSummary, clubName);
      }

      if (selectedFormats.includes('pptx') && selectedTemplate.buildPowerPointPrompt) {
        prompts.pptx = selectedTemplate.buildPowerPointPrompt(financialSummary, clubName);
      }

      if (selectedFormats.includes('pdf') && selectedTemplate.buildPDFPrompt) {
        prompts.pdf = selectedTemplate.buildPDFPrompt(financialSummary, clubName);
      }

      if (selectedFormats.includes('docx') && selectedTemplate.buildWordPrompt) {
        prompts.docx = selectedTemplate.buildWordPrompt(financialSummary, clubName);
      }

      // 4. Generate documents with Claude (only selected formats)
      const result = await claudeDocumentService.generateMultiFormat(
        selectedFormats,
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header avec badge AI */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 text-white mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Génération de Rapports avec IA</h1>
            <p className="text-purple-100 text-sm mt-1">
              Powered by Claude Sonnet 4.5 - Documents professionnels en quelques minutes
            </p>
          </div>
        </div>
      </div>

      {/* Claude Not Configured Warning */}
      {!isClaudeAvailable && (
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg mb-6">
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

      {/* Sélection de l'année fiscale */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Période du rapport
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sélecteur année fiscale */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Année fiscale
            </label>
            <select
              value={selectedFiscalYear?.id || ''}
              onChange={(e) => {
                const year = fiscalYears.find(y => y.id === e.target.value);
                setSelectedFiscalYear(year || null);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Sélectionner une année</option>
              {fiscalYears.map(year => (
                <option key={year.id} value={year.id}>
                  {year.year} ({format(year.start_date, 'dd/MM/yyyy')} - {format(year.end_date, 'dd/MM/yyyy')})
                  {year.status === 'open' && ' - En cours'}
                </option>
              ))}
            </select>
          </div>

          {/* Sélecteur type de période */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Type de période
            </label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="year">Année complète</option>
              <option value="quarter">Trimestre</option>
              <option value="month">Mois</option>
              <option value="custom">Période personnalisée</option>
            </select>
          </div>

          {/* Month selector (if month type selected) */}
          {periodType === 'month' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Mois
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="0">Janvier</option>
                <option value="1">Février</option>
                <option value="2">Mars</option>
                <option value="3">Avril</option>
                <option value="4">Mai</option>
                <option value="5">Juin</option>
                <option value="6">Juillet</option>
                <option value="7">Août</option>
                <option value="8">Septembre</option>
                <option value="9">Octobre</option>
                <option value="10">Novembre</option>
                <option value="11">Décembre</option>
              </select>
            </div>
          )}

          {/* Dates personnalisées (si sélectionné) */}
          {periodType === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Date de début
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Date de fin
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sélection du template de rapport */}
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
                    {template.formats.includes('docx') && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                        <FileText className="h-3 w-3" />
                        Word
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
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">
                Template sélectionné: {selectedTemplate.name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Année fiscale: {selectedFiscalYear?.year || 'Non sélectionnée'}
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

          {/* Format Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Formats à générer
            </label>
            <div className="flex flex-wrap gap-3">
              {selectedTemplate.formats.includes('excel') && (
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedFormats.includes('excel')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFormats([...selectedFormats, 'excel']);
                      } else {
                        setSelectedFormats(selectedFormats.filter(f => f !== 'excel'));
                      }
                    }}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">Excel</span>
                </label>
              )}

              {selectedTemplate.formats.includes('docx') && (
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedFormats.includes('docx')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFormats([...selectedFormats, 'docx']);
                      } else {
                        setSelectedFormats(selectedFormats.filter(f => f !== 'docx'));
                      }
                    }}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <FileText className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">Word</span>
                </label>
              )}

              {selectedTemplate.formats.includes('pptx') && (
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedFormats.includes('pptx')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFormats([...selectedFormats, 'pptx']);
                      } else {
                        setSelectedFormats(selectedFormats.filter(f => f !== 'pptx'));
                      }
                    }}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <Presentation className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">PowerPoint</span>
                </label>
              )}

              {selectedTemplate.formats.includes('pdf') && (
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedFormats.includes('pdf')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFormats([...selectedFormats, 'pdf']);
                      } else {
                        setSelectedFormats(selectedFormats.filter(f => f !== 'pdf'));
                      }
                    }}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <FileText className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">PDF</span>
                </label>
              )}
            </div>
          </div>

          <button
            onClick={handleGenerateReport}
            disabled={isGenerating || !isClaudeAvailable || !selectedFiscalYear || selectedFormats.length === 0}
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
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6 mt-6">
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
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 p-6 mt-6">
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
                onClick={() => {
                  saveAs(generatedFiles.excel!, `Rapport_${selectedFiscalYear?.year}_${selectedTemplate?.id}.xlsx`);
                  toast.success('Excel téléchargé');
                }}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    Excel
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Rapport_{selectedFiscalYear?.year}.xlsx
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}

            {generatedFiles.pptx && (
              <button
                onClick={() => {
                  saveAs(generatedFiles.pptx!, `Presentation_${selectedFiscalYear?.year}_${selectedTemplate?.id}.pptx`);
                  toast.success('PowerPoint téléchargé');
                }}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <Presentation className="h-8 w-8 text-blue-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    PowerPoint
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Presentation_{selectedFiscalYear?.year}.pptx
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}

            {generatedFiles.pdf && (
              <button
                onClick={() => {
                  saveAs(generatedFiles.pdf!, `Rapport_${selectedFiscalYear?.year}_${selectedTemplate?.id}.pdf`);
                  toast.success('PDF téléchargé');
                }}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <FileText className="h-8 w-8 text-red-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    PDF
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Rapport_{selectedFiscalYear?.year}.pdf
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}

            {generatedFiles.docx && (
              <button
                onClick={() => {
                  saveAs(generatedFiles.docx!, `Rapport_${selectedFiscalYear?.year}_${selectedTemplate?.id}.docx`);
                  toast.success('Word téléchargé');
                }}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 transition-colors"
              >
                <FileText className="h-8 w-8 text-purple-600" />
                <div className="text-left flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    Word
                  </p>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Rapport_{selectedFiscalYear?.year}.docx
                  </p>
                </div>
                <Download className="h-5 w-5 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

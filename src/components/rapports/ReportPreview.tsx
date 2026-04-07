import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, Presentation } from 'lucide-react';
import { PDFReport } from '@/types';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { logger } from '@/utils/logger';

// Import des templates
import { SyntheseReport } from './templates/SyntheseReport';
import { CategoryReport } from './templates/CategoryReport';
import { AccountCodeReport } from './templates/AccountCodeReport';
import { ActivityReport } from './templates/ActivityReport';
import { TreasuryReport } from './templates/TreasuryReport';
import { EventReportPDF } from './templates/EventReportPDF';
import { EventStatistics } from '@/types';
import { ExcelExportService } from '@/services/excelExportService';
import { PptxExportService } from '@/services/pptxExportService';

interface Props {
  report: PDFReport;
  onClose: () => void;
}

export function ReportPreview({ report, onClose }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // URL absolue du logo
  const logoUrl = `${window.location.origin}/logo-vertical.png`;

  // Sélectionner le bon template en fonction du type
  const getReportComponent = () => {
    switch (report.metadata.type) {
      case 'synthese':
        return <SyntheseReport report={report} logoUrl={logoUrl} />;
      case 'category':
        return <CategoryReport report={report} />;
      case 'account_code':
        return <AccountCodeReport report={report} />;
      case 'activity':
        return <ActivityReport report={report} />;
      case 'treasury':
        return <TreasuryReport report={report} />;
      case 'events':
        return <EventReportPDF
          data={report.data as unknown as EventStatistics}
          clubName={report.metadata.club_name}
          generatedAt={report.metadata.generated_at}
          generatedBy={report.metadata.generated_by_name}
        />;
      default:
        return <SyntheseReport report={report} logoUrl={logoUrl} />;
    }
  };

  // Générer le nom de fichier
  const getFileName = (): string => {
    const typeNames: Record<typeof report.metadata.type, string> = {
      synthese: 'Synthese_Financiere',
      category: 'Rapport_Categories',
      account_code: 'Plan_Comptable_Belge',
      activity: 'Rapport_Activites',
      treasury: 'Rapport_Tresorerie',
      events: 'Rapport_Evenements'
    };

    const typeName = typeNames[report.metadata.type];
    const year = report.metadata.fiscal_year;
    const date = format(report.metadata.generated_at, 'yyyyMMdd');

    return `${typeName}_${year}_${date}.pdf`;
  };

  // Télécharger le PDF
  const handleDownload = async () => {
    setIsDownloading(true);

    try {
      logger.debug('📥 Génération du PDF pour téléchargement...');

      // Générer le blob PDF depuis le composant React-PDF
      const component = getReportComponent();
      const blob = await pdf(component).toBlob();

      // Télécharger via file-saver
      const fileName = getFileName();
      saveAs(blob, fileName);

      toast.success(`Rapport téléchargé: ${fileName}`);
    } catch (error) {
      logger.error('Erreur téléchargement PDF:', error);
      toast.error('Erreur lors du téléchargement du rapport');
    } finally {
      setIsDownloading(false);
    }
  };

  // Télécharger en Excel (pour rapport événements)
  const handleDownloadExcel = async () => {
    setIsDownloading(true);

    try {
      logger.debug('📥 Génération du fichier Excel pour téléchargement...');

      // Exporter via ExcelExportService
      await ExcelExportService.exportEventReport(
        report.data as unknown as EventStatistics,
        report.metadata
      );

      toast.success('Rapport Excel téléchargé avec succès !');
    } catch (error) {
      logger.error('Erreur téléchargement Excel:', error);
      toast.error('Erreur lors du téléchargement du rapport');
    } finally {
      setIsDownloading(false);
    }
  };

  // Télécharger en PowerPoint (pour rapport événements)
  const handleDownloadPowerPoint = async () => {
    setIsDownloading(true);

    try {
      logger.debug('📊 Génération du fichier PowerPoint pour téléchargement...');

      // Exporter via PptxExportService
      await PptxExportService.exportEventReport(
        report.data as unknown as EventStatistics,
        report.metadata
      );

      toast.success('Rapport PowerPoint téléchargé avec succès !');
    } catch (error) {
      logger.error('Erreur téléchargement PowerPoint:', error);
      toast.error('Erreur lors du téléchargement du rapport');
    } finally {
      setIsDownloading(false);
    }
  };

  // Générer l'URL pour la prévisualisation
  const generatePreviewUrl = async () => {
    setIsGeneratingPreview(true);

    try {
      logger.debug('🔍 Génération de la prévisualisation PDF...');

      const component = getReportComponent();
      const blob = await pdf(component).toBlob();

      // Créer une URL temporaire pour affichage
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      logger.error('Erreur génération prévisualisation:', error);
      toast.error('Erreur lors de la génération de la prévisualisation');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Générer la prévisualisation au montage
  React.useEffect(() => {
    generatePreviewUrl();

    // Nettoyer l'URL au démontage
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              Prévisualisation du Rapport
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              {report.metadata.period.label} - Généré le{' '}
              {format(report.metadata.generated_at, 'dd/MM/yyyy à HH:mm')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Boutons PowerPoint + Excel pour rapport événements, PDF pour les autres */}
            {report.metadata.type === 'events' ? (
              <>
                <button
                  onClick={handleDownloadPowerPoint}
                  disabled={isDownloading}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDownloading ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Presentation className="h-5 w-5" />
                      PowerPoint
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={isDownloading}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDownloading ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-5 w-5" />
                      Excel
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDownloading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Téléchargement...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Télécharger PDF
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Contenu - Prévisualisation PDF */}
        <div className="flex-1 overflow-hidden p-6">
          {isGeneratingPreview ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-600 dark:text-dark-text-secondary">Génération de la prévisualisation...</p>
              </div>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border border-gray-200 dark:border-dark-border rounded-lg"
              title="Prévisualisation du rapport PDF"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 dark:text-dark-text-secondary">Impossible de charger la prévisualisation</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-dark-text-secondary">
            <div>
              <span className="font-semibold">Type:</span>{' '}
              {report.metadata.type === 'synthese' && 'Synthèse Financière'}
              {report.metadata.type === 'category' && 'Rapport par Catégorie'}
              {report.metadata.type === 'account_code' && 'Plan Comptable Belge'}
              {report.metadata.type === 'activity' && 'Rapport d\'Activités'}
              {report.metadata.type === 'treasury' && 'Rapport de Trésorerie'}
              {report.metadata.type === 'events' && 'Rapport d\'Événements'}
            </div>
            {report.metadata.type === 'events' ? (
              // Footer pour rapport d'événements
              <>
                <div>
                  <span className="font-semibold">Événements:</span>{' '}
                  {(report.data as unknown as EventStatistics).total_events}
                  {' | '}
                  <span className="font-semibold">Inscriptions:</span>{' '}
                  {(report.data as unknown as EventStatistics).total_registrations}
                </div>
                <div>
                  <span className="font-semibold">Taux paiement:</span>{' '}
                  {(report.data as unknown as EventStatistics).payment_rate.toFixed(1)}%
                </div>
              </>
            ) : (
              // Footer pour rapports financiers
              <>
                <div>
                  <span className="font-semibold">Transactions:</span> {(report.data as any).transaction_count}
                  {' | '}
                  <span className="font-semibold">Événements:</span> {(report.data as any).events?.length || 0}
                </div>
                <div>
                  <span className="font-semibold">Réconciliation:</span>{' '}
                  {(report.data as any).reconciliation_rate?.toFixed(1) || 0}%
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

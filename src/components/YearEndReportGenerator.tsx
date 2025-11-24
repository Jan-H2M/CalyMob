import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  FileSpreadsheet, 
  Calendar, 
  AlertCircle, 
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  BarChart3
} from 'lucide-react';
import { functions, db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReportSummary {
  total_revenue: number;
  total_expenses: number;
  net_result: number;
  transaction_count: number;
  account_count: number;
}

interface GeneratedReport {
  id: string;
  type: string;
  fiscal_year: number;
  generated_at: Date;
  generated_by: string;
  file_url: string;
  metadata: ReportSummary;
  status: string;
}

export function YearEndReportGenerator({ clubId }: { clubId: string }) {
  const [currentYear] = useState(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previousReports, setPreviousReports] = useState<GeneratedReport[]>([]);
  const [yearSummary, setYearSummary] = useState<ReportSummary | null>(null);
  const [fiscalYearStatus, setFiscalYearStatus] = useState<'open' | 'closed' | 'not_started'>('open');

  useEffect(() => {
    loadPreviousReports();
    loadYearSummary();
    checkFiscalYearStatus();
  }, [selectedYear]);

  const loadPreviousReports = async () => {
    try {
      const reportsQuery = query(
        collection(db, `clubs/${clubId}/generated_reports`),
        where('fiscal_year', '==', selectedYear),
        orderBy('generated_at', 'desc')
      );
      
      const snapshot = await getDocs(reportsQuery);
      const reports: GeneratedReport[] = [];
      
      snapshot.forEach(doc => {
        reports.push({
          id: doc.id,
          ...doc.data(),
          generated_at: doc.data().generated_at?.toDate()
        } as GeneratedReport);
      });
      
      setPreviousReports(reports);
    } catch (err) {
      console.error('Error loading reports:', err);
    }
  };

  const loadYearSummary = async () => {
    try {
      // Load cached P&L data for quick summary
      const pnlCache = await getDoc(doc(db, `clubs/${clubId}/report_cache/${selectedYear}_pnl`));
      
      if (pnlCache.exists()) {
        const data = pnlCache.data();
        setYearSummary({
          total_revenue: data.data?.summary?.total_revenue || 0,
          total_expenses: data.data?.summary?.total_expenses || 0,
          net_result: data.data?.summary?.net_result || 0,
          transaction_count: 0,
          account_count: 0
        });
      }
    } catch (err) {
      console.error('Error loading year summary:', err);
    }
  };

  const checkFiscalYearStatus = async () => {
    try {
      const fiscalYearDoc = await getDoc(doc(db, `clubs/${clubId}/fiscal_years/${selectedYear}`));
      
      if (fiscalYearDoc.exists()) {
        setFiscalYearStatus(fiscalYearDoc.data().status || 'open');
      } else {
        setFiscalYearStatus('not_started');
      }
    } catch (err) {
      console.error('Error checking fiscal year status:', err);
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      // Step 1: Generate General Ledger (20%)
      setProgress(20);
      const generateGL = httpsCallable(functions, 'generateGeneralLedger');
      await generateGL({ club_id: clubId, fiscal_year: selectedYear });

      // Step 2: Generate P&L (40%)
      setProgress(40);
      const generatePnL = httpsCallable(functions, 'generateProfitAndLoss');
      await generatePnL({ club_id: clubId, fiscal_year: selectedYear });

      // Step 3: Generate Balance Sheet (60%)
      setProgress(60);
      const generateBS = httpsCallable(functions, 'generateBalanceSheet');
      await generateBS({ club_id: clubId, fiscal_year: selectedYear });

      // Step 4: Generate Excel file (80%)
      setProgress(80);
      const generateExcel = httpsCallable(functions, 'generateYearEndExcel');
      const result = await generateExcel({ club_id: clubId, fiscal_year: selectedYear }) as any;

      // Step 5: Complete (100%)
      setProgress(100);
      
      if (result.data.success) {
        setSuccess(`Rapport généré avec succès! Le téléchargement va commencer...`);
        
        // Download the file
        window.open(result.data.download_url, '_blank');
        
        // Reload reports list
        await loadPreviousReports();
        await loadYearSummary();
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la génération du rapport');
      console.error('Error generating report:', err);
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  const downloadReport = (url: string) => {
    window.open(url, '_blank');
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Year Selector and Status */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Génération du Rapport Annuel
              </CardTitle>
              <CardDescription>
                Générer le rapport Excel complet pour l'année comptable
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-2 border rounded-md"
                disabled={generating}
              >
                {[currentYear, currentYear - 1, currentYear - 2].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <Badge variant={
                fiscalYearStatus === 'closed' ? 'secondary' :
                fiscalYearStatus === 'open' ? 'default' : 'outline'
              }>
                {fiscalYearStatus === 'closed' ? 'Clôturé' :
                 fiscalYearStatus === 'open' ? 'En cours' : 'Non démarré'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Year Summary */}
          {yearSummary && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Revenus</span>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-xl font-semibold text-green-600">
                  {formatAmount(yearSummary.total_revenue)}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Dépenses</span>
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </div>
                <p className="text-xl font-semibold text-red-600">
                  {formatAmount(yearSummary.total_expenses)}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Résultat Net</span>
                  <DollarSign className="h-4 w-4" />
                </div>
                <p className={`text-xl font-semibold ${
                  yearSummary.net_result >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatAmount(yearSummary.net_result)}
                </p>
              </div>
            </div>
          )}

          {/* Generate Button and Progress */}
          <div className="space-y-4">
            {generating && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary text-center">
                  {progress < 20 && 'Préparation...'}
                  {progress >= 20 && progress < 40 && 'Génération du Grand Livre...'}
                  {progress >= 40 && progress < 60 && 'Calcul du Compte de Résultats...'}
                  {progress >= 60 && progress < 80 && 'Création du Bilan...'}
                  {progress >= 80 && progress < 100 && 'Génération du fichier Excel...'}
                  {progress === 100 && 'Finalisation...'}
                </p>
              </div>
            )}

            <Button
              onClick={generateReport}
              disabled={generating || fiscalYearStatus === 'not_started'}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Générer le Rapport Comptable {selectedYear}
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Previous Reports */}
      {previousReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Rapports Générés
            </CardTitle>
            <CardDescription>
              Historique des rapports générés pour {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {previousReports.map(report => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary"
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="font-medium">
                        Rapport {report.fiscal_year}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                        Généré le {format(report.generated_at, 'dd MMMM yyyy à HH:mm', { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={report.status === 'final' ? 'default' : 'secondary'}>
                      {report.status === 'final' ? 'Final' : 'Brouillon'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadReport(report.file_url)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Télécharger
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Contents Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Contenu du Rapport
          </CardTitle>
          <CardDescription>
            Le rapport Excel généré contiendra les feuilles suivantes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Comptabilité</h4>
              <ul className="space-y-1 text-sm text-gray-600 dark:text-dark-text-secondary">
                <li>✓ Bilan (BS)</li>
                <li>✓ Compte de Résultats (P&L)</li>
                <li>✓ P&L Mensuel</li>
                <li>✓ Grand Livre (GL)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Données de Support</h4>
              <ul className="space-y-1 text-sm text-gray-600 dark:text-dark-text-secondary">
                <li>✓ Validation des Comptes</li>
                <li>✓ Balance Bancaire</li>
                <li>✓ Liste des Membres</li>
                <li>✓ Budget vs Réel</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
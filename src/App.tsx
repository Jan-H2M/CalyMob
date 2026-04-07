import { useEffect, useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { User } from 'firebase/auth';
import { onAuthChange } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';

// Core components (always needed, not lazy-loaded)
import { Layout } from '@/components/commun/Layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageLoader } from '@/components/commun/PageLoader';

// Contexts
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { FiscalYearProvider } from '@/contexts/FiscalYearContext';

// Error Boundary
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// ============================================
// LAZY-LOADED PAGE COMPONENTS (58 total)
// ============================================

// Auth pages
const LoginForm = lazy(() => import('@/components/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const ChangePasswordForm = lazy(() => import('@/components/auth/ChangePasswordForm').then(m => ({ default: m.ChangePasswordForm })));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));

// Public landing pages
const LandingPage = lazy(() => import('@/pages/LandingPage').then(m => ({ default: m.LandingPage })));
const FAQPage = lazy(() => import('@/pages/FAQPage').then(m => ({ default: m.FAQPage })));
const DocsPage = lazy(() => import('@/pages/DocsPage').then(m => ({ default: m.DocsPage })));
const CalyMobDocs = lazy(() => import('@/pages/docs/CalyMobDocs').then(m => ({ default: m.CalyMobDocs })));
const CalyComptaDocs = lazy(() => import('@/pages/docs/CalyComptaDocs').then(m => ({ default: m.CalyComptaDocs })));
const SupportPage = lazy(() => import('@/pages/SupportPage').then(m => ({ default: m.SupportPage })));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));

// Main app pages
const AccueilPage = lazy(() => import('@/components/accueil/AccueilPage').then(m => ({ default: m.AccueilPage })));
const TableauBord = lazy(() => import('@/components/tableau-bord/TableauBord').then(m => ({ default: m.TableauBord })));
const TransactionsPage = lazy(() => import('@/components/banque/TransactionsPage').then(m => ({ default: m.TransactionsPage })));
const OperationsPage = lazy(() => import('@/components/operations/OperationsPage').then(m => ({ default: m.OperationsPage })));
const DemandesPage = lazy(() => import('@/components/depenses/DemandesPage').then(m => ({ default: m.DemandesPage })));
const MembresPage = lazy(() => import('@/components/membres/MembresPage').then(m => ({ default: m.MembresPage })));
const PiscinePlanningPage = lazy(() => import('@/components/piscine/PiscinePlanningPage').then(m => ({ default: m.PiscinePlanningPage })));
const ThemeCatalogPage = lazy(() => import('@/components/piscine/themes/ThemeCatalogPage').then(m => ({ default: m.ThemeCatalogPage })));
const FormationLayout = lazy(() => import('@/components/piscine/formation/FormationLayout').then(m => ({ default: m.FormationLayout })));
const ThemesPage = lazy(() => import('@/components/piscine/formation/ThemesPage').then(m => ({ default: m.ThemesPage })));
const PlanningPage = lazy(() => import('@/components/piscine/formation/PlanningPage').then(m => ({ default: m.PlanningPage })));
const ProgressionPage = lazy(() => import('@/components/piscine/formation/ProgressionPage').then(m => ({ default: m.ProgressionPage })));
const ExercicesPage = lazy(() => import('@/components/piscine/formation/ExercicesPage'));
const StatistiquesPage = lazy(() => import('@/components/piscine/formation/StatistiquesPage').then(m => ({ default: m.StatistiquesPage })));

// Reports
const RapportsPage = lazy(() => import('@/components/rapports/RapportsPage').then(m => ({ default: m.RapportsPage })));
const AIReportGeneration = lazy(() => import('@/components/rapports/AIReportGeneration').then(m => ({ default: m.AIReportGeneration })));

// Stock pages
const StockDashboard = lazy(() => import('@/components/stock').then(m => ({ default: m.StockDashboard })));
const MaterielStockPage = lazy(() => import('@/components/stock').then(m => ({ default: m.MaterielStockPage })));
const PretsStockPage = lazy(() => import('@/components/stock').then(m => ({ default: m.PretsStockPage })));
const BoutiqueStockPage = lazy(() => import('@/components/stock').then(m => ({ default: m.BoutiqueStockPage })));
const AuditStockPage = lazy(() => import('@/components/stock').then(m => ({ default: m.AuditStockPage })));
const ConfigStockPage = lazy(() => import('@/components/stock').then(m => ({ default: m.ConfigStockPage })));

// Settings pages
const SettingsPage = lazy(() => import('@/components/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SettingsDashboard = lazy(() => import('@/components/settings/SettingsDashboard').then(m => ({ default: m.SettingsDashboard })));
const ComptabiliteSettings = lazy(() => import('@/components/settings/ComptabiliteSettings').then(m => ({ default: m.ComptabiliteSettings })));
const UtilisateursSettings = lazy(() => import('@/components/settings/UtilisateursSettings').then(m => ({ default: m.UtilisateursSettings })));
const FournisseursSettings = lazy(() => import('@/components/settings/FournisseursSettings').then(m => ({ default: m.FournisseursSettings })));
const AutomatisationSettings = lazy(() => import('@/components/settings/AutomatisationSettings').then(m => ({ default: m.AutomatisationSettings })));
const KnownIbansSettings = lazy(() => import('@/components/settings/KnownIbansSettings').then(m => ({ default: m.KnownIbansSettings })));
const IntegrationsSettings = lazy(() => import('@/components/settings/IntegrationsSettings'));
const EvenementsSettings = lazy(() => import('@/components/settings/EvenementsSettings').then(m => ({ default: m.EvenementsSettings })));
const CotisationsSettingsPage = lazy(() => import('@/components/cotisations/CotisationsSettingsPage').then(m => ({ default: m.CotisationsSettingsPage })));
const ImportSettings = lazy(() => import('@/components/settings/ImportSettings').then(m => ({ default: m.ImportSettings })));
const GeneralSettings = lazy(() => import('@/components/settings/GeneralSettings').then(m => ({ default: m.GeneralSettings })));
const MaintenanceSettings = lazy(() => import('@/components/settings/MaintenanceSettings').then(m => ({ default: m.MaintenanceSettings })));
const BatchImportSettings = lazy(() => import('@/components/settings/BatchImportSettings').then(m => ({ default: m.BatchImportSettings })));
const AutoLinkExpenses = lazy(() => import('@/components/settings/AutoLinkExpenses').then(m => ({ default: m.AutoLinkExpenses })));
const AIMatchValidation = lazy(() => import('@/components/settings/AIMatchValidation').then(m => ({ default: m.AIMatchValidation })));
const AITestPage = lazy(() => import('@/components/settings/AITestPage').then(m => ({ default: m.AITestPage })));
const AnneesFiscalesSettingsPage = lazy(() => import('@/components/settings/AnneesFiscalesSettingsPage').then(m => ({ default: m.AnneesFiscalesSettingsPage })));
const SecuriteSettingsPage = lazy(() => import('@/components/settings/SecuriteSettingsPage').then(m => ({ default: m.SecuriteSettingsPage })));
const IASettingsPage = lazy(() => import('@/components/settings/IASettingsPage').then(m => ({ default: m.IASettingsPage })));
const ListesValeursSettingsPage = lazy(() => import('@/components/settings/ListesValeursSettingsPage').then(m => ({ default: m.ListesValeursSettingsPage })));
const CompatibilitySettingsPage = lazy(() => import('@/components/settings/CompatibilitySettingsPage').then(m => ({ default: m.CompatibilitySettingsPage })));
const BankSettingsPage = lazy(() => import('@/components/settings/BankSettingsPage').then(m => ({ default: m.BankSettingsPage })));
const ReglesLIFRASSettings = lazy(() => import('@/components/settings/ReglesLIFRASSettings').then(m => ({ default: m.ReglesLIFRASSettings })));

// Communication settings
const CommunicationSettingsPage = lazy(() => import('@/components/settings/CommunicationSettingsPage').then(m => ({ default: m.CommunicationSettingsPage })));
const EmailTemplatesPage = lazy(() => import('@/components/settings/EmailTemplatesPage').then(m => ({ default: m.EmailTemplatesPage })));
const CommunicationDashboard = lazy(() => import('@/pages/CommunicationDashboard').then(m => ({ default: m.CommunicationDashboard })));
const EmailHistoryPage = lazy(() => import('@/pages/EmailHistoryPage').then(m => ({ default: m.EmailHistoryPage })));
const PushNotificationsPage = lazy(() => import('@/pages/PushNotificationsPage').then(m => ({ default: m.PushNotificationsPage })));
const ManualEmailPage = lazy(() => import('@/pages/ManualEmailPage').then(m => ({ default: m.ManualEmailPage })));
const EventMessagesOverview = lazy(() => import('@/pages/EventMessagesOverview').then(m => ({ default: m.EventMessagesOverview })));
const SMSSettings = lazy(() => import('@/components/settings/SMSSettings'));
const WhatsAppSettings = lazy(() => import('@/components/settings/WhatsAppSettings'));
const SMSTemplatesPage = lazy(() => import('@/components/settings/SMSTemplatesPage'));
const BrandingLibrary = lazy(() => import('@/components/settings/BrandingLibrary'));
const BulkInvitePage = lazy(() => import('@/pages/BulkInvitePage').then(m => ({ default: m.BulkInvitePage })));

// Automated jobs
const AutomatedJobsDashboard = lazy(() => import('@/pages/AutomatedJobsDashboard').then(m => ({ default: m.AutomatedJobsDashboard })));
const AutomatedJobsSettings = lazy(() => import('@/components/settings/AutomatedJobsSettings').then(m => ({ default: m.AutomatedJobsSettings })));
const AutomatedJobsLogsPage = lazy(() => import('@/pages/AutomatedJobsLogsPage').then(m => ({ default: m.AutomatedJobsLogsPage })));
const AppAdoptionDashboard = lazy(() => import('@/pages/AppAdoptionDashboard').then(m => ({ default: m.AppAdoptionDashboard })));
const BugReportsPage = lazy(() => import('@/pages/BugReportsPage'));

// Payment demo
const PaymentDemoPage = lazy(() => import('@/pages/PaymentDemoPage').then(m => ({ default: m.PaymentDemoPage })));

// Query Client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

// Component to access theme in Toaster
function AppWithToaster({ user, loading: firebaseLoading }: { user: User | null; loading: boolean }) {
  const { effectiveTheme } = useTheme();

  return (
    <>
      <AuthProvider value={{ user, loading: firebaseLoading }}>
        <FiscalYearProvider>
          <Router>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes - Landing pages */}
                <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
                <Route path="/faq" element={<ErrorBoundary><FAQPage /></ErrorBoundary>} />
                <Route path="/docs" element={<ErrorBoundary><DocsPage /></ErrorBoundary>} />
                <Route path="/docs/calymob" element={<ErrorBoundary><CalyMobDocs /></ErrorBoundary>} />
                <Route path="/docs/calycompta" element={<ErrorBoundary><CalyComptaDocs /></ErrorBoundary>} />
                <Route path="/aide" element={<ErrorBoundary><SupportPage /></ErrorBoundary>} />
                <Route path="/privacy" element={<ErrorBoundary><PrivacyPolicyPage /></ErrorBoundary>} />

                {/* Public routes - Auth */}
                <Route path="/connexion" element={
                  user ? <Navigate to="/accueil" replace /> : <ErrorBoundary><LoginForm /></ErrorBoundary>
                } />
                <Route path="/reset-password" element={<ErrorBoundary><ResetPasswordPage /></ErrorBoundary>} />
                <Route path="/mot-de-passe-oublie" element={<ErrorBoundary><ForgotPasswordPage /></ErrorBoundary>} />

                {/* Change password route (protected, but outside Layout) */}
                <Route path="/change-password" element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <ChangePasswordForm />
                    </ErrorBoundary>
                  </ProtectedRoute>
                } />

                {/* Protected routes - Admin app */}
                <Route element={
                  <ProtectedRoute requireCalyComptaAccess>
                    <ErrorBoundary>
                      <Layout />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }>
                  <Route path="accueil" element={<AccueilPage />} />
                  <Route path="tableau-bord" element={<TableauBord />} />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route path="operations" element={<OperationsPage />} />
                  <Route path="depenses" element={<DemandesPage />} />
                  <Route path="membres" element={<MembresPage />} />
                  <Route path="piscine" element={<PiscinePlanningPage />} />
                  <Route path="piscine/themes" element={<ThemeCatalogPage />} />

                  {/* Formation — Carnet de Formation (behind feature flag) */}
                  <Route path="formation" element={<FormationLayout />}>
                    <Route index element={<ThemesPage />} />
                    <Route path="themes" element={<ThemesPage />} />
                    <Route path="planning" element={<PlanningPage />} />
                    <Route path="progression" element={<ProgressionPage />} />
                    <Route path="exercices" element={<ExercicesPage />} />
                    <Route path="statistiques" element={<StatistiquesPage />} />
                  </Route>

                  {/* Stock - Dashboard & Sub-pages */}
                  <Route path="stock" element={<StockDashboard />} />
                  <Route path="stock/materiel" element={<MaterielStockPage />} />
                  <Route path="stock/prets" element={<PretsStockPage />} />
                  <Route path="stock/boutique" element={<BoutiqueStockPage />} />
                  <Route path="stock/audit" element={<AuditStockPage />} />
                  <Route path="stock/config" element={<ConfigStockPage />} />

                  {/* Settings - Dashboard & Sub-pages */}
                  <Route path="parametres" element={<SettingsDashboard />} />
                  <Route path="parametres/comptabilite" element={<ComptabiliteSettings />} />
                  <Route path="parametres/utilisateurs" element={<UtilisateursSettings />} />
                  <Route path="parametres/evenements" element={<EvenementsSettings />} />
                  <Route path="parametres/cotisations" element={<CotisationsSettingsPage />} />
                  <Route path="parametres/fournisseurs" element={<FournisseursSettings />} />
                  <Route
                    element={
                      <ProtectedRoute requiredRole={['admin', 'superadmin', 'validateur']}>
                        <Outlet />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="parametres/communication" element={<CommunicationDashboard />} />
                    <Route path="parametres/communication/envoyer" element={<ManualEmailPage />} />
                    <Route path="parametres/communication/automatisee" element={<CommunicationSettingsPage />} />
                    <Route path="parametres/communication/templates" element={<EmailTemplatesPage />} />
                    <Route path="parametres/communication/emails-sortants" element={<EmailHistoryPage />} />
                    <Route path="parametres/communication/push-notifications" element={<PushNotificationsPage />} />
                    <Route path="parametres/communication/event-messages" element={<EventMessagesOverview />} />
                    <Route path="parametres/communication/sms" element={<SMSSettings />} />
                    <Route path="parametres/communication/whatsapp" element={<WhatsAppSettings />} />
                    <Route path="parametres/communication/sms-templates" element={<SMSTemplatesPage />} />
                    <Route path="parametres/communication/branding" element={<BrandingLibrary />} />
                    <Route
                      path="parametres/communication/bulk-invite"
                      element={
                        <ProtectedRoute requiredRole={['admin', 'superadmin']}>
                          <BulkInvitePage />
                        </ProtectedRoute>
                      }
                    />
                  </Route>
                  <Route
                    path="parametres/integrations"
                    element={
                      <ProtectedRoute requiredRole={['admin', 'superadmin']}>
                        <IntegrationsSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="parametres/paiements" element={<PaymentDemoPage />} />
                  <Route path="parametres/automatisation" element={<AutomatisationSettings />} />
                  <Route path="parametres/ibans-connus" element={<KnownIbansSettings />} />
                  <Route path="parametres/taches-automatisees" element={<AutomatedJobsDashboard />} />
                  <Route path="parametres/taches-automatisees/config" element={<AutomatedJobsSettings />} />
                  <Route path="parametres/taches-automatisees/logs" element={<AutomatedJobsLogsPage />} />
                  <Route path="parametres/import" element={<ImportSettings />} />
                  <Route path="parametres/general" element={<GeneralSettings />} />
                  <Route path="parametres/maintenance" element={<MaintenanceSettings />} />
                  <Route path="parametres/annees-fiscales" element={<AnneesFiscalesSettingsPage />} />
                  <Route path="parametres/securite" element={<SecuriteSettingsPage />} />
                  <Route path="parametres/ia-settings" element={<IASettingsPage />} />
                  <Route path="parametres/listes-valeurs" element={<ListesValeursSettingsPage />} />
                  <Route path="parametres/compatibilite" element={<CompatibilitySettingsPage />} />
                  <Route path="parametres/bank" element={<BankSettingsPage />} />
                  <Route path="parametres/regles-lifras" element={<ReglesLIFRASSettings />} />
                  <Route path="parametres/app-adoption" element={<AppAdoptionDashboard />} />
                  <Route path="parametres/signalements" element={<BugReportsPage />} />
                  {/* Legacy Settings Routes (to be deprecated) */}
                  <Route path="parametres/old" element={<SettingsPage />} />
                  <Route path="parametres/import-batch" element={<BatchImportSettings />} />
                  <Route path="parametres/auto-link-expenses" element={<AutoLinkExpenses />} />
                  <Route path="parametres/ai-match-validation" element={<AIMatchValidation />} />
                  <Route path="parametres/ai-test" element={<AITestPage />} />

                  <Route path="rapports" element={<RapportsPage />} />
                  <Route path="rapports-ia" element={<AIReportGeneration />} />
                </Route>

                {/* Default route - redirect to landing page */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </FiscalYearProvider>

        {/* Toast Notifications - always available */}
        <Toaster
          position="bottom-center"
          containerStyle={{
            bottom: 24,
          }}
          toastOptions={{
            duration: 4000,
            style: {
              background: effectiveTheme === 'dark' ? '#1e293b' : '#ffffff',
              color: effectiveTheme === 'dark' ? '#f1f5f9' : '#1f2937',
              border: effectiveTheme === 'dark' ? '1px solid #334155' : '1px solid #e5e7eb',
            },
            success: {
              style: {
                background: '#059669',
                color: '#fff',
              },
            },
            error: {
              style: {
                background: '#DC2626',
                color: '#fff',
              },
            },
          }}
        />
      </AuthProvider>
    </>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Observe authentication changes
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        // Force token refresh to ensure custom claims are loaded
        try {
          await user.getIdToken(true);
          logger.debug('✅ Token refreshed with custom claims');
        } catch (error) {
          logger.error('❌ Error refreshing token:', error);
        }
      }
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-primary">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-calypso-blue dark:border-calypso-aqua border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-text-secondary">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ErrorBoundary global>
          <AppWithToaster user={user} loading={loading} />
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

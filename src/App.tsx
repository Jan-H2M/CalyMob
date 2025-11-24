import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { User } from 'firebase/auth';
import { onAuthChange, signIn } from '@/lib/firebase';
import toast from 'react-hot-toast';

// Composants
import { LoginForm } from '@/components/auth/LoginForm';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { Layout } from '@/components/commun/Layout';
import { AccueilPage } from '@/components/accueil/AccueilPage';
import { TableauBord } from '@/components/tableau-bord/TableauBord';
import { TransactionsPage } from '@/components/banque/TransactionsPage';
import { OperationsPage } from '@/components/operations/OperationsPage';
import { DemandesPage } from '@/components/depenses/DemandesPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { SettingsDashboard } from '@/components/settings/SettingsDashboard';
import { ComptabiliteSettings } from '@/components/settings/ComptabiliteSettings';
import { UtilisateursSettings } from '@/components/settings/UtilisateursSettings';
import { AutomatisationSettings } from '@/components/settings/AutomatisationSettings';
import IntegrationsSettings from '@/components/settings/IntegrationsSettings';
// SystemeSettings removed - merged into SettingsDashboard
// import { SystemeSettings } from '@/components/settings/SystemeSettings';
import { CommunicationSettingsPage } from '@/components/settings/CommunicationSettingsPage';
import { EmailTemplatesPage } from '@/components/settings/EmailTemplatesPage';
import { CommunicationDashboard } from '@/pages/CommunicationDashboard';
import { EmailHistoryPage } from '@/pages/EmailHistoryPage';
import { EvenementsSettings } from '@/components/settings/EvenementsSettings';
import { ImportSettings } from '@/components/settings/ImportSettings';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { MaintenanceSettings } from '@/components/settings/MaintenanceSettings';
import { BatchImportSettings } from '@/components/settings/BatchImportSettings';
import { DocumentReviewPage } from '@/components/settings/DocumentReviewPage';
import { AutoLinkExpenses } from '@/components/settings/AutoLinkExpenses';
import { AIMatchValidation } from '@/components/settings/AIMatchValidation';
import { AITestPage } from '@/components/settings/AITestPage';
import { AnneesFiscalesSettingsPage } from '@/components/settings/AnneesFiscalesSettingsPage';
import { SecuriteSettingsPage } from '@/components/settings/SecuriteSettingsPage';
import { IASettingsPage } from '@/components/settings/IASettingsPage';
import { ListesValeursSettingsPage } from '@/components/settings/ListesValeursSettingsPage';
import { RapportsPage } from '@/components/rapports/RapportsPage';
import { AIReportGeneration } from '@/components/rapports/AIReportGeneration';
import { InventairePage } from '@/components/inventaire/InventairePage';
import { InventaireSettings } from '@/components/settings/InventaireSettings';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Contextes
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { FiscalYearProvider } from '@/contexts/FiscalYearContext';

// Query Client pour React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

// Component pour accéder au thème dans Toaster
function AppWithToaster({ user, loading }: { user: User | null; loading: boolean }) {
  const { effectiveTheme } = useTheme();

  return (
    <>
      <AuthProvider value={{ user, loading }}>
        <FiscalYearProvider>
          <Router>
          <Routes>
            {/* Routes publiques */}
            <Route path="/connexion" element={
              user ? <Navigate to="/accueil" replace /> : <LoginForm />
            } />

            {/* Route changement mot de passe (protégée, mais hors Layout) */}
            <Route path="/change-password" element={
              <ProtectedRoute>
                <ChangePasswordForm />
              </ProtectedRoute>
            } />

            {/* Routes protégées */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/accueil" replace />} />
              <Route path="accueil" element={<AccueilPage />} />
              <Route path="tableau-bord" element={<TableauBord />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="depenses" element={<DemandesPage />} />
              <Route path="inventaire" element={<InventairePage />} />

              {/* Settings - Dashboard & Sub-pages */}
              <Route path="parametres" element={<SettingsDashboard />} />
              <Route path="parametres/comptabilite" element={<ComptabiliteSettings />} />
              <Route path="parametres/utilisateurs" element={<UtilisateursSettings />} />
              <Route path="parametres/evenements" element={<EvenementsSettings />} />
              <Route path="parametres/communication" element={<CommunicationDashboard />} />
              <Route path="parametres/communication/automatisee" element={<CommunicationSettingsPage />} />
              <Route path="parametres/communication/templates" element={<EmailTemplatesPage />} />
              <Route path="parametres/communication/emails-sortants" element={<EmailHistoryPage />} />
              <Route path="parametres/integrations" element={<IntegrationsSettings />} />
              <Route path="parametres/automatisation" element={<AutomatisationSettings />} />
              {/* /parametres/systeme removed - all buttons now in /parametres */}
              <Route path="parametres/inventaire" element={<InventaireSettings />} />
              <Route path="parametres/import" element={<ImportSettings />} />
              <Route path="parametres/general" element={<GeneralSettings />} />
              <Route path="parametres/maintenance" element={<MaintenanceSettings />} />
              <Route path="parametres/annees-fiscales" element={<AnneesFiscalesSettingsPage />} />
              <Route path="parametres/securite" element={<SecuriteSettingsPage />} />
              <Route path="parametres/ia-settings" element={<IASettingsPage />} />
              <Route path="parametres/listes-valeurs" element={<ListesValeursSettingsPage />} />

              {/* Legacy Settings Routes (to be deprecated) */}
              <Route path="parametres/old" element={<SettingsPage />} />
              <Route path="parametres/import-batch" element={<BatchImportSettings />} />
              <Route path="parametres/revision-documents" element={<DocumentReviewPage />} />
              <Route path="parametres/auto-link-expenses" element={<AutoLinkExpenses />} />
              <Route path="parametres/ai-match-validation" element={<AIMatchValidation />} />
              <Route path="parametres/ai-test" element={<AITestPage />} />

              <Route path="rapports" element={<RapportsPage />} />
              <Route path="rapports-ia" element={<AIReportGeneration />} />
            </Route>

            {/* Route par défaut */}
            <Route path="*" element={<Navigate to="/connexion" replace />} />
          </Routes>
          </Router>
        </FiscalYearProvider>

      {/* Notifications Toast */}
      <Toaster
        position="bottom-right"
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
    // Observer les changements d'authentification
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        // Force token refresh to ensure custom claims are loaded
        // This prevents the "Missing or insufficient permissions" errors
        // that occur when the app starts before custom claims are available
        try {
          await user.getIdToken(true); // true = force refresh
          console.log('✅ Token refreshed with custom claims');
        } catch (error) {
          console.error('❌ Error refreshing token:', error);
        }
      }
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-primary">
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
        <AppWithToaster user={user} loading={loading} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
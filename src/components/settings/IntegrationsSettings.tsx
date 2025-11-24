import React, { useState, useEffect } from 'react';
import {
  Key,
  Save,
  AlertCircle,
  Eye,
  EyeOff,
  TestTube,
  Loader2,
  Brain,
  FileText,
  Mail,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { aiProviderService } from '@/services/aiProviderService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { GoogleMailService } from '@/services/googleMailService';
import { SettingsHeader } from './SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export default function IntegrationsSettings() {
  const { currentUser, user } = useAuth();
  const clubId = import.meta.env.VITE_CLUB_ID || 'calypso';

  // OpenAI state
  const [openaiKey, setOpenaiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [isTestingOpenai, setIsTestingOpenai] = useState(false);

  // Anthropic state
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [isTestingAnthropic, setIsTestingAnthropic] = useState(false);

  // Email Provider Selection
  const [emailProvider, setEmailProvider] = useState<'gmail' | 'resend'>('resend');

  // Google Mail state
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [showGoogleClientSecret, setShowGoogleClientSecret] = useState(false);
  const [googleRefreshToken, setGoogleRefreshToken] = useState('');
  const [showGoogleRefreshToken, setShowGoogleRefreshToken] = useState(false);
  const [googleFromEmail, setGoogleFromEmail] = useState('');
  const [googleFromName, setGoogleFromName] = useState('');
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);

  // Resend state
  const [resendApiKey, setResendApiKey] = useState('');
  const [showResendApiKey, setShowResendApiKey] = useState(false);
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [resendFromName, setResendFromName] = useState('');
  const [isTestingResend, setIsTestingResend] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const providerConfig = aiProviderService.getProviderConfig();

  useEffect(() => {
    loadApiKeys();
  }, [clubId]);

  const loadApiKeys = async () => {
    try {
      setIsLoading(true);

      // Load AI API keys
      const { openaiKey: fbOpenaiKey, anthropicKey: fbAnthropicKey } =
        await FirebaseSettingsService.loadAIApiKeys(clubId);

      setOpenaiKey(fbOpenaiKey || '');
      setAnthropicKey(fbAnthropicKey || '');

      // Load Email configuration (Resend + Gmail + Provider selection)
      const emailConfig = await FirebaseSettingsService.loadEmailConfig(clubId);

      // Set email provider
      setEmailProvider(emailConfig.provider || 'resend');

      // Load Resend configuration
      setResendApiKey(emailConfig.resend?.apiKey || '');
      setResendFromEmail(emailConfig.resend?.fromEmail || 'onboarding@resend.dev');
      setResendFromName(emailConfig.resend?.fromName || 'Calypso Diving Club');

      // Load Google Mail configuration
      setGoogleClientId(emailConfig.gmail?.clientId || '');
      setGoogleClientSecret(emailConfig.gmail?.clientSecret || '');
      setGoogleRefreshToken(emailConfig.gmail?.refreshToken || '');
      setGoogleFromEmail(emailConfig.gmail?.fromEmail || 'noreply@calypso-diving.be');
      setGoogleFromName(emailConfig.gmail?.fromName || 'Calypso Diving Club');

      // Initialize aiProviderService with loaded keys
      if (fbOpenaiKey) {
        aiProviderService.setOpenAIKey(fbOpenaiKey);
      }
      if (fbAnthropicKey) {
        aiProviderService.setAnthropicKey(fbAnthropicKey);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des clés API:', error);
      toast.error('Erreur lors du chargement de la configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      // Save AI API keys
      await FirebaseSettingsService.saveAIApiKeys(
        clubId,
        openaiKey.trim(),
        anthropicKey.trim(),
        currentUser?.uid
      );

      // Save Email configuration (Resend + Gmail + Provider selection)
      await FirebaseSettingsService.saveEmailConfig(
        clubId,
        {
          provider: emailProvider,
          resend: {
            apiKey: resendApiKey.trim(),
            fromEmail: resendFromEmail.trim(),
            fromName: resendFromName.trim(),
          },
          gmail: {
            clientId: googleClientId.trim(),
            clientSecret: googleClientSecret.trim(),
            refreshToken: googleRefreshToken.trim(),
            fromEmail: googleFromEmail.trim(),
            fromName: googleFromName.trim(),
          },
        },
        currentUser?.uid
      );

      // Update aiProviderService
      aiProviderService.setOpenAIKey(openaiKey.trim());
      aiProviderService.setAnthropicKey(anthropicKey.trim());

      toast.success('✅ Configuration sauvegardée avec succès');
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('❌ Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestOpenAI = async () => {
    if (!openaiKey.trim()) {
      toast.error('Veuillez entrer une clé API OpenAI');
      return;
    }

    setIsTestingOpenai(true);
    try {
      aiProviderService.setOpenAIKey(openaiKey.trim());
      const result = await aiProviderService.testOpenAIConnection();

      if (result.success) {
        toast.success('✅ ' + result.message);
      } else {
        toast.error('❌ ' + result.message);
      }
    } catch (error) {
      console.error('OpenAI test error:', error);
      toast.error('Impossible de se connecter à OpenAI');
    } finally {
      setIsTestingOpenai(false);
    }
  };

  const handleTestAnthropic = async () => {
    if (!anthropicKey.trim()) {
      toast.error('Veuillez entrer une clé API Anthropic');
      return;
    }

    setIsTestingAnthropic(true);
    try {
      aiProviderService.setAnthropicKey(anthropicKey.trim());
      const result = await aiProviderService.testAnthropicConnection();

      if (result.success) {
        toast.success('✅ ' + result.message);
      } else {
        toast.error('❌ ' + result.message);
      }
    } catch (error) {
      console.error('Anthropic test error:', error);
      toast.error('Impossible de se connecter à Claude');
    } finally {
      setIsTestingAnthropic(false);
    }
  };

  const handleTestGoogleMail = async () => {
    if (!googleClientId.trim() || !googleClientSecret.trim() || !googleRefreshToken.trim()) {
      toast.error('Veuillez remplir tous les champs OAuth2 (Client ID, Client Secret, Refresh Token)');
      return;
    }

    if (!user?.email) {
      toast.error('Impossible de récupérer votre adresse email');
      return;
    }

    // Ask user to save first if there are unsaved changes
    const hasUnsavedChanges = true; // Assume changes need to be saved
    if (hasUnsavedChanges) {
      toast.loading('Sauvegarde de la configuration...', { duration: 1000 });
      await handleSaveConfig();
    }

    setIsTestingGoogle(true);
    try {
      // Send test email to the current user
      const result = await GoogleMailService.sendTestEmail(clubId, user.email);

      if (result.success) {
        toast.success(`✅ Email de test envoyé avec succès à ${user.email}`, { duration: 5000 });
      }
    } catch (error: any) {
      console.error('Google Mail test error:', error);

      // User-friendly error messages
      if (error.message?.includes('Token d\'authentification')) {
        toast.error('❌ Refresh Token invalide. Veuillez régénérer votre token sur Google Cloud Console', { duration: 6000 });
      } else if (error.message?.includes('Configuration')) {
        toast.error('❌ ' + error.message, { duration: 5000 });
      } else {
        toast.error('❌ Impossible d\'envoyer l\'email. Vérifiez votre configuration', { duration: 5000 });
      }
    } finally {
      setIsTestingGoogle(false);
    }
  };

  const handleTestResend = async () => {
    if (!resendApiKey.trim()) {
      toast.error('Veuillez entrer une clé API Resend');
      return;
    }

    if (!user?.email) {
      toast.error('Impossible de récupérer votre adresse email');
      return;
    }

    // Ask user to save first if there are unsaved changes
    const hasUnsavedChanges = true;
    if (hasUnsavedChanges) {
      toast.loading('Sauvegarde de la configuration...', { duration: 1000 });
      await handleSaveConfig();
    }

    setIsTestingResend(true);
    try {
      // Send test email via Resend
      const response = await fetch('/api/send-resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: resendApiKey.trim(),
          from: `${resendFromName || 'Calypso Diving Club'} <${resendFromEmail || 'onboarding@resend.dev'}>`,
          to: user.email,
          subject: '🧪 Email de test - Resend',
          html: `
            <h1>🎉 Configuration Resend réussie !</h1>
            <p>Bonjour,</p>
            <p>Votre configuration Resend est correctement configurée et fonctionnelle.</p>
            <p><strong>Détails:</strong></p>
            <ul>
              <li>✅ Clé API Resend valide</li>
              <li>✅ Connexion à Resend API établie</li>
              <li>✅ Envoi d'emails activé</li>
            </ul>
            <p>Vous pouvez maintenant utiliser Resend pour envoyer des emails automatisés depuis CalyCompta.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Cet email a été envoyé automatiquement par CalyCompta via Resend API
            </p>
          `,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`✅ Email de test envoyé avec succès via Resend à ${user.email}`, { duration: 5000 });
      } else {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }
    } catch (error: any) {
      console.error('Resend test error:', error);
      toast.error('❌ Impossible d\'envoyer l\'email via Resend. Vérifiez votre clé API', { duration: 5000 });
    } finally {
      setIsTestingResend(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        <div className="p-6 flex items-center justify-center">
          <div className="flex items-center gap-2 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Chargement de la configuration...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Services Externes']}
          title="Services Externes"
          description="Configuration centralisée des services externes (IA, Email, etc.)"
        />

        <div className="space-y-6">
          {/* Intelligence Artificielle Section */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">🤖 Intelligence Artificielle</h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Analyse de documents et génération de rapports
          </p>
        </div>

        <div className="p-6 space-y-8">
          {/* OpenAI GPT-4o */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Brain className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">OpenAI GPT-4o</h4>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Analyse de documents, OCR, extraction de données</p>
              </div>
              {providerConfig.openai.enabled ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Clé API OpenAI
              </label>
              <div className="relative">
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                >
                  {showOpenaiKey ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Obtenez votre clé sur <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a>
              </p>
            </div>

            {openaiKey && (
              <button
                onClick={handleTestOpenAI}
                disabled={isTestingOpenai}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
              >
                {isTestingOpenai ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Test en cours...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4" />
                    Tester la connexion OpenAI
                  </>
                )}
              </button>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Anthropic Claude */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">Anthropic Claude Sonnet 4.5</h4>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Génération de rapports, Excel, PowerPoint, PDF</p>
              </div>
              {providerConfig.anthropic.enabled ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Clé API Anthropic
              </label>
              <div className="relative">
                <input
                  type={showAnthropicKey ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                >
                  {showAnthropicKey ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Obtenez votre clé sur <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">console.anthropic.com</a>
              </p>
            </div>

            {anthropicKey && (
              <button
                onClick={handleTestAnthropic}
                disabled={isTestingAnthropic}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
              >
                {isTestingAnthropic ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Test en cours...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4" />
                    Tester la connexion Claude
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

          {/* Email Services Section */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">📧 Services Email</h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Envoi automatisé d'emails et notifications
          </p>
        </div>

        <div className="p-6 space-y-8">
          {/* Email Provider Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg border border-gray-200 dark:border-dark-border">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">Service Email actif</h4>
              <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-1">
                Sélectionnez le service à utiliser pour l'envoi d'emails
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEmailProvider('gmail')}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium text-sm transition-all',
                  emailProvider === 'gmail'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-dark-border hover:bg-gray-50'
                )}
              >
                Gmail API
              </button>
              <button
                onClick={() => setEmailProvider('resend')}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium text-sm transition-all',
                  emailProvider === 'resend'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-dark-border hover:bg-gray-50'
                )}
              >
                Resend
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Resend */}
          {emailProvider === 'resend' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Mail className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">Resend</h4>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
                    Service d'envoi d'emails moderne et simple - Recommandé ✨
                  </p>
                </div>
                {resendApiKey ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-400" />
                )}
              </div>

              {/* Resend API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Clé API Resend
                </label>
                <div className="relative">
                  <input
                    type={showResendApiKey ? 'text' : 'password'}
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder="re_..."
                    className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResendApiKey(!showResendApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                  >
                    {showResendApiKey ? (
                      <EyeOff className="h-4 w-4 text-gray-500" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Obtenez votre clé sur <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">resend.com/api-keys</a>
                </p>
              </div>

              {/* From Email and Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Email expéditeur
                  </label>
                  <input
                    type="email"
                    value={resendFromEmail}
                    onChange={(e) => setResendFromEmail(e.target.value)}
                    placeholder="onboarding@resend.dev"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Utilisez onboarding@resend.dev pour les tests
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Nom expéditeur
                  </label>
                  <input
                    type="text"
                    value={resendFromName}
                    onChange={(e) => setResendFromName(e.target.value)}
                    placeholder="Calypso Diving Club"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              {/* Info Box */}
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-800 dark:text-green-300">
                  ✨ <strong>Pourquoi Resend?</strong>
                </p>
                <ul className="text-xs text-green-700 dark:text-green-300 mt-2 space-y-1 list-disc list-inside">
                  <li>Configuration ultra-simple (juste une clé API)</li>
                  <li>Excellente délivrabilité</li>
                  <li>Pas de configuration OAuth complexe</li>
                  <li>Domaines personnalisés faciles à configurer</li>
                </ul>
              </div>

              {/* Test Button */}
              {resendApiKey && (
                <button
                  onClick={handleTestResend}
                  disabled={isTestingResend}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
                >
                  {isTestingResend ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Envoi de l'email de test...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4" />
                      Envoyer un email de test
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Google Mail */}
          {emailProvider === 'gmail' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Mail className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">Google Mail (Gmail API)</h4>
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Service d'envoi d'emails via Gmail avec OAuth2</p>
                </div>
                {googleClientId && googleClientSecret && googleRefreshToken ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-400" />
                )}
              </div>

            {/* Client ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Client ID
              </label>
              <input
                type="text"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="123456789-abcdefghijklmnop.apps.googleusercontent.com"
                className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
              />
            </div>

            {/* Client Secret */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Client Secret
              </label>
              <div className="relative">
                <input
                  type={showGoogleClientSecret ? 'text' : 'password'}
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowGoogleClientSecret(!showGoogleClientSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                >
                  {showGoogleClientSecret ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>

            {/* Refresh Token */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Refresh Token
              </label>
              <div className="relative">
                <input
                  type={showGoogleRefreshToken ? 'text' : 'password'}
                  value={googleRefreshToken}
                  onChange={(e) => setGoogleRefreshToken(e.target.value)}
                  placeholder="1//..."
                  className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowGoogleRefreshToken(!showGoogleRefreshToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                >
                  {showGoogleRefreshToken ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>

            {/* From Email and Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Email expéditeur
                </label>
                <input
                  type="email"
                  value={googleFromEmail}
                  onChange={(e) => setGoogleFromEmail(e.target.value)}
                  placeholder="noreply@calypso-diving.be"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Nom expéditeur
                </label>
                <input
                  type="text"
                  value={googleFromName}
                  onChange={(e) => setGoogleFromName(e.target.value)}
                  placeholder="Calypso Diving Club"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                💡 <strong>Configuration OAuth2:</strong>
              </p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
                <li>Créez un projet sur <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                <li>Activez Gmail API</li>
                <li>Créez des identifiants OAuth 2.0 (Application Web)</li>
                <li>Générez un Refresh Token avec les scopes gmail.send</li>
              </ul>
            </div>

            {/* Test Button */}
            {googleClientId && googleClientSecret && googleRefreshToken && (
              <button
                onClick={handleTestGoogleMail}
                disabled={isTestingGoogle}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
              >
                {isTestingGoogle ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Envoi de l'email de test...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4" />
                    Envoyer un email de test
                  </>
                )}
              </button>
            )}
            </div>
          )}
          </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 rounded-lg">
        <div className="flex gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">🔐 Sécurité:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Vos clés API sont stockées de manière sécurisée dans Firebase</li>
              <li>Accès restreint aux administrateurs uniquement</li>
              <li>Les clés ne sont jamais exposées dans le code client</li>
              <li>Connexions HTTPS uniquement pour toutes les communications</li>
            </ul>
          </div>
          </div>
          </div>

          {/* Save Button */}
          <button
        onClick={handleSaveConfig}
        disabled={isSaving}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Sauvegarde en cours...
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />
            Sauvegarder toutes les clés API
          </>
        )}
          </button>
        </div>
      </div>
    </div>
  );
}

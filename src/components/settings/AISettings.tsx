import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Key,
  Save,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  TestTube,
  Loader2,
  Brain,
  FileText
} from 'lucide-react';
import { aiDocumentService } from '@/services/aiDocumentService';
import { aiProviderService } from '@/services/aiProviderService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function AISettings() {
  const { currentUser } = useAuth();
  const clubId = import.meta.env.VITE_CLUB_ID || 'calypso';

  // OpenAI state
  const [openaiKey, setOpenaiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [isTestingOpenai, setIsTestingOpenai] = useState(false);

  // Anthropic state
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [isTestingAnthropic, setIsTestingAnthropic] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const providerConfig = aiProviderService.getProviderConfig();

  useEffect(() => {
    // Load saved API keys from Firebase (with localStorage fallback)
    const loadApiKeys = async () => {
      try {
        setIsLoading(true);

        // Try loading from Firebase first
        const { openaiKey: fbOpenaiKey, anthropicKey: fbAnthropicKey } =
          await FirebaseSettingsService.loadAIApiKeys(clubId);

        // Use Firebase keys if available, otherwise fallback to localStorage
        const finalOpenaiKey = fbOpenaiKey || localStorage.getItem('ai_api_key') || '';
        const finalAnthropicKey = fbAnthropicKey || localStorage.getItem('anthropic_api_key') || '';

        setOpenaiKey(finalOpenaiKey);
        setAnthropicKey(finalAnthropicKey);

        // Initialize aiProviderService with loaded keys
        if (finalOpenaiKey) {
          aiProviderService.setOpenAIKey(finalOpenaiKey);
        }
        if (finalAnthropicKey) {
          aiProviderService.setAnthropicKey(finalAnthropicKey);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des clés API:', error);
        // Fallback to localStorage only
        const savedOpenaiKey = localStorage.getItem('ai_api_key');
        const savedAnthropicKey = localStorage.getItem('anthropic_api_key');

        if (savedOpenaiKey) {
          setOpenaiKey(savedOpenaiKey);
        }
        if (savedAnthropicKey) {
          setAnthropicKey(savedAnthropicKey);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadApiKeys();
  }, [clubId]);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      // Save to Firebase
      await FirebaseSettingsService.saveAIApiKeys(
        clubId,
        openaiKey.trim(),
        anthropicKey.trim(),
        currentUser?.uid
      );

      // Update aiProviderService (also updates localStorage)
      aiProviderService.setOpenAIKey(openaiKey.trim());
      aiProviderService.setAnthropicKey(anthropicKey.trim());

      // Also update aiDocumentService for backward compatibility
      if (openaiKey.trim()) {
        aiDocumentService.setApiKey(openaiKey.trim(), 'openai');
      }

      toast.success('✅ Configuration IA sauvegardée dans Firebase');
    } catch (error) {
      console.error('Error saving AI config:', error);
      toast.error('❌ Erreur lors de la sauvegarde dans Firebase');
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
      // Temporarily set the key for testing
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
      // Temporarily set the key for testing
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

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
  };

  // Show loading state while fetching from Firebase
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Configuration de l'Intelligence Artificielle</h2>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Configurez les providers IA pour l'analyse et la génération de documents
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 flex items-center justify-center">
          <div className="flex items-center gap-2 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Chargement de la configuration depuis Firebase...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
      <div className="p-6 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Configuration de l'Intelligence Artificielle</h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              Configurez les providers IA pour l'analyse et la génération de documents
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* OpenAI GPT-4o Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Brain className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">OpenAI GPT-4o</h3>
              <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Analyse de documents, OCR, extraction de données</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                providerConfig.openai.enabled ? "bg-green-500" : "bg-gray-400"
              )} />
              <span className="text-xs text-gray-600 dark:text-dark-text-secondary">
                {providerConfig.openai.enabled ? 'Configuré' : 'Non configuré'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              <Key className="h-4 w-4 inline mr-1" />
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
                  <EyeOff className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
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

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-dark-border" />

        {/* Anthropic Claude Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">Anthropic Claude Sonnet 4.5</h3>
              <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Génération de rapports, Excel, PowerPoint, PDF</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                providerConfig.anthropic.enabled ? "bg-green-500" : "bg-gray-400"
              )} />
              <span className="text-xs text-gray-600 dark:text-dark-text-secondary">
                {providerConfig.anthropic.enabled ? 'Configuré' : 'Non configuré'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              <Key className="h-4 w-4 inline mr-1" />
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
                  <EyeOff className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
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

          {/* Claude Pricing */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm font-medium text-purple-900 mb-2">💰 Coûts Claude (génération rapports)</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xl font-bold text-purple-900">~€0.20</p>
                <p className="text-xs text-purple-700">Rapport Excel</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-purple-900">~€0.25</p>
                <p className="text-xs text-purple-700">Excel + PowerPoint + PDF</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-purple-900">~€0.30</p>
                <p className="text-xs text-purple-700">Avec AI insights</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Informations importantes:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Vos clés API sont sauvegardées dans Firebase (partagées entre utilisateurs du club)</li>
                <li>Copie locale dans le navigateur pour utilisation hors ligne</li>
                <li>OpenAI: Analyse de documents (~€0.01 par document)</li>
                <li>Claude: Génération de rapports (~€0.20-0.30 par rapport)</li>
                <li>Les deux providers peuvent fonctionner simultanément</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveConfig}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sauvegarde en cours...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Sauvegarder la configuration
            </>
          )}
        </button>
      </div>
    </div>
  );
}
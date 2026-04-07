import React, { useState, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  ArrowLeft,
  Play,
  RefreshCw,
  Check,
  X,
  Clock,
  Terminal,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  ExternalLink,
  Wifi,
  WifiOff,
  Trash2,
  Copy,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MolliePaymentService, MolliePayment, MolliePaymentStatus } from '@/services/molliePaymentService';
import toast from 'react-hot-toast';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'error' | 'info' | 'success';
  message: string;
  data?: any;
}

interface ConnectionStatus {
  connected: boolean;
  profile?: {
    id: string;
    name: string;
    email: string;
    mode: string;
    status: string;
    website?: string;
  };
  availableMethods?: Array<{
    id: string;
    description: string;
    status: string;
  }>;
  error?: string;
}

export function MolliePaymentDemoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, appUser } = useAuth();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Environment
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Form fields
  const [amount, setAmount] = useState('25.00');
  const [currency] = useState('EUR');
  const [description, setDescription] = useState('Paiement test CalyCompta');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [payments, setPayments] = useState<MolliePayment[]>([]);
  const [currentPayment, setCurrentPayment] = useState<MolliePayment | null>(null);

  // Club ID
  const clubId = appUser?.clubId || 'calypso';

  // Check for return from Mollie
  useEffect(() => {
    const paymentId = searchParams.get('payment');
    const status = searchParams.get('status');

    if (paymentId && status) {
      addLog('info', `Retour du checkout Mollie - paiement: ${paymentId}, statut: ${status}`);
      // Clear URL params
      navigate('/parametres/mollie', { replace: true });
    }
  }, [searchParams, navigate]);

  // Load payments from Firestore on mount
  useEffect(() => {
    const loadPayments = async () => {
      try {
        setIsLoadingPayments(true);
        const firestorePayments = await MolliePaymentService.getRecentPayments(clubId, 50);
        setPayments(firestorePayments);
      } catch (error) {
        logger.error('Error loading payments:', error);
        addLog('error', 'Impossible de charger les paiements depuis Firestore');
      } finally {
        setIsLoadingPayments(false);
      }
    };

    loadPayments();
  }, [clubId]);

  // Scroll to bottom of logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (type: LogEntry['type'], message: string, data?: any) => {
    const entry: LogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      type,
      message,
      data
    };
    setLogs(prev => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    addLog('info', `Test connexion API Mollie (${environment})...`);

    try {
      addLog('request', `GET /api/mollie/test-connection?environment=${environment}`);

      const response = await fetch(`/api/mollie/test-connection?environment=${environment}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Connection test failed');
      }

      addLog('response', 'Connexion reussie!', data);

      setConnectionStatus({
        connected: true,
        profile: data.profile,
        availableMethods: data.availableMethods
      });

      toast.success(`Connecte a Mollie (${data.profile.name})`);

    } catch (error: any) {
      addLog('error', error.message);
      setConnectionStatus({
        connected: false,
        error: error.message
      });
      toast.error(error.message || 'Connexion echouee');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleCreatePayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Entrez un montant valide');
      return;
    }

    setIsLoading(true);
    addLog('info', `Creation paiement Mollie (${environment})...`);

    try {
      const payload = {
        amount: parseFloat(amount),
        currency,
        description,
        method: paymentMethod,
        customerEmail,
        environment,
        metadata: {
          source: 'calycompta-demo',
          clubId: clubId
        }
      };

      addLog('request', 'POST /api/mollie/create-payment', payload);

      const response = await fetch('/api/mollie/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Echec de creation du paiement');
      }

      addLog('success', `Paiement cree: ${data.molliePaymentId}`, data);

      // Save to Firestore
      addLog('info', 'Sauvegarde dans Firestore...');
      const molliePayment: Omit<MolliePayment, 'createdAt' | 'updatedAt'> = {
        id: data.paymentId,
        molliePaymentId: data.molliePaymentId,
        amount: parseFloat(amount),
        currency,
        description,
        method: paymentMethod as any,
        customerEmail: customerEmail || undefined,
        status: data.status as MolliePaymentStatus,
        paymentUrl: data.paymentUrl,
        environment
      };

      await MolliePaymentService.createPayment(clubId, molliePayment);
      addLog('success', 'Sauvegarde dans Firestore');

      const payment: MolliePayment = {
        ...molliePayment,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      setCurrentPayment(payment);
      setPayments(prev => [payment, ...prev]);

      toast.success('Paiement cree!');

      // Open payment URL if in sandbox
      if (environment === 'sandbox' && data.paymentUrl) {
        addLog('info', 'Ouverture de la page checkout Mollie...');
        window.open(data.paymentUrl, '_blank');
      }

    } catch (error: any) {
      addLog('error', error.message);
      toast.error(error.message || 'Erreur lors de la creation du paiement');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async (payment: MolliePayment) => {
    if (!payment.molliePaymentId) {
      toast.error('Pas d\'ID de paiement Mollie disponible');
      return;
    }

    addLog('info', `Verification du statut pour ${payment.molliePaymentId}...`);

    try {
      addLog('request', `GET /api/mollie/payment-status?molliePaymentId=${payment.molliePaymentId}&environment=${payment.environment}`);

      const response = await fetch(
        `/api/mollie/payment-status?molliePaymentId=${payment.molliePaymentId}&environment=${payment.environment}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Echec de recuperation du statut');
      }

      addLog('response', `Statut: ${data.status}`, data);

      // Update in Firestore
      try {
        await MolliePaymentService.updatePaymentStatus(clubId, payment.id, data.status);
        addLog('info', 'Statut mis a jour dans Firestore');
      } catch (err) {
        logger.error('Error updating status in Firestore:', err);
      }

      // Update payment in list
      setPayments(prev => prev.map(p =>
        p.id === payment.id ? { ...p, status: data.status } : p
      ));

      if (currentPayment?.id === payment.id) {
        setCurrentPayment((prev: MolliePayment | null) => prev ? { ...prev, status: data.status } : null);
      }

      toast.success(`Status: ${MolliePaymentService.getStatusLabel(data.status)}`);

    } catch (error: any) {
      addLog('error', error.message);
      toast.error(error.message || 'Erreur lors de la verification du statut');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copie dans le presse-papiers');
  };

  const getStatusBadge = (status: MolliePaymentStatus) => {
    const colorClass = MolliePaymentService.getStatusColor(status);
    const label = MolliePaymentService.getStatusLabel(status);

    const icons: Record<MolliePaymentStatus, React.ReactNode> = {
      'paid': <Check className="h-3 w-3" />,
      'failed': <X className="h-3 w-3" />,
      'canceled': <X className="h-3 w-3" />,
      'expired': <Clock className="h-3 w-3" />,
      'open': <Clock className="h-3 w-3" />,
      'pending': <Loader2 className="h-3 w-3 animate-spin" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
        {icons[status]}
        {label}
      </span>
    );
  };

  // Check if user is admin
  if (appUser?.role !== 'superadmin' && appUser?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary dark:text-white mb-2">
            Acces Refuse
          </h1>
          <p className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mb-4">
            Cette page est reservee aux administrateurs.
          </p>
          <button
            onClick={() => navigate('/parametres')}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90"
          >
            Retour aux Parametres
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/parametres')}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-gray-200 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux parametres
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-orange-600" />
                Demo Paiements - Mollie
              </h1>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
                Testez l'integration Bancontact/SEPA avec Mollie
              </p>
            </div>

            {/* Environment Toggle */}
            <div className="flex items-center gap-2 bg-white dark:bg-dark-bg-secondary rounded-lg p-1 border border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setEnvironment('sandbox')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  environment === 'sandbox'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                }`}
              >
                Sandbox
              </button>
              <button
                onClick={() => setEnvironment('production')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  environment === 'production'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                }`}
              >
                Production
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Connection Test & Payment Form */}
          <div className="space-y-6">
            {/* Connection Test */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <div className="p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  {connectionStatus?.connected ? (
                    <Wifi className="h-5 w-5 text-green-500" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                  )}
                  Connexion API
                </h2>
              </div>

              <div className="p-4">
                {connectionStatus?.connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Connecte</span>
                    </div>

                    <div className="text-sm space-y-1">
                      <p><span className="text-gray-500 dark:text-dark-text-muted">Profil:</span> {connectionStatus.profile?.name}</p>
                      <p><span className="text-gray-500 dark:text-dark-text-muted">Email:</span> {connectionStatus.profile?.email}</p>
                      <p><span className="text-gray-500 dark:text-dark-text-muted">Mode:</span> {connectionStatus.profile?.mode}</p>
                      <p><span className="text-gray-500 dark:text-dark-text-muted">Statut:</span> {connectionStatus.profile?.status}</p>
                    </div>

                    {connectionStatus.availableMethods && connectionStatus.availableMethods.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-2">Methodes disponibles:</p>
                        <div className="flex flex-wrap gap-2">
                          {connectionStatus.availableMethods.map(method => (
                            <span
                              key={method.id}
                              className="px-2 py-1 bg-gray-100 dark:bg-dark-bg-tertiary rounded text-xs"
                            >
                              {method.description}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : connectionStatus?.error ? (
                  <div className="text-red-600 dark:text-red-400 text-sm">
                    <p className="font-medium">Connexion echouee</p>
                    <p>{connectionStatus.error}</p>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-dark-text-muted text-sm">
                    Cliquez sur "Tester la Connexion" pour verifier l'API
                  </p>
                )}

                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
                >
                  {isTestingConnection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Tester la Connexion
                </button>
              </div>
            </div>

            {/* Payment Form */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <div className="p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Creer un Paiement
                </h2>
              </div>

              <div className="p-4 space-y-4">
                {/* Environment Warning */}
                {environment === 'sandbox' && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Mode Sandbox - Aucune transaction reelle
                    </p>
                  </div>
                )}

                {environment === 'production' && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Mode Production - Transactions reelles!
                    </p>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Montant (EUR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="25.00"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="Description du paiement"
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Methode de Paiement
                  </label>
                  <select
                    value={paymentMethod || ''}
                    onChange={(e) => setPaymentMethod(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  >
                    <option value="">Choix du client</option>
                    <option value="bancontact">Bancontact</option>
                    <option value="kbc">KBC/CBC Payment Button</option>
                    <option value="belfius">Belfius Direct Net</option>
                    <option value="creditcard">Cartes de credit/debit</option>
                    <option value="applepay">Apple Pay</option>
                  </select>
                </div>

                {/* Customer Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Email Client (optionnel)
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="client@example.com"
                  />
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleCreatePayment}
                  disabled={isLoading || !connectionStatus?.connected}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Creation en cours...
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" />
                      Creer le Paiement
                    </>
                  )}
                </button>

                {!connectionStatus?.connected && (
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted text-center">
                    Testez d'abord la connexion API
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Middle Column - Payment History */}
          <div className="space-y-6">
            {/* Current Payment */}
            {currentPayment && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-orange-200 dark:border-orange-800">
                <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-orange-50 dark:bg-orange-900/20 rounded-t-xl">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Paiement Actuel
                  </h2>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">ID Interne:</span>
                    <div className="flex items-center gap-1">
                      <code className="text-xs font-mono bg-gray-100 dark:bg-dark-bg-tertiary px-2 py-1 rounded">
                        {currentPayment.id.substring(0, 20)}...
                      </code>
                      <button
                        onClick={() => copyToClipboard(currentPayment.id)}
                        className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {currentPayment.molliePaymentId && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Mollie ID:</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono bg-gray-100 dark:bg-dark-bg-tertiary px-2 py-1 rounded">
                          {currentPayment.molliePaymentId}
                        </code>
                        <button
                          onClick={() => copyToClipboard(currentPayment.molliePaymentId!)}
                          className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Montant:</span>
                    <span className="font-semibold">
                      {currentPayment.amount.toFixed(2)} {currentPayment.currency}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Statut:</span>
                    {getStatusBadge(currentPayment.status)}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleCheckStatus(currentPayment)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors text-sm"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Verifier le Statut
                    </button>

                    {currentPayment.paymentUrl && (
                      <a
                        href={currentPayment.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Checkout
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Payment History */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <div className="p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Historique des Paiements
                </h2>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                  Depuis Firestore (max 50)
                </p>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-dark-border max-h-[600px] overflow-y-auto">
                {isLoadingPayments ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-orange-600 mb-2" />
                    <p className="text-gray-500 dark:text-dark-text-muted">Chargement...</p>
                  </div>
                ) : payments.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-dark-text-muted">
                    Aucun paiement
                  </div>
                ) : (
                  payments.map((payment) => (
                    <div
                      key={payment.id}
                      className={`p-4 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors cursor-pointer ${
                        currentPayment?.id === payment.id ? 'bg-orange-50 dark:bg-orange-900/10' : ''
                      }`}
                      onClick={() => setCurrentPayment(payment)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
                            {payment.molliePaymentId || payment.id.substring(0, 12)}...
                          </code>
                          {payment.environment === 'sandbox' && (
                            <span className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded">
                              TEST
                            </span>
                          )}
                        </div>
                        {getStatusBadge(payment.status)}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-dark-text-primary">
                          {payment.amount.toFixed(2)} {payment.currency}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckStatus(payment);
                          }}
                          className="text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400"
                        >
                          Verifier le statut
                        </button>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1 truncate">
                        {payment.description}
                      </p>

                      {payment.method && (
                        <p className="text-[10px] text-gray-400 dark:text-dark-text-muted mt-1">
                          {MolliePaymentService.getMethodLabel(payment.method)}
                        </p>
                      )}

                      <p className="text-[10px] text-gray-400 dark:text-dark-text-muted mt-1">
                        {payment.createdAt instanceof Date
                          ? payment.createdAt.toLocaleString('fr-BE')
                          : new Date(payment.createdAt as any).toLocaleString('fr-BE')
                        }
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Logs */}
          <div className="space-y-6">
            {/* API Logs */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="w-full p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between"
              >
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Logs API
                  <span className="text-xs font-normal text-gray-500 dark:text-dark-text-muted">
                    ({logs.length} entries)
                  </span>
                </h2>
                {showLogs ? (
                  <ChevronUp className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                )}
              </button>

              {showLogs && (
                <div className="p-4">
                  <div className="bg-gray-900 rounded-lg p-4 h-[500px] overflow-y-auto font-mono text-xs">
                    {logs.length === 0 ? (
                      <p className="text-gray-500 dark:text-dark-text-muted">En attente de logs...</p>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="mb-3">
                          <div>
                            <span className="text-gray-500 dark:text-dark-text-muted">[{log.timestamp}]</span>{' '}
                            <span
                              className={
                                log.type === 'error'
                                  ? 'text-red-400'
                                  : log.type === 'request'
                                  ? 'text-blue-400'
                                  : log.type === 'response'
                                  ? 'text-cyan-400'
                                  : log.type === 'success'
                                  ? 'text-green-400'
                                  : 'text-yellow-400'
                              }
                            >
                              [{log.type.toUpperCase()}]
                            </span>{' '}
                            <span className="text-gray-300">{log.message}</span>
                          </div>
                          {log.data && (
                            <pre className="text-gray-500 dark:text-dark-text-muted mt-1 ml-4 whitespace-pre-wrap overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>

                  <button
                    onClick={clearLogs}
                    className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-gray-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    Effacer les logs
                  </button>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <h3 className="font-medium text-orange-800 dark:text-orange-300 mb-2">
                A propos de Mollie
              </h3>
              <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1 list-disc list-inside">
                <li>Bancontact - Le plus utilise en Belgique</li>
                <li>KBC/CBC - Banque belge populaire</li>
                <li>Belfius - Banque belge</li>
                <li>Cartes de credit - Visa, Mastercard</li>
                <li>Apple Pay - Paiement mobile</li>
                <li>Google Pay - Paiement mobile</li>
              </ul>
              <a
                href="https://docs.mollie.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-orange-600 hover:text-orange-800 dark:text-orange-400"
              >
                Documentation Mollie
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Mollie Account Info */}
            <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg border border-gray-200 dark:border-dark-border">
              <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                Compte Mollie
              </h3>
              <div className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted space-y-1">
                <p><span className="text-gray-500 dark:text-dark-text-muted">Profile ID:</span> pfl_7q2dbDLGu9</p>
                <p><span className="text-gray-500 dark:text-dark-text-muted">Website:</span> calypsodiving.be</p>
                <p><span className="text-gray-500 dark:text-dark-text-muted">Organisation:</span> Calypso Diving Club VZW</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

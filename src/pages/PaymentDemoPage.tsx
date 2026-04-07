import React, { useState, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useNavigate } from 'react-router-dom';
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
  Banknote,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { formatIBAN, cleanIBAN, isValidIBANFormat } from '@/utils/fieldMapper';
import { useAuth } from '@/contexts/AuthContext';
import { NodaPaymentService, NodaPayment } from '@/services/nodaPaymentService';
import toast from 'react-hot-toast';

interface LogEntry {
  timestamp: string;
  type: 'request' | 'response' | 'error' | 'info';
  message: string;
  data?: any;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  createdAt: Date;
  paymentUrl?: string;
  direction: 'incoming' | 'outgoing';
  customerIban?: string;
  environment?: 'sandbox' | 'production';
}

export function PaymentDemoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Environment
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');

  // Form fields
  const [amount, setAmount] = useState('10.00');
  const [currency, setCurrency] = useState('EUR');
  const [description, setDescription] = useState('Test payment from CalyCompta');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [customerIban, setCustomerIban] = useState('');
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');

  // Club IBAN (Calypso)
  const CLUB_IBAN = 'BE68 0688 9376 3453'; // IBAN Calypso

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);

  // Club ID (from user context or default)
  const clubId = user?.clubId || 'calypso';

  // Load payments from Firestore on mount
  useEffect(() => {
    const loadPayments = async () => {
      try {
        setIsLoadingPayments(true);
        const firestorePayments = await NodaPaymentService.getRecentPayments(clubId, 50);
        const mappedPayments: Payment[] = firestorePayments.map(p => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          description: p.description,
          createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(),
          paymentUrl: p.paymentUrl,
          direction: p.direction,
          customerIban: p.customerIban,
          environment: p.environment
        }));
        setPayments(mappedPayments);
      } catch (error) {
        logger.error('Error loading payments:', error);
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
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      type,
      message,
      data
    };
    setLogs(prev => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  const handleCreatePayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Veuillez entrer un montant valide');
      return;
    }

    // Validate IBAN if provided
    if (customerIban && !isValidIBANFormat(customerIban)) {
      toast.error('Format IBAN invalide');
      return;
    }

    setIsLoading(true);
    clearLogs();

    try {
      const directionLabel = direction === 'incoming'
        ? 'Client -> Club (encaissement)'
        : 'Club -> Client (remboursement)';
      addLog('info', `Creating ${directionLabel} payment in ${environment.toUpperCase()} mode...`);

      const payload = {
        amount: parseFloat(amount),
        currency,
        description,
        customerEmail,
        customerIban: cleanIBAN(customerIban),
        direction,
        // For incoming: customer pays to club IBAN
        // For outgoing: club pays to customer IBAN
        sourceIban: direction === 'outgoing' ? cleanIBAN(CLUB_IBAN) : cleanIBAN(customerIban),
        destinationIban: direction === 'outgoing' ? cleanIBAN(customerIban) : cleanIBAN(CLUB_IBAN),
        environment,
        returnUrl: `${window.location.origin}/parametres/paiements?status=success`,
        failureUrl: `${window.location.origin}/parametres/paiements?status=failed`
      };

      addLog('request', 'POST /api/noda/create-payment', payload);

      const response = await fetch('/api/noda/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Payment creation failed');
      }

      addLog('response', `Payment created: ${data.paymentId}`, data);

      // Save to Firestore
      addLog('info', 'Saving payment to Firestore...');
      const nodaPayment: Omit<NodaPayment, 'createdAt' | 'updatedAt'> = {
        id: data.paymentId,
        nodaPaymentId: data.nodaPaymentId,
        amount: parseFloat(amount),
        currency,
        description,
        direction,
        customerEmail: customerEmail || undefined,
        customerIban: cleanIBAN(customerIban) || undefined,
        sourceIban: direction === 'outgoing' ? cleanIBAN(CLUB_IBAN) : cleanIBAN(customerIban) || undefined,
        destinationIban: direction === 'outgoing' ? cleanIBAN(customerIban) || undefined : cleanIBAN(CLUB_IBAN),
        status: 'pending',
        paymentUrl: data.paymentUrl,
        environment
      };

      await NodaPaymentService.createPayment(clubId, nodaPayment);
      addLog('info', 'Payment saved to Firestore');

      const payment: Payment = {
        id: data.paymentId,
        amount: parseFloat(amount),
        currency,
        status: 'pending',
        description,
        createdAt: new Date(),
        paymentUrl: data.paymentUrl,
        direction,
        customerIban: cleanIBAN(customerIban),
        environment
      };

      setCurrentPayment(payment);
      setPayments(prev => [payment, ...prev]);

      toast.success('Paiement cree et sauvegarde!');

      // Auto-open payment URL if sandbox
      if (environment === 'sandbox' && data.paymentUrl) {
        addLog('info', 'Opening payment page...');
        window.open(data.paymentUrl, '_blank');
      }

    } catch (error: any) {
      addLog('error', error.message);
      toast.error(error.message || 'Erreur lors de la creation du paiement');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async (paymentId: string) => {
    addLog('info', `Checking status for payment ${paymentId}...`);

    try {
      addLog('request', `GET /api/noda/payment-status?paymentId=${paymentId}&environment=${environment}`);

      const response = await fetch(`/api/noda/payment-status?paymentId=${paymentId}&environment=${environment}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get payment status');
      }

      addLog('response', `Status: ${data.status}`, data);

      // Update payment in Firestore
      try {
        await NodaPaymentService.updatePaymentStatus(clubId, paymentId, data.status);
        addLog('info', 'Status updated in Firestore');
      } catch (err) {
        logger.error('Error updating status in Firestore:', err);
      }

      // Update payment in list
      setPayments(prev => prev.map(p =>
        p.id === paymentId ? { ...p, status: data.status } : p
      ));

      if (currentPayment?.id === paymentId) {
        setCurrentPayment(prev => prev ? { ...prev, status: data.status } : null);
      }

      toast.success(`Statut: ${data.status}`);

    } catch (error: any) {
      addLog('error', error.message);
      toast.error(error.message || 'Erreur lors de la verification');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <Check className="h-3 w-3" />
            Completed
          </span>
        );
      case 'failed':
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <X className="h-3 w-3" />
            Failed
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800 dark:bg-gray-900/30 dark:text-dark-text-muted">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-6xl mx-auto">
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
                <CreditCard className="h-8 w-8 text-purple-600" />
                Demo Paiements - Noda
              </h1>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
                Testez l'integration Open Banking avec Noda
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Payment Form */}
          <div className="space-y-6">
            {/* Payment Form */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <div className="p-6 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Creer un Paiement
                </h2>
              </div>

              <div className="p-6 space-y-4">
                {/* Environment Warning */}
                {environment === 'sandbox' && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Mode Sandbox - Utilisez des donnees de test
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

                {/* Payment Direction */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Direction du Paiement
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDirection('incoming')}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                        direction === 'incoming'
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border'
                      }`}
                    >
                      <ArrowDownLeft className="h-5 w-5" />
                      <div className="text-left">
                        <div className="font-medium text-sm">Encaissement</div>
                        <div className="text-xs opacity-75">Client → Club</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('outgoing')}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                        direction === 'outgoing'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border'
                      }`}
                    >
                      <ArrowUpRight className="h-5 w-5" />
                      <div className="text-left">
                        <div className="font-medium text-sm">Remboursement</div>
                        <div className="text-xs opacity-75">Club → Client</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Amount & Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Montant
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                      placeholder="10.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Devise
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    >
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="PLN">PLN</option>
                    </select>
                  </div>
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
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="Description du paiement"
                  />
                </div>

                {/* Customer Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Email Client
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="client@example.com"
                  />
                </div>

                {/* Customer IBAN */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    IBAN Client
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-dark-text-muted">
                      {direction === 'incoming' ? '(source)' : '(destination)'}
                    </span>
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                    <input
                      type="text"
                      value={formatIBAN(customerIban)}
                      onChange={(e) => setCustomerIban(cleanIBAN(e.target.value))}
                      className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary font-mono text-sm"
                      placeholder="BE12 3456 7890 1234"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                    IBAN Club: {CLUB_IBAN}
                  </p>
                </div>

                {/* Summary */}
                <div className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg border border-gray-200 dark:border-dark-border">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
                    {direction === 'incoming' ? (
                      <>
                        <span className="font-medium text-green-600">Encaissement:</span>{' '}
                        {customerIban ? formatIBAN(customerIban) : 'IBAN Client'} → {CLUB_IBAN}
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-blue-600">Remboursement:</span>{' '}
                        {CLUB_IBAN} → {customerIban ? formatIBAN(customerIban) : 'IBAN Client'}
                      </>
                    )}
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleCreatePayment}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              </div>
            </div>

            {/* Current Payment */}
            {currentPayment && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
                <div className="p-6 border-b border-gray-200 dark:border-dark-border">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Paiement Actuel
                  </h2>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">ID:</span>
                    <code className="text-sm font-mono bg-gray-100 dark:bg-dark-bg-tertiary px-2 py-1 rounded">
                      {currentPayment.id}
                    </code>
                  </div>

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

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCheckStatus(currentPayment.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Verifier Statut
                    </button>

                    {currentPayment.paymentUrl && (
                      <a
                        href={currentPayment.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ouvrir Page
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - History first, then Logs */}
          <div className="space-y-6">
            {/* Payment History - Moved to top with more height */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <div className="p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Historique des Paiements
                </h2>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                  Sauvegarde dans Firestore
                </p>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-dark-border max-h-[500px] overflow-y-auto">
                {isLoadingPayments ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-600 mb-2" />
                    <p className="text-gray-500 dark:text-dark-text-muted">Chargement...</p>
                  </div>
                ) : payments.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-dark-text-muted">
                    Aucun paiement cree
                  </div>
                ) : (
                  payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
                            {payment.id.substring(0, 12)}...
                          </code>
                          {payment.direction === 'incoming' ? (
                            <ArrowDownLeft className="h-3 w-3 text-green-500" title="Encaissement" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3 text-blue-500" title="Remboursement" />
                          )}
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
                          onClick={() => handleCheckStatus(payment.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          Verifier
                        </button>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        {payment.description}
                      </p>

                      <p className="text-[10px] text-gray-400 dark:text-dark-text-muted mt-1">
                        {payment.createdAt instanceof Date
                          ? payment.createdAt.toLocaleString('fr-BE')
                          : new Date(payment.createdAt).toLocaleString('fr-BE')
                        }
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* API Logs - Collapsible */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="w-full p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between"
              >
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Logs API
                </h2>
                {showLogs ? (
                  <ChevronUp className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                )}
              </button>

              {showLogs && (
                <div className="p-4">
                  <div className="bg-gray-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs">
                    {logs.length === 0 ? (
                      <p className="text-gray-500 dark:text-dark-text-muted">En attente des logs...</p>
                    ) : (
                      logs.map((log, index) => (
                        <div key={index} className="mb-2">
                          <span className="text-gray-500 dark:text-dark-text-muted">[{log.timestamp}]</span>{' '}
                          <span
                            className={
                              log.type === 'error'
                                ? 'text-red-400'
                                : log.type === 'request'
                                ? 'text-blue-400'
                                : log.type === 'response'
                                ? 'text-green-400'
                                : 'text-yellow-400'
                            }
                          >
                            [{log.type.toUpperCase()}]
                          </span>{' '}
                          <span className="text-gray-300">{log.message}</span>
                          {log.data && (
                            <pre className="text-gray-500 dark:text-dark-text-muted mt-1 ml-4 whitespace-pre-wrap">
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
                    className="mt-2 text-sm text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-gray-300"
                  >
                    Effacer les logs
                  </button>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <h3 className="font-medium text-purple-800 dark:text-purple-300 mb-2">
                A propos de Noda Open Banking
              </h3>
              <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1 list-disc list-inside">
                <li>Paiements bancaires directs sans carte</li>
                <li>Frais reduits vs cartes de credit</li>
                <li>Confirmation instantanee</li>
                <li>Securise par authentification bancaire</li>
              </ul>
              <a
                href="https://noda.live"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400"
              >
                En savoir plus sur Noda
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Send,
  Mail,
  Search,
  Calendar as CalendarIcon,
  CheckCircle,
  AlertCircle,
  Clock,
  Bot,
  User,
  Filter,
  Loader,
  Eye
} from 'lucide-react';
import { EmailHistoryEntry, EmailStatus, EmailSendType } from '@/types/emailHistory';
import { EmailHistoryDetailView } from '@/components/communication/EmailHistoryDetailView';
import { formatDate } from '@/utils/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getEmailHistory } from '@/services/emailHistoryService';
import toast from 'react-hot-toast';

export function EmailHistoryPage() {
  const navigate = useNavigate();
  const { clubId } = useAuth();
  const [selectedEmail, setSelectedEmail] = useState<EmailHistoryEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmailStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<EmailSendType | 'all'>('all');
  const [emails, setEmails] = useState<EmailHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load email history
  useEffect(() => {
    if (!clubId) return;

    const loadEmails = async () => {
      try {
        setLoading(true);
        const data = await getEmailHistory(clubId);
        setEmails(data);
      } catch (error) {
        console.error('Error loading email history:', error);
        toast.error('Erreur lors du chargement de l\'historique des emails');
      } finally {
        setLoading(false);
      }
    };

    loadEmails();
  }, [clubId]);

  // Filtered emails
  const filteredEmails = emails.filter((email) => {
    const matchesSearch =
      searchTerm === '' ||
      email.recipientEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.recipientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || email.status === statusFilter;
    const matchesType = typeFilter === 'all' || email.sendType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Status badge
  const getStatusBadge = (status: EmailStatus) => {
    switch (status) {
      case 'sent':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
            <CheckCircle className="h-3 w-3" />
            Envoyé
          </div>
        );
      case 'failed':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
            <AlertCircle className="h-3 w-3" />
            Échec
          </div>
        );
      case 'pending':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-medium">
            <Clock className="h-3 w-3" />
            En attente
          </div>
        );
    }
  };

  // Send type icon
  const getSendTypeIcon = (sendType: EmailSendType) => {
    return sendType === 'automated' ? (
      <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" title="Automatique" />
    ) : (
      <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" title="Manuel" />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header with breadcrumb */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
            <button
              onClick={() => navigate('/parametres')}
              className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
            >
              Paramètres
            </button>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <button
              onClick={() => navigate('/parametres/communication')}
              className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
            >
              Communication
            </button>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span className="text-gray-900 dark:text-dark-text-primary font-medium">
              Emails Sortants
            </span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-3">
            <Send className="h-8 w-8" />
            Emails Sortants
          </h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
            Historique de tous les emails envoyés (manuels et automatiques)
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par destinataire, objet..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as EmailStatus | 'all')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent"
              >
                <option value="all">Tous les statuts</option>
                <option value="sent">Envoyés</option>
                <option value="failed">Échecs</option>
                <option value="pending">En attente</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as EmailSendType | 'all')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent"
              >
                <option value="all">Tous les types</option>
                <option value="manual">Manuels</option>
                <option value="automated">Automatiques</option>
              </select>
            </div>
          </div>
        </div>

        {/* Email List */}
        {loading ? (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-12 text-center">
            <Loader className="h-16 w-16 text-calypso-blue dark:text-calypso-aqua mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
              Chargement de l'historique...
            </h3>
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-12 text-center">
            <Mail className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
              Aucun email envoyé
            </h3>
            <p className="text-gray-600 dark:text-dark-text-secondary">
              L'historique des emails apparaîtra ici une fois que vous aurez envoyé des emails.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Heure
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Destinataire
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {filteredEmails.map((email) => (
                  <tr
                    key={email.id}
                    className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getSendTypeIcon(email.sendType)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-dark-text-primary">
                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                        {formatDate(email.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-dark-text-primary">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {email.createdAt.toDate?.().toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        }) || new Date(email.createdAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        {email.recipientName && (
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {email.recipientName}
                          </div>
                        )}
                        <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          {email.recipientEmail}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(email.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedEmail(email)}
                        className="inline-flex items-center justify-center p-2 text-gray-600 dark:text-dark-text-secondary hover:text-calypso-blue dark:hover:text-calypso-aqua hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                        aria-label="Voir les détails"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedEmail && (
        <EmailHistoryDetailView
          email={selectedEmail}
          isOpen={!!selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      )}
    </div>
  );
}

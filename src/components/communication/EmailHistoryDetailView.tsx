import React, { useState } from 'react';
import {
  X,
  Mail,
  User,
  Calendar,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  FileText,
  Eye,
  Bot
} from 'lucide-react';
import { EmailHistoryEntry } from '@/types/emailHistory';
import { formatDate } from '@/utils/utils';

interface EmailHistoryDetailViewProps {
  email: EmailHistoryEntry;
  isOpen: boolean;
  onClose: () => void;
}

export function EmailHistoryDetailView({
  email,
  isOpen,
  onClose
}: EmailHistoryDetailViewProps) {
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen) return null;

  // Status icon and color
  const getStatusInfo = () => {
    switch (email.status) {
      case 'sent':
        return {
          icon: <CheckCircle className="h-5 w-5" />,
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-100 dark:bg-green-900/30',
          label: 'Envoyé'
        };
      case 'failed':
        return {
          icon: <AlertCircle className="h-5 w-5" />,
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-100 dark:bg-red-900/30',
          label: 'Échec'
        };
      case 'pending':
        return {
          icon: <Clock className="h-5 w-5" />,
          color: 'text-yellow-600 dark:text-yellow-400',
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          label: 'En attente'
        };
    }
  };

  const statusInfo = getStatusInfo();

  // Send type badge
  const sendTypeBadge = email.sendType === 'automated' ? (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
      <Bot className="h-3 w-3" />
      Automatique
    </div>
  ) : (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
      <Send className="h-3 w-3" />
      Manuel
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
              <Mail className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                Détails de l'Email
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {sendTypeBadge}
                <div className={`inline-flex items-center gap-1 px-2 py-1 ${statusInfo.bg} ${statusInfo.color} rounded-full text-xs font-medium`}>
                  {statusInfo.icon}
                  {statusInfo.label}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-dark-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Recipient Info */}
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-secondary uppercase tracking-wide">
              Destinataire
            </h3>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                {email.recipientName && (
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {email.recipientName}
                  </p>
                )}
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  {email.recipientEmail}
                </p>
              </div>
            </div>
          </div>

          {/* Email Details */}
          <div className="space-y-4">
            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                Objet
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                <p className="text-gray-900 dark:text-dark-text-primary">
                  {email.subject}
                </p>
              </div>
            </div>

            {/* Template Info */}
            {email.templateName && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  <FileText className="h-4 w-4 inline mr-1" />
                  Template utilisé
                </label>
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-gray-900 dark:text-dark-text-primary">
                    {email.templateName}
                  </p>
                  {email.templateType && (
                    <p className="text-xs text-gray-500 dark:text-dark-text-tertiary mt-1">
                      Type: {email.templateType}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Sender Info (for manual emails) */}
            {email.sendType === 'manual' && email.sentByName && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Envoyé par
                </label>
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-gray-900 dark:text-dark-text-primary">
                    {email.sentByName}
                  </p>
                </div>
              </div>
            )}

            {/* Job Info (for automated emails) */}
            {email.sendType === 'automated' && email.jobName && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Job planifié
                </label>
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-gray-900 dark:text-dark-text-primary">
                    {email.jobName}
                  </p>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Créé le
                </label>
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-gray-900 dark:text-dark-text-primary">
                    {formatDate(email.createdAt)}
                  </p>
                </div>
              </div>
              {email.sentAt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                    <Send className="h-4 w-4 inline mr-1" />
                    Envoyé le
                  </label>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-sm text-gray-900 dark:text-dark-text-primary">
                      {formatDate(email.sentAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message (if failed) */}
            {email.status === 'failed' && email.statusMessage && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-900 dark:text-red-300 mb-1">
                      Erreur d'envoi
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-400">
                      {email.statusMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview Button */}
          <div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Eye className="h-5 w-5" />
              {showPreview ? 'Masquer l\'aperçu' : 'Aperçu du contenu'}
            </button>
          </div>

          {/* Email Preview */}
          {showPreview && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                Contenu de l'email
              </label>
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <iframe
                  srcDoc={email.htmlContent}
                  className="w-full h-[600px] bg-white"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

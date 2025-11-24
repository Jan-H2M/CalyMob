import React, { useState, useEffect } from 'react';
import { X, Mail, Send, Eye, EyeOff, Loader } from 'lucide-react';
import { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { EmailTemplate, EmailTemplateType } from '@/types/emailTemplates';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateDefaultPassword } from '@/utils/passwordGenerator';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import Handlebars from 'handlebars';
import toast from 'react-hot-toast';

interface SendUserEmailModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSend: (templateType: EmailTemplateType, templateId: string, password: string) => Promise<void>;
}

export function SendUserEmailModal({
  user,
  isOpen,
  onClose,
  onSend
}: SendUserEmailModalProps) {
  const { appUser, clubId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateType, setSelectedTemplateType] = useState<EmailTemplateType>('account_activated');
  const [temporaryPassword, setTemporaryPassword] = useState(generateDefaultPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [clubSettings, setClubSettings] = useState<any>(null);

  // Load club settings
  useEffect(() => {
    if (!clubId) return;

    const loadClubSettings = async () => {
      try {
        const settings = await FirebaseSettingsService.loadGeneralSettings(clubId);
        setClubSettings(settings);
      } catch (error) {
        console.error('Error loading club settings:', error);
      }
    };

    loadClubSettings();
  }, [clubId]);

  // Load templates from Firestore
  useEffect(() => {
    if (!isOpen || !clubId) return;

    const loadTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const templatesRef = collection(db, 'clubs', clubId, 'email_templates');
        const q = query(
          templatesRef,
          where('emailType', 'in', ['account_activated', 'password_reset']),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        const loadedTemplates: EmailTemplate[] = [];

        snapshot.forEach((doc) => {
          loadedTemplates.push({
            id: doc.id,
            ...doc.data()
          } as EmailTemplate);
        });

        setTemplates(loadedTemplates);
      } catch (error) {
        console.error('Error loading templates:', error);
        toast.error('Erreur lors du chargement des templates');
      } finally {
        setLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, [isOpen, clubId]);

  // Get selected template
  const selectedTemplate = templates.find(t => t.emailType === selectedTemplateType);

  // Generate preview when template or password changes
  useEffect(() => {
    if (!selectedTemplate || !clubSettings) return;

    try {
      const template = Handlebars.compile(selectedTemplate.htmlContent);
      const data = {
        recipientName: `${user.prenom} ${user.nom}`.trim() || user.email,
        firstName: user.prenom || '',
        lastName: user.nom || '',
        email: user.email,
        temporaryPassword,
        clubName: clubSettings.clubName || 'Calypso Diving Club',
        logoUrl: clubSettings.logoUrl || '',
        appUrl: window.location.origin,
        // Inject style variables
        ...selectedTemplate.styles,
      };

      const rendered = template(data);
      setPreviewHtml(rendered);
    } catch (error) {
      console.error('Error rendering preview:', error);
      setPreviewHtml('<p>Erreur lors de la génération de l\'aperçu</p>');
    }
  }, [selectedTemplate, temporaryPassword, user, clubSettings]);

  const handleSend = async () => {
    if (!selectedTemplate) {
      toast.error('Aucun template sélectionné');
      return;
    }

    if (!temporaryPassword.trim()) {
      toast.error('Le mot de passe temporaire est requis');
      return;
    }

    try {
      setLoading(true);
      await onSend(selectedTemplateType, selectedTemplate.id, temporaryPassword);
      toast.success('Email envoyé avec succès !');
      onClose();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error(error.message || 'Erreur lors de l\'envoi de l\'email');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                    Envoyer un Email à {user.prenom} {user.nom}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={loading}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-dark-text-secondary" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-calypso-blue" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <Mail className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                    Aucun template disponible
                  </h3>
                  <p className="text-gray-600 dark:text-dark-text-secondary">
                    Créez des templates dans la section Communication pour envoyer des emails.
                  </p>
                </div>
              ) : (
                <>
                  {/* Template Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                      Type d'email *
                    </label>
                    <select
                      value={selectedTemplateType}
                      onChange={(e) => setSelectedTemplateType(e.target.value as EmailTemplateType)}
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent"
                    >
                      <option value="account_activated">Compte activé</option>
                      <option value="password_reset">Mot de passe réinitialisé</option>
                    </select>
                    {selectedTemplate && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-tertiary">
                        Template: {selectedTemplate.name}
                      </p>
                    )}
                  </div>

                  {/* Temporary Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                      Mot de passe temporaire *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={temporaryPassword}
                        onChange={(e) => setTemporaryPassword(e.target.value)}
                        disabled={loading}
                        className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent font-mono"
                        placeholder="CalyCompta2025-01"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-tertiary">
                      Format par défaut: CalyCompta{new Date().getFullYear()}-{String(new Date().getMonth() + 1).padStart(2, '0')}
                    </p>
                  </div>

                  {/* Preview Toggle */}
                  <div>
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      disabled={loading || !selectedTemplate}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      {showPreview ? (
                        <>
                          <EyeOff className="h-5 w-5" />
                          Masquer l'aperçu
                        </>
                      ) : (
                        <>
                          <Eye className="h-5 w-5" />
                          Aperçu de l'email
                        </>
                      )}
                    </button>
                  </div>

                  {/* Preview */}
                  {showPreview && selectedTemplate && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                        Aperçu
                      </label>
                      <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                        <iframe
                          srcDoc={previewHtml}
                          className="w-full h-[400px] bg-white"
                          title="Email Preview"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {templates.length > 0 && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || !selectedTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Envoyer l'Email
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

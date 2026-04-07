import { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import DOMPurify from 'dompurify';
import { toast } from 'react-hot-toast';
import { X, Search, Phone, Users, Send, Save, Mail, Reply } from 'lucide-react';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { BrandingService } from '@/services/brandingService';
import { ClubEmailService } from '@/services/clubEmailService';
import { getPhone } from '@/utils/fieldMapper';
import { ClubBranding, DEFAULT_BRANDING } from '@/types/branding';
import { auth } from '@/lib/firebase';
import {
  calculateSMSSegments,
  normalizePhoneNumber,
  replaceTemplateVariables,
  SMS_CONTEXT_VARIABLES,
  type SMSTemplate,
  type SMSTemplateContext,
  type SMSContextData,
  type MessagingChannel,
  type SMSSettings,
} from '@/types/sms';
import type { Membre } from '@/types';
import { RichTextEditor } from './RichTextEditor';
import { EditableEmailPreview } from './EditableEmailPreview';
import { listTemplates as listEmailTemplates, renderTemplate, renderTemplateWithZones, assembleEmailFromZones } from '@/services/emailTemplateService';
import type { EmailTemplate, EmailTemplateType, EditableZone } from '@/types/emailTemplates';

/**
 * Recipient group definition
 */
interface RecipientGroup {
  id: string;
  label: string;
  description: string;
  filter: (membre: Membre) => boolean;
}

/**
 * Available recipient groups
 */
const RECIPIENT_GROUPS: RecipientGroup[] = [
  {
    id: 'ca',
    label: 'CA',
    description: 'Comité d\'Administration',
    filter: (m) => m.clubStatuten?.some(s =>
      s.toLowerCase().includes('ca') ||
      s.toLowerCase().includes('comité')
    ) ?? false,
  },
  {
    id: 'encadrants',
    label: 'Encadrants',
    description: 'Moniteurs et encadrants',
    filter: (m) => m.clubStatuten?.some(s =>
      s.toLowerCase().includes('encadrant')
    ) ?? false,
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Administrateurs de l\'application',
    filter: (m) => m.app_role === 'admin' || m.app_role === 'superadmin',
  },
  {
    id: 'validateur',
    label: 'Validateur',
    description: 'Validateurs de dépenses',
    filter: (m) => m.app_role === 'validateur',
  },
];

/**
 * Props for CommunicationModal
 */
export interface CommunicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: SMSContextData;
  membres: Membre[];
  clubId: string;
  onSuccess?: (result: { sent: number; failed: number }) => void;
}

// Backward compatibility
export type SMSSenderModalProps = CommunicationModalProps;

/**
 * Get email address from membre
 */
function getEmail(membre: Membre): string | null {
  return membre.email || null;
}

/**
 * Wrap message content in a branded HTML email template
 * Uses club branding configuration for colors, logo and footer
 */
function wrapInEmailTemplate(content: string, branding: ClubBranding): string {
  const {
    clubName,
    logoUrl,
    headerGradient,
    primaryColor,
    footerText,
    websiteUrl,
  } = branding;

  // Use branding gradient or generate fallback
  const gradient = headerGradient || `linear-gradient(135deg, ${primaryColor} 0%, #004A6B 100%)`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <!-- Header -->
  <div style="background: ${gradient}; color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    ${logoUrl ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 180px; height: auto; margin-bottom: 15px;">` : ''}
    <h1 style="margin: 0; font-size: 20px; font-weight: 600;">${clubName}</h1>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <div style="font-size: 15px; white-space: pre-wrap;">${content}</div>
  </div>

  <!-- Footer -->
  <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
      ${footerText || `© ${new Date().getFullYear()} ${clubName}. Tous droits réservés.`}
    </p>
    ${websiteUrl ? `<p style="margin: 8px 0 0; font-size: 12px;"><a href="${websiteUrl}" style="color: ${primaryColor};">${websiteUrl}</a></p>` : ''}
  </div>
</body>
</html>
  `.trim();
}

function looksLikeFullEmailHtml(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.includes('<html') ||
    normalized.includes('<body')
  );
}

/**
 * Get raw phone number from membre using fieldMapper (for display)
 */
function getRawPhone(membre: Membre): string | null {
  return getPhone(membre);
}

/**
 * Get normalized phone number from membre (for sending)
 */
function getPhoneNumber(membre: Membre): string | null {
  const phone = getPhone(membre);
  if (!phone) return null;
  const normalized = normalizePhoneNumber(phone, '+32');
  // Debug: log if normalization fails
  if (!normalized && phone) {
    logger.debug(`Phone normalization failed for: "${phone}"`);
  }
  return normalized;
}

/**
 * Convert context data to variable map
 */
function contextToVariables(context: SMSContextData): Record<string, string | number | undefined> {
  const { type, ...rest } = context;
  // Convert all values to string or number for template replacement
  const variables: Record<string, string | number | undefined> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'object' && value !== null) {
      // Arrays/objects - serialize as JSON string if not already a string
      variables[key] = JSON.stringify(value);
    } else {
      variables[key] = value as string | number | undefined;
    }
  }
  return variables;
}

/**
 * Build data object for email template rendering with Handlebars
 * Converts context data to format expected by Handlebars templates
 */
function buildEmailTemplateData(
  context: SMSContextData,
  branding?: ClubBranding
): Record<string, unknown> {
  const { type, ...rest } = context;
  const data: Record<string, unknown> = { ...rest };

  if (!data.clubName && branding?.clubName) {
    data.clubName = branding.clubName;
  }
  if (!data.logoUrl && branding?.logoUrl) {
    data.logoUrl = branding.logoUrl;
  }
  if (!data.appUrl) {
    data.appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://calycompta.vercel.app';
  }

  if (type === 'demandes') {
    const recipientName = typeof data.nom === 'string' ? data.nom : '';
    data.recipientName = recipientName;
    data.firstName = recipientName.split(' ')[0] || '';
    data.dateDepense = data.date || '';
    data.description = data.description || '';
  }

  return data;
}

/**
 * Communication Modal Component
 * Supports SMS, WhatsApp, and Email channels
 */
export function CommunicationModal({
  isOpen,
  onClose,
  context,
  membres,
  clubId,
  onSuccess,
}: CommunicationModalProps) {
  // Templates state
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Recipients state
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Message state
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Save template state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Channel state - Email is the default and most used channel
  const [selectedChannel, setSelectedChannel] = useState<MessagingChannel>('email');
  const [smsSettings, setSmsSettings] = useState<SMSSettings | null>(null);

  // Email-specific state
  const [emailSubject, setEmailSubject] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [replyToName, setReplyToName] = useState('');

  // Branding state
  const [branding, setBranding] = useState<ClubBranding>(DEFAULT_BRANDING);

  // Email templates state (separate from SMS templates)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<string>('');
  const [loadingEmailTemplates, setLoadingEmailTemplates] = useState(false);

  // Editable zones state for hybrid template editing
  const [templateZones, setTemplateZones] = useState<EditableZone[]>([]);
  const [staticParts, setStaticParts] = useState<string[]>([]);

  // Get allowed email template types based on context
  // This ensures the dropdown only shows relevant templates for the current page
  const getAllowedEmailTypes = (): EmailTemplateType[] => {
    switch (context.type) {
      case 'demandes':
        // Expense/reimbursement requests + pending demands verification
        return ['expense_submitted', 'expense_approved', 'expense_reimbursed', 'pending_demands', 'custom'];
      case 'evenements':
        // Events/activities
        return ['events', 'custom'];
      case 'paiements':
      case 'transactions':
        // Bank transactions - use transactions template
        return ['transactions', 'custom'];
      case 'general':
      default:
        // General context - show all types
        return ['custom', 'expense_submitted', 'expense_approved', 'expense_reimbursed', 'events', 'transactions'];
    }
  };

  // Load templates, SMS settings and branding on mount
  useEffect(() => {
    if (isOpen && clubId) {
      loadTemplates();
      loadSmsSettings();
      loadBranding();

      // Set default reply-to to current user's email
      const currentUser = auth.currentUser;
      if (currentUser?.email) {
        setReplyToEmail(currentUser.email);
        setReplyToName(currentUser.displayName || '');
      }
    }
  }, [isOpen, clubId, context.type]);

  const loadSmsSettings = async () => {
    try {
      const settings = await FirebaseSettingsService.loadSMSSettings(clubId);
      setSmsSettings(settings);
    } catch (error) {
      logger.error('Error loading SMS settings:', error);
    }
  };

  const loadBranding = async () => {
    try {
      const loaded = await BrandingService.loadBranding(clubId);
      setBranding(loaded);
    } catch (error) {
      logger.error('Error loading branding:', error);
      // Use defaults on error
    }
  };

  // Apply default template when templates are loaded
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      const defaultTemplate = templates.find(t => t.isDefault);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
        applyTemplate(defaultTemplate);
      }
    }
  }, [templates]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      let loadedTemplates = await FirebaseSettingsService.loadSMSTemplates(clubId, context.type);

      // If no templates exist for this context, initialize defaults
      if (loadedTemplates.length === 0) {
        logger.debug(`No templates found for context "${context.type}", initializing defaults...`);
        await FirebaseSettingsService.initializeDefaultSMSTemplates(clubId);
        // Reload after initialization
        loadedTemplates = await FirebaseSettingsService.loadSMSTemplates(clubId, context.type);
      }

      setTemplates(loadedTemplates);
    } catch (error) {
      logger.error('Error loading templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Load email templates when channel switches to email
  const loadEmailTemplatesForChannel = async () => {
    if (!clubId) return;
    try {
      setLoadingEmailTemplates(true);
      const allTemplates = await listEmailTemplates(clubId);
      // Filter to only allowed types based on current context
      const allowedTypes = getAllowedEmailTypes();
      const filtered = allTemplates.filter(t => allowedTypes.includes(t.emailType));
      setEmailTemplates(filtered);
      logger.debug(`✅ [EmailTemplateService] Loaded ${filtered.length} templates for CommunicationModal (context: ${context.type})`);
    } catch (error) {
      logger.error('Error loading email templates:', error);
      setEmailTemplates([]);
    } finally {
      setLoadingEmailTemplates(false);
    }
  };

  // Load email templates when switching to email channel
  useEffect(() => {
    if (isOpen && clubId && selectedChannel === 'email') {
      loadEmailTemplatesForChannel();
    }
  }, [isOpen, clubId, selectedChannel]);

  const applyTemplate = (template: SMSTemplate) => {
    const variables = contextToVariables(context);
    const filledMessage = replaceTemplateVariables(template.template, variables);
    setMessage(filledMessage);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        applyTemplate(template);
      }
    }
  };

  // Handle zone content change for hybrid template editing
  const handleZoneChange = (zoneId: string, newContent: string) => {
    setTemplateZones(prev =>
      prev.map(zone =>
        zone.id === zoneId ? { ...zone, content: newContent } : zone
      )
    );
  };

  // Handle email template selection
  const handleEmailTemplateChange = (templateId: string) => {
    logger.debug('🔄 [handleEmailTemplateChange] templateId:', templateId);
    setSelectedEmailTemplateId(templateId);

    // Clear zones when no template selected
    if (!templateId) {
      setTemplateZones([]);
      setStaticParts([]);
      setMessage('');
      return;
    }

    const template = emailTemplates.find(t => t.id === templateId);
    logger.debug('📋 [handleEmailTemplateChange] Found template:', template?.name, 'emailType:', template?.emailType);

    if (template) {
      // Build data object for Handlebars rendering
      const data = buildEmailTemplateData(context, branding);

      // Override recipientName/firstName with the selected recipient if only one
      if (finalRecipients.length === 1) {
        data.recipientName = finalRecipients[0].name;
        data.firstName = finalRecipients[0].name.split(' ')[0] || '';
      }
      logger.debug('📦 [handleEmailTemplateChange] Data for rendering:', Object.keys(data));

      // Try to render with zones first (for hybrid templates)
      const zonesResult = renderTemplateWithZones(template, data);
      logger.debug('📧 [handleEmailTemplateChange] Zones result:', zonesResult.success, 'zones:', zonesResult.zones.length);

      if (zonesResult.success && zonesResult.zones.length > 0) {
        // Template has editable zones - use hybrid mode
        setTemplateZones(zonesResult.zones);
        setStaticParts(zonesResult.staticParts);
        setMessage(''); // Message not used in hybrid mode
        if (zonesResult.subject) {
          setEmailSubject(zonesResult.subject);
        }
        logger.debug('✅ [handleEmailTemplateChange] Using hybrid mode with', zonesResult.zones.length, 'zones');
      } else {
        // No zones - use regular rendering (read-only preview)
        setTemplateZones([]);
        setStaticParts([]);

        const result = renderTemplate(template, data);
        logger.debug('✅ [handleEmailTemplateChange] Render result:', result.success, 'html length:', result.html?.length || 0);

        if (result.success && result.html) {
          setMessage(result.html);
        } else {
          // Fallback to raw template if rendering fails
          logger.warn('Email template rendering failed:', result.error);
          setMessage(template.htmlContent);
        }

        // Subject rendering
        if (result.success && result.subject) {
          setEmailSubject(result.subject);
        } else if (template.subject) {
          // Fallback to simple replacement for subject
          const variables = contextToVariables(context);
          const filledSubject = replaceTemplateVariables(template.subject, variables);
          setEmailSubject(filledSubject);
        }
      }
    }
  };

  // Filter members with valid contact info based on selected channel
  const membersWithContact = useMemo(() => {
    return membres.filter(m => {
      const isActive = m.member_status === 'active' || m.app_status === 'active';
      if (!isActive) return false;

      if (selectedChannel === 'email') {
        return getEmail(m) !== null;
      } else {
        return getPhoneNumber(m) !== null;
      }
    });
  }, [membres, selectedChannel]);

  // Filtered members for search - search ALL members, show contact status
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return membres
      .filter(m => {
        const fullName = `${m.prenom || ''} ${m.nom || ''}`.toLowerCase();
        return fullName.includes(query);
      })
      .slice(0, 15); // Show more results
  }, [membres, searchQuery]);

  // Calculate final recipients based on selected channel
  const finalRecipients = useMemo(() => {
    const recipientMap = new Map<string, { id: string; name: string; phone: string; email: string }>();

    // Add members from selected groups
    selectedGroups.forEach(groupId => {
      const group = RECIPIENT_GROUPS.find(g => g.id === groupId);
      if (group) {
        membersWithContact.filter(group.filter).forEach(m => {
          if (!recipientMap.has(m.id)) {
            const phone = getPhoneNumber(m);
            const email = getEmail(m);

            // For email channel, require email. For SMS/WhatsApp, require phone.
            if (selectedChannel === 'email' ? email : phone) {
              recipientMap.set(m.id, {
                id: m.id,
                name: `${m.prenom || ''} ${m.nom || ''}`.trim(),
                phone: phone || '',
                email: email || '',
              });
            }
          }
        });
      }
    });

    // Add individually selected members
    selectedMemberIds.forEach(memberId => {
      const member = membres.find(m => m.id === memberId);
      if (member && !recipientMap.has(memberId)) {
        const phone = getPhoneNumber(member);
        const email = getEmail(member);

        // For email channel, require email. For SMS/WhatsApp, require phone.
        if (selectedChannel === 'email' ? email : phone) {
          recipientMap.set(memberId, {
            id: member.id,
            name: `${member.prenom || ''} ${member.nom || ''}`.trim(),
            phone: phone || '',
            email: email || '',
          });
        }
      }
    });

    return Array.from(recipientMap.values());
  }, [selectedGroups, selectedMemberIds, membersWithContact, membres, selectedChannel]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const addMember = (memberId: string) => {
    setSelectedMemberIds(prev => new Set([...prev, memberId]));
    setSearchQuery('');
  };

  const removeMember = (memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      next.delete(memberId);
      return next;
    });
  };

  const clearAllRecipients = () => {
    setSelectedGroups(new Set());
    setSelectedMemberIds(new Set());
  };

  // Get channel-specific label
  const getChannelLabel = (channel: MessagingChannel, plural = false) => {
    switch (channel) {
      case 'email':
        return plural ? 'emails' : 'email';
      case 'whatsapp':
        return plural ? 'WhatsApp' : 'WhatsApp';
      default:
        return plural ? 'SMS' : 'SMS';
    }
  };

  const handleSend = async () => {
    if (finalRecipients.length === 0) {
      toast.error('Veuillez sélectionner au moins un destinataire');
      return;
    }

    // For hybrid mode, check zones instead of message
    const hasZones = templateZones.length > 0;
    if (!hasZones && !message.trim()) {
      toast.error('Le message ne peut pas être vide');
      return;
    }

    // For email, require subject
    if (selectedChannel === 'email' && !emailSubject.trim()) {
      toast.error('Veuillez entrer un sujet pour l\'email');
      return;
    }

    try {
      setIsSending(true);

      let sent = 0;
      let failed = 0;

      if (selectedChannel === 'email') {
        // Determine email body: from zones or from message
        let emailContent: string;
        if (hasZones) {
          // Hybrid mode: assemble HTML from zones
          emailContent = assembleEmailFromZones(staticParts, templateZones);
          logger.debug('📧 [handleSend] Assembled email from zones, length:', emailContent.length);
        } else {
          emailContent = message.trim();
        }

        const hasSelectedEmailTemplate = Boolean(selectedEmailTemplateId);
        const selectedEmailTemplate = hasSelectedEmailTemplate
          ? emailTemplates.find((template) => template.id === selectedEmailTemplateId) || null
          : null;
        const useTemplateHtmlAsIs = hasSelectedEmailTemplate || looksLikeFullEmailHtml(emailContent);
        const htmlBody = useTemplateHtmlAsIs
          ? emailContent
          : wrapInEmailTemplate(emailContent, branding);
        const currentUser = auth.currentUser;
        const sentBy = currentUser?.uid;
        const sentByName = currentUser?.displayName || currentUser?.email || 'Utilisateur inconnu';

        logger.debug('📧 [handleSend] Email wrapper mode:', {
          hasSelectedEmailTemplate,
          hasZones,
          useTemplateHtmlAsIs,
          htmlLength: htmlBody.length,
        });

        for (const recipient of finalRecipients) {
          try {
            // Per-recipient personalization: replace recipientName/firstName with actual recipient
            const recipientFirstName = recipient.name.split(' ')[0] || '';
            const personalizedHtml = htmlBody
              .replace(/\{\{recipientName\}\}/g, recipient.name)
              .replace(/\{\{firstName\}\}/g, recipientFirstName);
            const personalizedSubject = emailSubject.trim()
              .replace(/\{\{recipientName\}\}/g, recipient.name)
              .replace(/\{\{firstName\}\}/g, recipientFirstName);

            const result = await ClubEmailService.sendEmail(
              clubId,
              recipient.email,
              personalizedSubject,
              personalizedHtml,
              undefined, // textBody
              replyToEmail || undefined,
              replyToName || undefined,
              {
                recipientName: recipient.name,
                recipientId: recipient.id,
                templateId: selectedEmailTemplate?.id,
                templateName: selectedEmailTemplate?.name,
                templateType: selectedEmailTemplate?.emailType,
                sendType: 'manual',
                sentBy,
                sentByName,
              }
            );

            if (result.success) {
              sent++;
            } else {
              logger.error(`Failed to send email to ${recipient.name}:`, result.message);
              failed++;
            }
          } catch (error) {
            logger.error(`Error sending email to ${recipient.name}:`, error);
            failed++;
          }
        }
      } else {
        // Send SMS/WhatsApp using existing API
        const { auth } = await import('@/lib/firebase');
        const user = auth.currentUser;
        if (!user) {
          throw new Error('User not authenticated');
        }
        const authToken = await user.getIdToken();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiBase = (import.meta as any).env?.PROD ? '' : 'https://caly-compta.vercel.app';

        for (const recipient of finalRecipients) {
          try {
            const response = await fetch(`${apiBase}/api/send-sms`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                clubId,
                to: recipient.phone,
                message: message.trim(),
                messageType: 'custom',
                recipientId: recipient.id,
                recipientName: recipient.name,
                sendType: 'manual',
                channel: selectedChannel,
                authToken,
              }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
              sent++;
            } else {
              logger.error(`Failed to send to ${recipient.name}:`, result.error);
              failed++;
            }
          } catch (error) {
            logger.error(`Error sending to ${recipient.name}:`, error);
            failed++;
          }
        }
      }

      if (sent > 0) {
        const channelName = getChannelLabel(selectedChannel);
        toast.success(`${sent} ${channelName} envoyé(s)${failed > 0 ? `, ${failed} échec(s)` : ''}`);
        onSuccess?.({ sent, failed });
        onClose();
      } else {
        toast.error(`Échec de l'envoi de tous les ${getChannelLabel(selectedChannel, true)}`);
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      toast.error(`Erreur: ${error instanceof Error ? error.message : 'Échec de l\'envoi'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Veuillez entrer un nom pour le modèle');
      return;
    }

    try {
      setSavingTemplate(true);

      // Convert the current message back to a template with variables
      // This is a simple approach - we keep the current message as-is
      await FirebaseSettingsService.saveSMSTemplate(clubId, {
        name: newTemplateName.trim(),
        description: `Créé depuis la fenêtre d'envoi SMS`,
        context: context.type as SMSTemplateContext,
        template: message,
        isActive: true,
        isDefault: false,
      });

      toast.success('Modèle sauvegardé');
      setShowSaveTemplate(false);
      setNewTemplateName('');
      loadTemplates();
    } catch (error) {
      logger.error('Error saving template:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Calculate message stats
  const segments = calculateSMSSegments(message);
  const estimatedCost = (segments * finalRecipients.length * 0.07).toFixed(2);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2">
            {selectedChannel === 'email' ? (
              <Mail className="w-5 h-5 text-orange-500" />
            ) : selectedChannel === 'whatsapp' ? (
              '💬'
            ) : (
              <Phone className="w-5 h-5 text-blue-500" />
            )}
            {selectedChannel === 'email'
              ? 'Envoyer un Email'
              : selectedChannel === 'whatsapp'
                ? 'Envoyer un WhatsApp'
                : 'Envoyer un SMS'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:text-dark-text-muted dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Channel Selector - Always visible when any channel is available */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded-xl">
            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
              Canal d'envoi
            </span>
            <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-600 rounded-lg p-1">
              {/* Email Button - primary channel, first position */}
              <button
                onClick={() => setSelectedChannel('email')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedChannel === 'email'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
              >
                ✉️ Email
              </button>

              {/* SMS Button */}
              <button
                onClick={() => setSelectedChannel('sms')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedChannel === 'sms'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
              >
                📱 SMS
              </button>
            </div>
          </div>

          {/* Recipients Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Destinataires
            </h3>

            {/* Group toggles */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">Groupes:</p>
              <div className="flex flex-wrap gap-2">
                {RECIPIENT_GROUPS.map(group => {
                  const count = membersWithContact.filter(group.filter).length;
                  const contactType = selectedChannel === 'email' ? 'email' : 'téléphone';
                  return (
                    <button
                      key={group.id}
                      onClick={() => toggleGroup(group.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selectedGroups.has(group.id)
                          ? selectedChannel === 'email'
                            ? 'bg-orange-500 text-white'
                            : selectedChannel === 'whatsapp'
                              ? 'bg-green-500 text-white'
                              : 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={`${group.description} (${count} membre(s) avec ${contactType})`}
                    >
                      {group.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Individual member search */}
            <div className="relative mb-3">
              <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">Membres individuels:</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un membre..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Search results dropdown */}
              {filteredMembers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-dark-border dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredMembers.map(member => {
                    const normalizedPhone = getPhoneNumber(member);
                    const rawPhone = getRawPhone(member);
                    const email = getEmail(member);
                    const hasValidContact = selectedChannel === 'email' ? email !== null : normalizedPhone !== null;

                    return (
                      <button
                        key={member.id}
                        onClick={() => hasValidContact && addMember(member.id)}
                        disabled={!hasValidContact}
                        className={`w-full px-4 py-2 text-left text-sm flex justify-between items-center ${
                          hasValidContact
                            ? 'hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-600 text-gray-900 dark:text-dark-text-primary dark:text-white cursor-pointer'
                            : 'text-gray-400 dark:text-dark-text-muted cursor-not-allowed bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-800'
                        }`}
                      >
                        <span>{member.prenom} {member.nom}</span>
                        {selectedChannel === 'email' ? (
                          email ? (
                            <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {email.length > 20 ? email.slice(0, 17) + '...' : email}
                            </span>
                          ) : (
                            <span className="text-xs text-red-400 dark:text-red-500">Pas d'email</span>
                          )
                        ) : (
                          normalizedPhone ? (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {normalizedPhone.slice(-4)}
                            </span>
                          ) : rawPhone ? (
                            <span className="text-xs text-orange-500" title={`Numéro invalide: ${rawPhone}`}>
                              Tel invalide
                            </span>
                          ) : (
                            <span className="text-xs text-red-400 dark:text-red-500">Pas de tel</span>
                          )
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected individual members */}
            {selectedMemberIds.size > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {Array.from(selectedMemberIds).map(memberId => {
                  const member = membres.find(m => m.id === memberId);
                  if (!member) return null;
                  const hasContact = selectedChannel === 'email'
                    ? getEmail(member) !== null
                    : getPhoneNumber(member) !== null;
                  const bgColor = selectedChannel === 'email'
                    ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                    : selectedChannel === 'whatsapp'
                      ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                      : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
                  return (
                    <span
                      key={memberId}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                        hasContact
                          ? bgColor
                          : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                      }`}
                      title={hasContact ? 'Contact valide' : 'Contact manquant'}
                    >
                      {member.prenom} {(member.nom || '').charAt(0)}.
                      {!hasContact && <span className="text-xs">(pas de contact)</span>}
                      <button
                        onClick={() => removeMember(memberId)}
                        className="hover:opacity-70"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
                <button
                  onClick={clearAllRecipients}
                  className="text-xs text-gray-500 dark:text-dark-text-muted hover:text-red-600 dark:text-dark-text-muted"
                >
                  Tout effacer
                </button>
              </div>
            )}

            {/* Recipients summary */}
            <div className="p-2 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded text-sm">
              <span className="text-gray-600 dark:text-dark-text-secondary dark:text-gray-300">
                {finalRecipients.length === 0 ? (
                  'Aucun destinataire sélectionné'
                ) : (
                  `${finalRecipients.length} destinataire(s) avec ${selectedChannel === 'email' ? 'email' : 'numéro'} valide`
                )}
              </span>
            </div>
          </div>

          {/* Message Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-3">
              Message
            </h3>

            {/* Email Subject - only for email channel */}
            {selectedChannel === 'email' && (
              <div className="mb-3">
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Sujet de l'email..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                />
              </div>
            )}

            {/* Reply-To - only for email channel */}
            {selectedChannel === 'email' && (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Reply className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                  <span className="text-xs text-gray-500 dark:text-dark-text-muted">Répondre à:</span>
                </div>
                <input
                  type="email"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                  placeholder="Email pour les réponses..."
                  className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-1">
                  Les réponses seront envoyées à cette adresse
                </p>
              </div>
            )}

            {/* Template selector - different for email vs SMS */}
            <div className="flex gap-2 mb-3">
              {selectedChannel === 'email' ? (
                // Email template selector
                <select
                  value={selectedEmailTemplateId}
                  onChange={(e) => handleEmailTemplateChange(e.target.value)}
                  disabled={loadingEmailTemplates}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                >
                  <option value="">-- Choisir un template email --</option>
                  {emailTemplates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.isDefault ? '(Défaut)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                // SMS template selector
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={loadingTemplates}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">-- Choisir un modèle SMS --</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.isDefault ? '(Défaut)' : ''}
                    </option>
                  ))}
                </select>
              )}
              {/* Save template button - only for SMS */}
              {selectedChannel !== 'email' && (
                <button
                  onClick={() => setShowSaveTemplate(true)}
                  disabled={!message.trim()}
                  className="px-3 py-2 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Sauvegarder comme modèle"
                >
                  <Save className="w-4 h-4" />
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">
              {selectedChannel === 'email'
                ? 'Sélectionnez un template ou écrivez un email personnalisé'
                : 'Sélectionnez un modèle ou écrivez un message personnalisé'}
            </p>

            {/* Message input - WYSIWYG for email, textarea for SMS */}
            {selectedChannel === 'email' ? (
              selectedEmailTemplateId && templateZones.length > 0 ? (
                // Hybrid mode: Template with editable zones
                <div>
                  <EditableEmailPreview
                    staticParts={staticParts}
                    zones={templateZones}
                    onZoneChange={handleZoneChange}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmailTemplateId('');
                      setTemplateZones([]);
                      setStaticParts([]);
                      setMessage('');
                    }}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    Écrire un email personnalisé
                  </button>
                </div>
              ) : selectedEmailTemplateId ? (
                // Read-only preview for templates without zones
                <div className="border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 px-3 py-2 border-b border-gray-300 dark:border-dark-border dark:border-gray-600 flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Aperçu du template (non modifiable)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmailTemplateId('');
                        setMessage('');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      Écrire un email personnalisé
                    </button>
                  </div>
                  <div
                    className="p-4 max-h-[400px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message) }}
                  />
                </div>
              ) : (
                // RichTextEditor for custom emails
                <RichTextEditor
                  content={message}
                  onChange={setMessage}
                  placeholder="Votre message ici..."
                  className="min-h-[200px]"
                />
              )
            ) : (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                placeholder="Calypso: Votre message ici..."
              />
            )}

            {/* Message stats - different for email vs SMS */}
            {selectedChannel !== 'email' && (
              <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
                <span>
                  {message.length} caractères | {segments} segment(s)
                </span>
                <span>
                  Coût estimé: ~{estimatedCost} EUR ({finalRecipients.length} {getChannelLabel(selectedChannel)})
                </span>
              </div>
            )}

            {/* Context variables info */}
            <div className="mt-3 p-2 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700/50 rounded text-xs">
              <span className="text-gray-500 dark:text-dark-text-muted">
                Variables utilisées:{' '}
                {SMS_CONTEXT_VARIABLES[context.type as SMSTemplateContext]?.map(v => (
                  <span key={v.key} className="font-mono">
                    {`{${v.key}}`}={contextToVariables(context)[v.key] || '?'}{' '}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || finalRecipients.length === 0 || (templateZones.length === 0 && !message.trim()) || (selectedChannel === 'email' && !emailSubject.trim())}
            className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ${
              selectedChannel === 'email'
                ? 'bg-orange-500 hover:bg-orange-600'
                : selectedChannel === 'whatsapp'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            <Send className="w-4 h-4" />
            {isSending ? 'Envoi...' : `Envoyer (${finalRecipients.length} ${getChannelLabel(selectedChannel)})`}
          </button>
        </div>

        {/* Save Template Mini-Modal */}
        {showSaveTemplate && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white mb-4">
                Sauvegarder comme modèle
              </h4>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Nom du modèle"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowSaveTemplate(false);
                    setNewTemplateName('');
                  }}
                  className="px-3 py-2 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate || !newTemplateName.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingTemplate ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Backward compatibility alias
export const SMSSenderModal = CommunicationModal;
export default CommunicationModal;

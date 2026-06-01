import { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Mail,
  Send,
  Eye,
  Users,
  Check,
  X,
  Search,
  AlertCircle,
  Loader2,
  Plus,
  FileText,
  Trash2,
  Copy,
  Save,
  Clock,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/utils/formatters';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import {
  getClubStatutenOptions,
  getRecipients,
  getAllMembersForSelection,
  sendManualEmailSimple,
  previewEmailSimple,
  sendTestEmailSimple,
  FORMATION_AUDIENCES,
  type ManualEmailRecipient,
  type ManualEmailCategoryPrices,
  type RecipientFilters,
  type FormationAudienceId,
} from '@/services/manualEmailService';
import {
  getEmailDrafts,
  createEmailDraft,
  updateEmailDraft,
  deleteEmailDraft,
  duplicateEmailDraft,
  type EmailDraft,
} from '@/services/emailDraftService';
import { MembershipSeasonService } from '@/services/membershipSeasonService';
import { formatMontant } from '@/utils/utils';

type UserRole = 'admin' | 'validateur' | 'user';

export function ManualEmailPage() {
  const navigate = useNavigate();
  const { clubId, user } = useAuth();

  // Loading states
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving] = useState(false);

  // Data
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [allMembers, setAllMembers] = useState<ManualEmailRecipient[]>([]);
  const [clubStatutenOptions, setClubStatutenOptions] = useState<string[]>([]);

  // Selected draft
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);

  // Form state
  const [draftName, setDraftName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [selectedClubStatuten, setSelectedClubStatuten] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [withAppAccess, setWithAppAccess] = useState(false);
  const [selectedIndividuals, setSelectedIndividuals] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedFormationAudiences, setSelectedFormationAudiences] = useState<FormationAudienceId[]>([]);

  // Membership category data (from active season)
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [categoryPrices, setCategoryPrices] = useState<ManualEmailCategoryPrices>({});

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState(false);

  // Available roles
  const availableRoles: { value: UserRole; label: string }[] = [
    { value: 'admin', label: 'Administrateurs' },
    { value: 'validateur', label: 'Validateurs' },
    { value: 'user', label: 'Utilisateurs' },
  ];

  // Load data on mount
  useEffect(() => {
    if (clubId) {
      loadDrafts();
      loadMembers();
      loadClubStatuten();
      loadCategoryData();
    }
  }, [clubId]);

  const loadCategoryData = async () => {
    if (!clubId) return;
    try {
      const season = await MembershipSeasonService.getActiveSeason(clubId);
      if (season) {
        const labels: Record<string, string> = {};
        const prices: ManualEmailCategoryPrices = {};
        for (const tariff of season.tariffs) {
          labels[tariff.code] = tariff.label;
          prices[tariff.code] = {
            ...(tariff.price_jan_dec != null ? { jan_dec: formatMontant(tariff.price_jan_dec) } : {}),
            ...(tariff.price_sept_dec != null ? { sept_dec: formatMontant(tariff.price_sept_dec) } : {}),
          };
        }
        setCategoryLabels(labels);
        setCategoryPrices(prices);
      } else {
        setCategoryLabels({});
        setCategoryPrices({});
      }
    } catch (err) {
      logger.error('Error loading category data:', err);
      setCategoryLabels({});
      setCategoryPrices({});
    }
  };

  const loadDrafts = async () => {
    if (!clubId) return;
    try {
      setLoadingDrafts(true);
      const data = await getEmailDrafts(clubId);
      setDrafts(data);
    } catch (error) {
      logger.error('Error loading drafts:', error);
      toast.error('Erreur lors du chargement des brouillons');
    } finally {
      setLoadingDrafts(false);
    }
  };

  const loadMembers = async () => {
    if (!clubId) return;
    try {
      setLoadingMembers(true);
      const data = await getAllMembersForSelection(clubId, false);
      setAllMembers(data);
    } catch (error) {
      logger.error('Error loading members:', error);
      toast.error('Erreur lors du chargement des membres');
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadClubStatuten = async () => {
    if (!clubId) return;
    try {
      const options = await getClubStatutenOptions(clubId);
      setClubStatutenOptions(options);
    } catch (error) {
      logger.error('Error loading clubStatuten:', error);
    }
  };

  // Recipients calculation
  const [recipientCount, setRecipientCount] = useState(0);
  const [calculatedRecipients, setCalculatedRecipients] = useState<ManualEmailRecipient[]>([]);

  useEffect(() => {
    if (!clubId) return;

    const calculateRecipients = async () => {
      if (selectedIndividuals.length > 0) {
        const selected = allMembers.filter((m) => selectedIndividuals.includes(m.id));
        setCalculatedRecipients(selected);
        setRecipientCount(selected.length);
        return;
      }

      if (
        selectedClubStatuten.length === 0 &&
        selectedRoles.length === 0 &&
        selectedCategories.length === 0 &&
        selectedFormationAudiences.length === 0
      ) {
        setCalculatedRecipients([]);
        setRecipientCount(0);
        return;
      }

      try {
        const filters: RecipientFilters = {
          clubStatuten: selectedClubStatuten.length > 0 ? selectedClubStatuten : undefined,
          roles: selectedRoles.length > 0 ? selectedRoles : undefined,
          membershipCategories: selectedCategories.length > 0 ? selectedCategories : undefined,
          formationAudiences: selectedFormationAudiences.length > 0 ? selectedFormationAudiences : undefined,
          activeOnly,
          withAppAccess: withAppAccess || undefined,
        };

        const result = await getRecipients(clubId, filters);
        setCalculatedRecipients(result);
        setRecipientCount(result.length);
      } catch (error) {
        logger.error('Error calculating recipients:', error);
      }
    };

    calculateRecipients();
  }, [
    clubId,
    selectedClubStatuten,
    selectedRoles,
    selectedCategories,
    selectedFormationAudiences,
    activeOnly,
    withAppAccess,
    selectedIndividuals,
    allMembers,
  ]);

  // Filter members for search
  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return allMembers.slice(0, 50);
    const query = memberSearchQuery.toLowerCase();
    return allMembers.filter(
      (m) =>
        m.nom?.toLowerCase().includes(query) ||
        m.prenom?.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query)
    );
  }, [allMembers, memberSearchQuery]);

  // Check if form is valid
  const isFormValid = subject.trim() && htmlContent.trim();

  // Select a draft
  const handleSelectDraft = (draft: EmailDraft) => {
    setSelectedDraftId(draft.id);
    setIsNewDraft(false);
    setDraftName(draft.name);
    setSubject(draft.subject);
    setHtmlContent(draft.htmlContent);
    setPreviewSubject('');

    // Restore recipient filters if saved
    if (draft.recipientFilters) {
      setSelectedClubStatuten(draft.recipientFilters.clubStatuten || []);
      setSelectedRoles((draft.recipientFilters.roles || []) as UserRole[]);
      setSelectedCategories(draft.recipientFilters.membershipCategories || []);
      setSelectedFormationAudiences((draft.recipientFilters.formationAudiences || []) as FormationAudienceId[]);
      setActiveOnly(draft.recipientFilters.activeOnly ?? true);
      setWithAppAccess(draft.recipientFilters.withAppAccess ?? false);
      setSelectedIndividuals(draft.recipientFilters.individualIds || []);
    } else {
      setSelectedClubStatuten([]);
      setSelectedRoles([]);
      setSelectedCategories([]);
      setSelectedFormationAudiences([]);
      setActiveOnly(true);
      setWithAppAccess(false);
      setSelectedIndividuals([]);
    }
  };

  // Create new draft
  const handleNewDraft = () => {
    setSelectedDraftId(null);
    setIsNewDraft(true);
    setDraftName('');
    setSubject('');
    setHtmlContent('');
    setPreviewSubject('');
    setSelectedClubStatuten([]);
    setSelectedRoles([]);
    setSelectedCategories([]);
    setSelectedFormationAudiences([]);
    setActiveOnly(true);
    setWithAppAccess(false);
    setSelectedIndividuals([]);
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!clubId || !user) return;

    if (!draftName.trim()) {
      toast.error('Veuillez donner un nom au brouillon');
      return;
    }

    try {
      setSaving(true);

      const recipientFilters = {
        clubStatuten: selectedClubStatuten,
        roles: selectedRoles,
        membershipCategories: selectedCategories,
        formationAudiences: selectedFormationAudiences,
        activeOnly,
        withAppAccess,
        individualIds: selectedIndividuals,
      };

      if (isNewDraft || !selectedDraftId) {
        const newId = await createEmailDraft(clubId, {
          name: draftName,
          subject,
          htmlContent,
          recipientFilters,
          createdBy: user.uid,
          createdByName: user.displayName || user.email || 'Admin',
        });
        setSelectedDraftId(newId);
        setIsNewDraft(false);
        toast.success('Brouillon créé');
      } else {
        await updateEmailDraft(clubId, selectedDraftId, {
          name: draftName,
          subject,
          htmlContent,
          recipientFilters,
        });
        toast.success('Brouillon sauvegardé');
      }

      loadDrafts();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Delete draft
  const handleDeleteDraft = async (draftId: string) => {
    if (!clubId) return;

    if (!window.confirm('Voulez-vous vraiment supprimer ce brouillon ?')) {
      return;
    }

    try {
      await deleteEmailDraft(clubId, draftId);
      toast.success('Brouillon supprimé');

      if (selectedDraftId === draftId) {
        handleNewDraft();
      }

      loadDrafts();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  // Duplicate draft
  const handleDuplicateDraft = async (draftId: string) => {
    if (!clubId || !user) return;

    try {
      const newId = await duplicateEmailDraft(
        clubId,
        draftId,
        user.uid,
        user.displayName || user.email || 'Admin'
      );
      toast.success('Brouillon dupliqué');
      loadDrafts();

      // Select the new draft
      const newDraft = await getEmailDrafts(clubId).then(d => d.find(x => x.id === newId));
      if (newDraft) {
        handleSelectDraft(newDraft);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la duplication');
    }
  };

  const getPreviewRecipient = (): ManualEmailRecipient => {
    const selectedRecipient = calculatedRecipients[0];
    if (selectedRecipient) {
      return selectedRecipient;
    }

    const currentUserEmail = user?.email?.toLowerCase();
    if (currentUserEmail) {
      const currentUserMember = allMembers.find((member) => member.email.toLowerCase() === currentUserEmail);
      if (currentUserMember) {
        return currentUserMember;
      }
    }

    if (allMembers[0]) {
      return allMembers[0];
    }

    return {
      id: 'preview',
      email: user?.email || 'exemple@email.com',
      prenom: 'Jean',
      nom: 'Dupont',
      membership_category_code: Object.keys(categoryLabels)[0],
      membership_period: 'jan_dec',
    };
  };

  // Preview email
  const handlePreview = async () => {
    if (!clubId) return;

    if (!subject.trim()) {
      toast.error('Veuillez entrer un sujet');
      return;
    }
    if (!htmlContent.trim()) {
      toast.error('Veuillez entrer un message');
      return;
    }

    try {
      const result = await previewEmailSimple(
        clubId,
        subject,
        htmlContent,
        getPreviewRecipient(),
        categoryLabels,
        categoryPrices
      );
      setPreviewSubject(result.subject);
      setPreviewHtml(result.html);
      setShowPreview(true);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la prévisualisation');
    }
  };

  // Send test email
  const handleSendTest = async () => {
    if (!clubId || !user?.email) return;

    if (!subject.trim() || !htmlContent.trim()) {
      toast.error('Veuillez remplir le sujet et le message');
      return;
    }

    try {
      setSendingTest(true);
      const result = await sendTestEmailSimple(
        clubId,
        subject,
        htmlContent,
        getPreviewRecipient(),
        categoryLabels,
        categoryPrices
      );
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi du test");
    } finally {
      setSendingTest(false);
    }
  };

  // Send to all recipients
  const handleSend = async () => {
    if (!clubId || !user) return;

    if (!subject.trim() || !htmlContent.trim()) {
      toast.error('Veuillez remplir le sujet et le message');
      return;
    }

    if (calculatedRecipients.length === 0) {
      toast.error('Aucun destinataire sélectionné');
      return;
    }

    setShowConfirm(false);

    try {
      setSending(true);
      setSendProgress({ sent: 0, total: calculatedRecipients.length });

      // Send raw htmlContent - the service will handle mail merge and HTML generation
      const result = await sendManualEmailSimple({
        clubId,
        subject,
        messageBody: htmlContent, // Raw content with {{prenom}}, {{nom}}, {{type_membre}}, {{cotisation}} placeholders
        recipients: calculatedRecipients,
        sentByUserId: user.uid,
        sentByName: user.displayName || user.email || 'Admin',
        categoryLabels,
        categoryPrices,
        onProgress: (sent, total) => setSendProgress({ sent, total }),
      });

      if (result.success) {
        toast.success(`${result.successCount} email(s) envoyé(s) avec succès`);
      } else {
        toast.success(`${result.successCount} envoyé(s), ${result.failedCount} échec(s)`);
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
      setSendProgress(null);
    }
  };

  // Toggle functions
  const toggleIndividual = (memberId: string) => {
    setSelectedIndividuals((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const toggleClubStatut = (statut: string) => {
    setSelectedClubStatuten((prev) =>
      prev.includes(statut) ? prev.filter((s) => s !== statut) : [...prev, statut]
    );
    setSelectedIndividuals([]);
  };

  const toggleRole = (role: UserRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
    setSelectedIndividuals([]);
  };

  const toggleCategory = (code: string) => {
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setSelectedIndividuals([]);
  };

  const toggleFormationAudience = (audienceId: FormationAudienceId) => {
    setSelectedFormationAudiences((prev) =>
      prev.includes(audienceId)
        ? prev.filter((id) => id !== audienceId)
        : [...prev, audienceId]
    );
    setSelectedIndividuals([]);
  };

  const selectAllActive = () => {
    setSelectedClubStatuten(['Membre']);
    setSelectedRoles([]);
    setSelectedCategories([]);
    setSelectedFormationAudiences([]);
    setSelectedIndividuals([]);
    setActiveOnly(true);
    setWithAppAccess(false);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Left Panel - Drafts List */}
      <div className="w-80 border-r border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
            <button
              onClick={() => navigate('/parametres/communication')}
              className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Communication
            </button>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">
            Emails manuels
          </h1>
        </div>

        {/* New Draft Button */}
        <div className="p-3 border-b border-gray-200 dark:border-dark-border">
          <button
            onClick={handleNewDraft}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Nouvel email
          </button>
        </div>

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto">
          {loadingDrafts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-calypso-blue" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-dark-text-muted mb-2" />
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">Aucun brouillon</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-dark-border">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors ${
                    selectedDraftId === draft.id ? 'bg-calypso-blue/5 border-l-2 border-calypso-blue' : ''
                  }`}
                  onClick={() => handleSelectDraft(draft)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                        {draft.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-dark-text-muted truncate mt-0.5">
                        {draft.subject || 'Sans sujet'}
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-dark-text-muted">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(draft.updatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateDraft(draft.id);
                        }}
                        className="p-1.5 text-gray-400 dark:text-dark-text-muted hover:text-calypso-blue hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                        title="Dupliquer"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraft(draft.id);
                        }}
                        className="p-1.5 text-gray-400 dark:text-dark-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Draft Editor */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-dark-bg-tertiary">
        {!selectedDraftId && !isNewDraft ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Mail className="h-16 w-16 mx-auto text-gray-400 dark:text-dark-text-muted mb-4" />
              <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                Sélectionnez ou créez un email
              </h2>
              <p className="text-gray-500 dark:text-dark-text-muted mb-4">
                Choisissez un brouillon dans la liste ou créez un nouvel email
              </p>
              <button
                onClick={handleNewDraft}
                className="inline-flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
              >
                <Plus className="h-5 w-5" />
                Nouvel email
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Draft Name */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Nom du brouillon..."
                className="w-full text-xl font-semibold border-none focus:ring-0 bg-transparent text-gray-900 dark:text-dark-text-primary placeholder-gray-400"
              />
            </div>

            {/* Email Content */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <Mail className="h-5 w-5 text-calypso-blue" />
                Contenu de l'email
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Sujet *
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Sujet de l'email"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Message *
                  </label>
                  <RichTextEditor
                    content={htmlContent}
                    onChange={setHtmlContent}
                    placeholder="Rédigez votre message..."
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Le logo du club sera automatiquement ajouté en en-tête.
                  </p>
                </div>

                {/* Available Variables */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                    Variables disponibles (mail merge)
                  </h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                    Ces variables seront remplacées par les données de chaque destinataire :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('{{prenom}}');
                        toast.success('Variable copiée !');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-blue-200 dark:border-blue-700 rounded-md text-sm font-mono text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      {'{{prenom}}'}
                      <span className="text-blue-500 dark:text-blue-400 font-sans text-xs">- Prénom</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('{{nom}}');
                        toast.success('Variable copiée !');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-blue-200 dark:border-blue-700 rounded-md text-sm font-mono text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      {'{{nom}}'}
                      <span className="text-blue-500 dark:text-blue-400 font-sans text-xs">- Nom</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('{{type_membre}}');
                        toast.success('Variable copiée !');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-blue-200 dark:border-blue-700 rounded-md text-sm font-mono text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      {'{{type_membre}}'}
                      <span className="text-blue-500 dark:text-blue-400 font-sans text-xs">- Type de membre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('{{cotisation}}');
                        toast.success('Variable copiée !');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-blue-200 dark:border-blue-700 rounded-md text-sm font-mono text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      {'{{cotisation}}'}
                      <span className="text-blue-500 dark:text-blue-400 font-sans text-xs">- Cotisation</span>
                    </button>
                  </div>
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-3 italic">
                    Exemple : "Bonjour {'{{prenom}}'}, votre cotisation {'{{type_membre}}'} est de {'{{cotisation}}'}." sera personnalisé pour chaque destinataire.
                  </p>
                </div>
              </div>
            </div>

            {/* Recipients Selection */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-calypso-blue" />
                Destinataires
                {recipientCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-calypso-blue text-white text-sm rounded-full">
                    {recipientCount}
                  </span>
                )}
              </h2>

              <div className="space-y-4">
                {/* Quick Select */}
                <button
                  onClick={selectAllActive}
                  className="px-4 py-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                >
                  Tous les membres actifs
                </button>

                {/* Club Statuten */}
                {clubStatutenOptions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Par fonction
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {clubStatutenOptions.map((statut) => (
                        <button
                          key={statut}
                          onClick={() => toggleClubStatut(statut)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedClubStatuten.includes(statut)
                              ? 'bg-calypso-blue text-white'
                              : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-dark-bg-tertiary dark:text-dark-text-secondary hover:bg-gray-200'
                          }`}
                        >
                          {statut}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formation Audiences */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Par formation
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FORMATION_AUDIENCES.map((audience) => (
                      <button
                        key={audience.id}
                        onClick={() => toggleFormationAudience(audience.id)}
                        className={`px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                          selectedFormationAudiences.includes(audience.id)
                            ? 'bg-calypso-blue text-white'
                            : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-200'
                        }`}
                      >
                        <span className="block font-medium">{audience.label}</span>
                        <span
                          className={`block text-xs mt-0.5 ${
                            selectedFormationAudiences.includes(audience.id)
                              ? 'text-white/80'
                              : 'text-gray-500 dark:text-dark-text-muted'
                          }`}
                        >
                          {audience.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Roles */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Par rôle
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableRoles.map((role) => (
                      <button
                        key={role.value}
                        onClick={() => toggleRole(role.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          selectedRoles.includes(role.value)
                            ? 'bg-calypso-blue text-white'
                            : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-dark-bg-tertiary dark:text-dark-text-secondary hover:bg-gray-200'
                        }`}
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Membership Categories */}
                {Object.keys(categoryLabels).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Par type de membre
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(categoryLabels).map(([code, label]) => (
                        <button
                          key={code}
                          onClick={() => toggleCategory(code)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedCategories.includes(code)
                              ? 'bg-calypso-blue text-white'
                              : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:text-dark-text-secondary hover:bg-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toggles */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeOnly}
                      onChange={(e) => setActiveOnly(e.target.checked)}
                      className="w-4 h-4 text-calypso-blue rounded focus:ring-calypso-blue"
                    />
                    <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                      Membres actifs uniquement
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={withAppAccess}
                      onChange={(e) => setWithAppAccess(e.target.checked)}
                      className="w-4 h-4 text-calypso-blue rounded focus:ring-calypso-blue"
                    />
                    <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                      Avec accès à l'application
                    </span>
                  </label>
                </div>

                {/* Individual Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Sélection individuelle
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Rechercher un membre..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>

                  {selectedIndividuals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedIndividuals.map((id) => {
                        const member = allMembers.find((m) => m.id === id);
                        if (!member) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-calypso-blue/10 text-calypso-blue rounded-lg text-sm"
                          >
                            {member.prenom} {member.nom}
                            <button
                              onClick={() => toggleIndividual(id)}
                              className="hover:bg-calypso-blue/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {loadingMembers ? (
                    <div className="mt-2 flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-calypso-blue" />
                    </div>
                  ) : (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-dark-border rounded-lg">
                      {filteredMembers.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500 dark:text-dark-text-muted text-center">Aucun membre trouvé</p>
                      ) : (
                        filteredMembers.map((member) => (
                          <button
                            key={member.id}
                            onClick={() => toggleIndividual(member.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors ${
                              selectedIndividuals.includes(member.id) ? 'bg-calypso-blue/5' : ''
                            }`}
                          >
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                {member.prenom} {member.nom}
                              </span>
                              <span className="ml-2 text-xs text-gray-500 dark:text-dark-text-muted">{member.email}</span>
                            </div>
                            {selectedIndividuals.includes(member.id) && (
                              <Check className="h-4 w-4 text-calypso-blue" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Recipients Preview */}
                {recipientCount > 0 && (
                  <div className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                    <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      {recipientCount} destinataire(s)
                    </p>
                    <div className="max-h-24 overflow-y-auto text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-tertiary">
                      {calculatedRecipients.slice(0, 5).map((r) => (
                        <div key={r.id}>
                          {r.prenom} {r.nom} ({r.email})
                        </div>
                      ))}
                      {calculatedRecipients.length > 5 && (
                        <div className="text-gray-400 dark:text-dark-text-muted">
                          ... et {calculatedRecipients.length - 5} autre(s)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary disabled:opacity-50 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                  Sauvegarder
                </button>

                <button
                  onClick={handlePreview}
                  disabled={!isFormValid}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary disabled:opacity-50 transition-colors"
                >
                  <Eye className="h-5 w-5" />
                  Prévisualiser
                </button>

                <button
                  onClick={handleSendTest}
                  disabled={!isFormValid || sendingTest}
                  className="flex items-center gap-2 px-4 py-2 border border-calypso-blue text-calypso-blue rounded-lg hover:bg-calypso-blue/5 disabled:opacity-50 transition-colors"
                >
                  {sendingTest ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mail className="h-5 w-5" />
                  )}
                  Test
                </button>

                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={!isFormValid || recipientCount === 0 || sending}
                  className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50 transition-colors"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  {sending && sendProgress
                    ? `Envoi ${sendProgress.sent}/${sendProgress.total}...`
                    : `Envoyer (${recipientCount})`}
                </button>
              </div>

              {recipientCount === 0 && isFormValid && (
                <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Sélectionnez au moins un destinataire
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                  Prévisualisation
                </h2>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">Sujet: {previewSubject || subject}</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div
                className="bg-white border border-gray-200 dark:border-dark-border rounded-lg"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-calypso-blue/10 rounded-full flex items-center justify-center">
                  <Send className="h-6 w-6 text-calypso-blue" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Confirmer l'envoi
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted">{recipientCount} destinataire(s)</p>
                </div>
              </div>

              <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
                Êtes-vous sûr de vouloir envoyer cet email à {recipientCount} destinataire(s) ?
              </p>

              <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">Destinataires :</p>
                {calculatedRecipients.slice(0, 20).map((r) => (
                  <div key={r.id} className="text-sm text-gray-700 dark:text-dark-text-primary">
                    {r.email}
                  </div>
                ))}
                {calculatedRecipients.length > 20 && (
                  <div className="text-sm text-gray-400 dark:text-dark-text-muted mt-1">
                    ... et {calculatedRecipients.length - 20} autre(s)
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {sendProgress ? `Envoi ${sendProgress.sent}/${sendProgress.total}...` : 'Envoi...'}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Envoyer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

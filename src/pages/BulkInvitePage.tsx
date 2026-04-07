/**
 * Bulk Invite Page
 *
 * Allows admins to invite all club members to CalyMob in one click.
 * Flow: Preview (dry-run) → Confirm → Activate accounts + Send emails → Results
 *
 * No temporary passwords or reset links are created.
 * Users set their password via "Mot de passe oublie" in the app.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import {
  bulkInviteMembers,
  canManuallySelectForBulkInvite,
  canSelectForBulkInvite,
  previewBulkInvite,
  type BulkInviteResult,
  type BulkInviteSummary,
  type BulkInviteProgress,
} from '@/services/bulkInviteService';
import {
  Users,
  Send,
  CheckCircle,
  XCircle,

  Loader2,
  Eye,
  Mail,
  Smartphone,
  Shield,
  ArrowLeft,
  RefreshCw,
  UserCheck,
  UserX,
  SkipForward,
  Info,
  SmartphoneNfc,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/utils/logger';
import { DEFAULT_BULK_INVITE_TEMPLATE } from '@/constants/defaultUserEmailTemplates';
import Handlebars from 'handlebars';

type PagePhase = 'idle' | 'previewing' | 'preview_ready' | 'sending' | 'done' | 'error';

export function BulkInvitePage() {
  const { clubId } = useAuth();
  const navigate = useNavigate();

  // Club settings
  const [clubName, setClubName] = useState('Calypso Diving Club');
  const [logoUrl, setLogoUrl] = useState('');

  // Page state
  const [phase, setPhase] = useState<PagePhase>('previewing');
  const [error, setError] = useState<string | null>(null);

  // Preview data
  const [previewResults, setPreviewResults] = useState<BulkInviteResult[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    activated: number;
    alreadyActive: number;
    skipped: number;
    total: number;
  } | null>(null);

  // Sending progress
  const [progress, setProgress] = useState<BulkInviteProgress | null>(null);

  // Final results
  const [finalSummary, setFinalSummary] = useState<BulkInviteSummary | null>(null);
  const [finalResults, setFinalResults] = useState<BulkInviteResult[]>([]);

  // Detail view toggle
  const [showDetails, setShowDetails] = useState(false);

  // Email preview
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Member selection for test sends
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [includeAlreadyActive, setIncludeAlreadyActive] = useState(false);

  // Filters
  const [installFilter, setInstallFilter] = useState<'all' | 'not_installed' | 'installed'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'would_activate' | 'already_active' | 'skipped'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load club settings and auto-trigger preview
  useEffect(() => {
    if (!clubId) return;
    (async () => {
      try {
        const settings = await FirebaseSettingsService.loadGeneralSettings(clubId);
        if (settings.clubName) setClubName(settings.clubName);
        if ((settings as any).logoUrl) setLogoUrl((settings as any).logoUrl);
      } catch (err) {
        logger.warn('Could not load club settings:', err);
      }
    })();
    // Auto-load the member preview so the list is visible immediately
    handlePreview();
  }, [clubId]);

  // Progress callback
  const handleProgress = useCallback((p: BulkInviteProgress) => {
    setProgress(p);
  }, []);

  // Apply all filters (search + status + installation)
  const filteredPreviewResults = previewResults.filter(result => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = (result.displayName || '').toLowerCase().includes(q);
      const emailMatch = (result.email || '').toLowerCase().includes(q);
      if (!nameMatch && !emailMatch) return false;
    }
    // Status filter
    if (statusFilter !== 'all' && result.status !== statusFilter) return false;
    // Installation filter
    if (installFilter === 'not_installed' && result.appInstalled) return false;
    if (installFilter === 'installed' && !result.appInstalled) return false;
    return true;
  });

  const selectableResults = filteredPreviewResults.filter(result => canManuallySelectForBulkInvite(result));
  const sendableResults = filteredPreviewResults.filter(result => canSelectForBulkInvite(result, includeAlreadyActive));
  const selectedCount = selectedUids.size;
  const selectedIncludesAlreadyActive = previewResults.some(
    result => result.uid && selectedUids.has(result.uid) && result.status === 'already_active'
  );

  useEffect(() => {
    setSelectedUids(prev => {
      const selectableUids = new Set(selectableResults.map(result => result.uid!));
      const filtered = [...prev].filter(uid => selectableUids.has(uid));

      if (filtered.length === prev.size) {
        return prev;
      }

      return new Set(filtered);
    });
  }, [selectableResults]);

  // Selection helpers
  const toggleMember = (uid: string) => {
    setSelectedUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedUids(new Set(sendableResults.map(r => r.uid!)));
  };

  const selectNone = () => {
    setSelectedUids(new Set());
  };

  // Step 1: Preview (dry-run)
  const handlePreview = async () => {
    if (!clubId) return;
    setPhase('previewing');
    setError(null);

    try {
      const result = await previewBulkInvite(clubId);
      setPreviewSummary(result.summary);
      setPreviewResults(result.results);
      // Don't pre-select anyone — user picks who to test with
      setSelectedUids(new Set());
      setShowDetails(true);
      setPhase('preview_ready');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la prévisualisation');
      setPhase('error');
      logger.error('Preview failed:', err);
    }
  };

  // Step 2: Execute bulk invite (only selected members)
  const handleSend = async () => {
    if (!clubId || selectedCount === 0) return;
    setPhase('sending');
    setError(null);
    setProgress(null);

    try {
      const userIds = Array.from(selectedUids);
      const result = await bulkInviteMembers(clubId, clubName, logoUrl, {
        userIds,
        sendToAlreadyActive: selectedIncludesAlreadyActive,
        onProgress: handleProgress,
      });
      setFinalSummary(result.summary);
      setFinalResults(result.results);
      setPhase('done');
      toast.success(`${result.summary.emailsSent} invitations envoyées avec succès !`);
    } catch (err: any) {
      const msg = err.message || "Erreur lors de l'envoi des invitations";
      const isLocalDev = msg.includes('API error: 404');
      const isNetworkError = msg.includes('Failed to fetch');
      setError(
        isLocalDev
          ? "L'API n'est pas disponible en mode développement local. Déployez sur Vercel (git push) pour activer l'envoi."
          : isNetworkError
            ? "Erreur de connexion au serveur. Vérifiez votre connexion internet et réessayez."
            : msg
      );
      setPhase('error');
      logger.error('Bulk invite failed:', err);
      toast.error(
        isLocalDev
          ? 'API indisponible en local — déployez sur Vercel'
          : isNetworkError
            ? 'Erreur de connexion — réessayez'
            : "Erreur lors de l'envoi"
      );
    }
  };

  // Reset and re-load the preview
  const handleReset = () => {
    setError(null);
    setPreviewResults([]);
    setPreviewSummary(null);
    setProgress(null);
    setFinalSummary(null);
    setFinalResults([]);
    setShowDetails(false);
    setSelectedUids(new Set());
    setIncludeAlreadyActive(false);
    setInstallFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    // Re-trigger preview immediately instead of going back to idle
    handlePreview();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-4xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Communication', 'Invitation CalyMob']}
          title="Inviter les Membres sur CalyMob"
          description="Activez les comptes et envoyez un email d'invitation à tous les membres pour qu'ils puissent utiliser l'application mobile."
        />

        {/* Back button */}
        <button
          onClick={() => navigate('/parametres/communication')}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-text-secondary hover:text-calypso-blue dark:hover:text-calypso-aqua mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à Communication
        </button>

        {/* How it works info box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Comment ça fonctionne</h3>
              <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Un compte Firebase Auth est créé pour chaque membre (si pas encore actif)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Chaque membre reçoit un email avec les instructions pour créer son mot de passe</span>
                </div>
                <div className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Après avoir défini leur mot de passe via « Mot de passe oublié ? » dans l'app, ils peuvent se connecter</span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 italic">
                  Aucun mot de passe temporaire n'est créé. Aucun lien avec expiration.
                  Le membre crée son mot de passe via « Mot de passe oublié ? » dans CalyMob, à tout moment.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Email Preview Button - always visible */}
        <div className="mb-6">
          <button
            onClick={() => setShowEmailPreview(!showEmailPreview)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-calypso-blue dark:text-calypso-aqua bg-calypso-blue/10 dark:bg-calypso-aqua/10 rounded-lg hover:bg-calypso-blue/20 dark:hover:bg-calypso-aqua/20 transition-colors"
          >
            <Eye className="h-4 w-4" />
            {showEmailPreview ? "Masquer l'aperçu email" : "Voir l'email d'invitation"}
          </button>
        </div>

        {/* Email Preview Panel */}
        {showEmailPreview && <EmailPreviewPanel clubName={clubName} logoUrl={logoUrl} />}

        {/* PHASE: Idle - show start button */}
        {phase === 'idle' && (
          <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl p-8 text-center">
            <div className="inline-flex p-4 rounded-full bg-calypso-blue/10 dark:bg-calypso-aqua/10 mb-4">
              <Users className="h-10 w-10 text-calypso-blue dark:text-calypso-aqua" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
              Prêt à inviter les membres ?
            </h2>
            <p className="text-gray-600 dark:text-dark-text-secondary mb-6 max-w-md mx-auto">
              Commencez par une prévisualisation pour voir combien de membres seront invités et quels comptes seront activés.
            </p>
            <button
              onClick={handlePreview}
              className="inline-flex items-center gap-2 px-6 py-3 bg-calypso-blue dark:bg-calypso-aqua text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              <Eye className="h-5 w-5" />
              Prévisualiser
            </button>
          </div>
        )}

        {/* PHASE: Previewing - loading */}
        {phase === 'previewing' && (
          <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl p-8 text-center">
            <Loader2 className="h-10 w-10 text-calypso-blue dark:text-calypso-aqua animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-dark-text-secondary">
              Analyse des membres en cours...
            </p>
          </div>
        )}

        {/* PHASE: Preview Ready - show results with member selection */}
        {phase === 'preview_ready' && previewSummary && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                icon={<UserCheck className="h-5 w-5" />}
                label="À activer"
                value={previewSummary.activated}
                color="green"
              />
              <SummaryCard
                icon={<CheckCircle className="h-5 w-5" />}
                label="Déjà actifs"
                value={previewSummary.alreadyActive}
                color="blue"
              />
              <SummaryCard
                icon={<SkipForward className="h-5 w-5" />}
                label="Ignorés"
                value={previewSummary.skipped}
                color="gray"
                tooltip="Emails invalides, placeholder ou membre inactif"
              />
              <SummaryCard
                icon={<Users className="h-5 w-5" />}
                label="Total"
                value={previewSummary.total}
                color="indigo"
              />
            </div>

            {/* Search and filters */}
            <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl p-4 space-y-3">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou email..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-dark-border rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-calypso-blue/30 dark:focus:ring-calypso-aqua/30 focus:border-calypso-blue dark:focus:border-calypso-aqua"
                />
              </div>

              {/* Filter row */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Status filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Statut</span>
                  <div className="flex gap-1">
                    {([
                      { key: 'all' as const, label: 'Tous' },
                      { key: 'would_activate' as const, label: 'À activer' },
                      { key: 'already_active' as const, label: 'Déjà actifs' },
                      { key: 'skipped' as const, label: 'Ignorés' },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setStatusFilter(key)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          statusFilter === key
                            ? 'bg-calypso-blue dark:bg-calypso-aqua text-white'
                            : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="h-5 w-px bg-gray-200 dark:bg-dark-border hidden sm:block" />

                {/* App installation filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">App</span>
                  <div className="flex gap-1">
                    {([
                      { key: 'all' as const, label: 'Tous' },
                      { key: 'not_installed' as const, label: 'Non installé' },
                      { key: 'installed' as const, label: 'Installé' },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setInstallFilter(key)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          installFilter === key
                            ? 'bg-calypso-blue dark:bg-calypso-aqua text-white'
                            : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Result count */}
                <span className="text-xs text-gray-400 dark:text-dark-text-muted ml-auto">
                  {filteredPreviewResults.length} / {previewResults.length} membres
                </span>
              </div>

              {/* Selection controls */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-dark-border">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 text-xs font-medium text-calypso-blue dark:text-calypso-aqua bg-calypso-blue/10 dark:bg-calypso-aqua/10 rounded-lg hover:bg-calypso-blue/20 dark:hover:bg-calypso-aqua/20 transition-colors"
                >
                  Tout sélectionner ({sendableResults.length})
                </button>
                <button
                  onClick={selectNone}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Aucun
                </button>
                <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  <span className="font-semibold text-calypso-blue dark:text-calypso-aqua">{selectedCount}</span> / {selectableResults.length} sélectionnés
                </span>
                <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-dark-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAlreadyActive}
                    onChange={(event) => setIncludeAlreadyActive(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-calypso-blue focus:ring-calypso-blue cursor-pointer"
                  />
                  Inclure les déjà actifs
                </label>
              </div>
            </div>

            {/* Member list with checkboxes */}
            {filteredPreviewResults.length > 0 && (
              <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                    {showDetails ? 'Masquer' : 'Afficher'} le détail ({filteredPreviewResults.length} membres)
                  </span>
                  <span className="text-gray-400">{showDetails ? '▲' : '▼'}</span>
                </button>
                {showDetails && (
                  <div className="border-t border-gray-200 dark:border-dark-border max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-dark-bg-tertiary sticky top-0">
                        <tr>
                          <th className="w-10 px-4 py-2">
                            <input
                              type="checkbox"
                              checked={
                                sendableResults.length > 0 &&
                                sendableResults.every(result => result.uid && selectedUids.has(result.uid))
                              }
                              onChange={(e) => e.target.checked ? selectAll() : selectNone()}
                              className="h-4 w-4 rounded border-gray-300 text-calypso-blue focus:ring-calypso-blue cursor-pointer"
                            />
                          </th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Membre</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Email</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">App</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                        {[...filteredPreviewResults].sort((a, b) => {
                          const aIsSelectable = canManuallySelectForBulkInvite(a) ? 0 : 1;
                          const bIsSelectable = canManuallySelectForBulkInvite(b) ? 0 : 1;
                          if (aIsSelectable !== bIsSelectable) return aIsSelectable - bIsSelectable;
                          // Sort alphabetically by last name (last word in displayName)
                          const aLast = (a.displayName || '').split(' ').slice(-1)[0].toLowerCase();
                          const bLast = (b.displayName || '').split(' ').slice(-1)[0].toLowerCase();
                          return aLast.localeCompare(bLast, 'fr');
                        }).map((r, i) => {
                          const isSelectable = canManuallySelectForBulkInvite(r);
                          const isSelected = r.uid ? selectedUids.has(r.uid) : false;
                          return (
                            <tr
                              key={i}
                              className={`${
                                isSelectable
                                  ? 'hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer'
                                  : 'opacity-50'
                              } ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/5' : ''}`}
                              onClick={() => isSelectable && r.uid && toggleMember(r.uid)}
                            >
                              <td className="px-4 py-2">
                                {isSelectable ? (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => r.uid && toggleMember(r.uid)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded border-gray-300 text-calypso-blue focus:ring-calypso-blue cursor-pointer"
                                  />
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-gray-900 dark:text-dark-text-primary">
                                {r.displayName || '—'}
                              </td>
                              <td className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary">
                                {r.email}
                              </td>
                              <td className="px-4 py-2">
                                {r.appInstalled ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                    <Smartphone className="h-3 w-3" /> Installée
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-dark-text-muted">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <StatusBadge status={r.status} reason={r.reason} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSend}
                disabled={selectedCount === 0}
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                {selectedCount === 0
                  ? 'Sélectionnez des membres'
                  : selectedCount === sendableResults.length
                    ? `Envoyer les ${selectedCount} emails`
                    : `Envoyer ${selectedCount} email${selectedCount > 1 ? 's' : ''}`
                }
              </button>
            </div>
          </div>
        )}

        {/* PHASE: Sending - progress */}
        {phase === 'sending' && (
          <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl p-8">
            <div className="text-center mb-6">
              <Loader2 className="h-10 w-10 text-calypso-blue dark:text-calypso-aqua animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-1">
                {progress?.phase === 'activating' && 'Activation des comptes...'}
                {progress?.phase === 'sending_emails' && 'Envoi des emails...'}
                {!progress && 'Démarrage...'}
              </h2>
            </div>
            {progress?.phase === 'sending_emails' && progress.total > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
                  <span>{progress.current} / {progress.total}</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-dark-bg-tertiary rounded-full h-3">
                  <div
                    className="bg-calypso-blue dark:bg-calypso-aqua h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                {progress.currentEmail && (
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2 text-center truncate">
                    {progress.currentEmail}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* PHASE: Done - results */}
        {phase === 'done' && finalSummary && (
          <div className="space-y-4">
            {/* Success banner */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-200">
                    Invitations envoyées !
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
                    {finalSummary.emailsSent} emails envoyés avec succès.
                    {finalSummary.emailsFailed > 0 && ` ${finalSummary.emailsFailed} échecs.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Result summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <SummaryCard icon={<UserCheck className="h-5 w-5" />} label="Activés" value={finalSummary.activated} color="green" />
              <SummaryCard icon={<CheckCircle className="h-5 w-5" />} label="Déjà actifs" value={finalSummary.alreadyActive} color="blue" />
              <SummaryCard icon={<Mail className="h-5 w-5" />} label="Emails envoyés" value={finalSummary.emailsSent} color="indigo" />
              {finalSummary.emailsFailed > 0 && (
                <SummaryCard icon={<XCircle className="h-5 w-5" />} label="Emails échoués" value={finalSummary.emailsFailed} color="red" />
              )}
              <SummaryCard icon={<SkipForward className="h-5 w-5" />} label="Ignorés" value={finalSummary.skipped} color="gray" />
              {finalSummary.failed > 0 && (
                <SummaryCard icon={<UserX className="h-5 w-5" />} label="Activation échouée" value={finalSummary.failed} color="red" />
              )}
            </div>

            {/* Detail table for final results */}
            {finalResults.length > 0 && (
              <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                    {showDetails ? 'Masquer' : 'Afficher'} le détail
                  </span>
                  <span className="text-gray-400">{showDetails ? '▲' : '▼'}</span>
                </button>
                {showDetails && (
                  <div className="border-t border-gray-200 dark:border-dark-border max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-dark-bg-tertiary sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Membre</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Email</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Activation</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-dark-text-secondary font-medium">Email envoyé</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                        {finalResults.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                            <td className="px-4 py-2 text-gray-900 dark:text-dark-text-primary">
                              {r.displayName || '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary">
                              {r.email}
                            </td>
                            <td className="px-4 py-2">
                              <StatusBadge status={r.status} reason={r.reason} />
                            </td>
                            <td className="px-4 py-2">
                              {r.emailSent ? (
                                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Envoyé
                                </span>
                              ) : r.emailError ? (
                                <span className="text-red-600 dark:text-red-400 flex items-center gap-1" title={r.emailError}>
                                  <XCircle className="h-3.5 w-3.5" /> Échec
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-dark-text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => navigate('/parametres/communication')}
                className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4 inline mr-1" />
                Retour
              </button>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 text-calypso-blue dark:text-calypso-aqua hover:bg-calypso-blue/10 dark:hover:bg-calypso-aqua/10 rounded-lg transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Relancer
              </button>
            </div>
          </div>
        )}

        {/* PHASE: Error */}
        {phase === 'error' && (
          <div className="bg-white dark:bg-dark-bg-secondary border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
            <XCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
              Une erreur s'est produite
            </h2>
            <p className="text-sm text-red-600 dark:text-red-400 mb-6 max-w-md mx-auto">
              {error}
            </p>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-calypso-blue dark:bg-calypso-aqua text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              <RefreshCw className="h-5 w-5" />
              Réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper Components ---

function SummaryCard({
  icon,
  label,
  value,
  color,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'green' | 'blue' | 'gray' | 'indigo' | 'red';
  tooltip?: string;
}) {
  const colorMap = {
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    gray: 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`} title={tooltip}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function EmailPreviewPanel({ clubName, logoUrl }: { clubName: string; logoUrl: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    try {
      const template = Handlebars.compile(DEFAULT_BULK_INVITE_TEMPLATE);
      const sampleData = {
        recipientName: 'Jean Dupont',
        clubName,
        logoUrl,
        email: 'jean.dupont@exemple.be',
        appUrl: 'https://caly.club',
        primaryColor: '#3B82F6',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
      };
      const html = template(sampleData);

      if (iframeRef.current) {
        const doc = iframeRef.current.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          // Disable all links in preview
          setTimeout(() => {
            const links = doc.querySelectorAll('a');
            links.forEach(link => {
              link.addEventListener('click', (e) => e.preventDefault());
              link.style.cursor = 'default';
            });
          }, 100);
        }
      }
    } catch (err) {
      logger.error('Email preview render error:', err);
    }
  }, [clubName, logoUrl]);

  return (
    <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border flex items-center gap-2">
        <Mail className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
          Aperçu de l'email d'invitation
        </span>
        <span className="text-xs text-gray-400 dark:text-dark-text-muted ml-auto">
          Données de démonstration — chaque membre recevra un email personnalisé
        </span>
      </div>
      <div className="p-4 bg-gray-100 dark:bg-dark-bg-tertiary">
        {/* Subject line preview */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg px-4 py-2 mb-3 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-dark-text-muted font-medium">Objet :</span>
            <span className="text-gray-900 dark:text-dark-text-primary">📱 {clubName} — Bienvenue sur CalyMob !</span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-1">
            <span className="text-gray-500 dark:text-dark-text-muted font-medium">À :</span>
            <span className="text-gray-600 dark:text-dark-text-secondary">jean.dupont@exemple.be</span>
          </div>
        </div>
        {/* Email body iframe */}
        <div className="bg-white rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <iframe
            ref={iframeRef}
            title="Email preview"
            className="w-full border-0"
            style={{ height: '700px', backgroundColor: '#F3F4F6' }}
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, reason }: { status: string; reason?: string }) {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    activated: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Activé' },
    would_activate: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'À activer' },
    already_active: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Déjà actif' },
    skipped: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', label: 'Ignoré' },
    failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Échec' },
  };

  const badge = badges[status] || badges.skipped;

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
      {reason && (status === 'failed' || status === 'skipped') && (
        <span className="text-[10px] text-red-500 dark:text-red-400 max-w-[250px] truncate" title={reason}>
          {reason}
        </span>
      )}
    </div>
  );
}

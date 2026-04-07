import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { getMembres } from '@/services/membreService';
import { Membre } from '@/types';
import { formatDate } from '@/utils/utils';
import {
  Smartphone,
  Users,
  Bell,
  TrendingUp,
  Apple,
  Loader2,
  RefreshCw,
  Upload,
  Check,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
} from 'lucide-react';

interface AppStats {
  totalMembers: number;
  totalWithAppAccess: number;
  appInstalled: number;
  iosUsers: number;
  androidUsers: number;
  notificationsEnabled: number;
  adoptionRate: number;
  notificationRate: number;
  recentlyActive: number; // Active in last 7 days
  staleTokens: number; // FCM token > 30 days old
  versions: Record<string, number>;
}

interface MemberWithApp extends Membre {
  app_installed?: boolean;
  app_platform?: 'ios' | 'android';
  app_version?: string;
  app_build_number?: string;
  device_model?: string;
  device_os_version?: string;
  app_last_opened?: Date;
  app_first_installed?: Date;
  notifications_enabled?: boolean;
  fcm_tokens?: string[];
  fcm_token_updated_at?: Date;
}

interface PublishedVersion {
  version: string;
  buildNumber?: number;
  updatedAt?: Date;
  source?: string;
}

export function AppAdoptionDashboard() {
  const { clubId } = useAuth();
  const [stats, setStats] = useState<AppStats | null>(null);
  const [members, setMembers] = useState<MemberWithApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'installed' | 'not_installed'>('all');

  // Sorting state
  type SortKey = 'membre' | 'statut' | 'plateforme' | 'version' | 'notifications' | 'derniere_ouverture';
  const [sortKey, setSortKey] = useState<SortKey>('derniere_ouverture');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Version publishing state
  const [publishedVersion, setPublishedVersion] = useState<PublishedVersion | null>(null);
  const [newVersion, setNewVersion] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Load published version from Firestore
  const loadPublishedVersion = async () => {
    try {
      const versionDoc = await getDoc(doc(db, 'settings', 'app_version'));
      if (versionDoc.exists()) {
        const data = versionDoc.data();
        setPublishedVersion({
          version: data.version || '?',
          buildNumber: data.buildNumber,
          updatedAt: data.updatedAt?.toDate(),
          source: data.source,
        });
      }
    } catch (error) {
      logger.error('Error loading published version:', error);
    }
  };

  // Publish a new version to Firestore
  const publishVersion = async () => {
    if (!newVersion.trim() || !/^\d+\.\d+\.\d+$/.test(newVersion.trim())) {
      alert('Version invalide. Format attendu: X.Y.Z (ex: 1.2.5)');
      return;
    }

    if (!confirm(
      `Publier la version ${newVersion} ?\n\n` +
      `Tous les utilisateurs avec une version plus ancienne verront une notification de mise à jour.\n\n` +
      `Assurez-vous que cette version est disponible sur l'App Store et le Play Store.`
    )) return;

    setIsPublishing(true);
    try {
      // Read existing data to preserve minSupportedVersion
      const existingDoc = await getDoc(doc(db, 'settings', 'app_version'));
      const existingData = existingDoc.exists() ? existingDoc.data() : {};

      await setDoc(doc(db, 'settings', 'app_version'), {
        version: newVersion.trim(),
        forceRefresh: false,
        message: null,
        updatedAt: serverTimestamp(),
        source: 'calycompta_admin',
        minSupportedVersion: existingData.minSupportedVersion || null,
      });

      setPublishSuccess(true);
      setNewVersion('');
      await loadPublishedVersion();

      // Reset success state after 3 seconds
      setTimeout(() => setPublishSuccess(false), 3000);
    } catch (error) {
      logger.error('Error publishing version:', error);
      alert('Erreur lors de la publication: ' + (error as Error).message);
    } finally {
      setIsPublishing(false);
    }
  };

  const loadData = async () => {
    if (!clubId) return;

    setIsLoading(true);
    try {
      await loadPublishedVersion();
      const allMembers = await getMembres(clubId) as MemberWithApp[];

      // Filter to only members with app access
      const membersWithAccess = allMembers.filter(m => m.has_app_access);

      // Detect installation via app_installed flag OR presence of FCM token
      // (the Flutter app registers FCM tokens but doesn't yet set app_installed)
      const isInstalled = (m: MemberWithApp) =>
        m.app_installed || !!m.fcm_token || (Array.isArray(m.fcm_tokens) && m.fcm_tokens.length > 0);

      // Calculate stats
      const appInstalled = membersWithAccess.filter(isInstalled);
      const iosUsers = appInstalled.filter(m => m.app_platform === 'ios');
      const androidUsers = appInstalled.filter(m => m.app_platform === 'android');
      const notificationsEnabled = appInstalled.filter(m => m.notifications_enabled);

      // Recently active (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentlyActive = appInstalled.filter(m => {
        if (!m.app_last_opened) return false;
        const lastOpened = m.app_last_opened instanceof Date
          ? m.app_last_opened
          : new Date((m.app_last_opened as any).seconds * 1000);
        return lastOpened >= sevenDaysAgo;
      });

      // Stale tokens (fcm_token_updated_at > 30 days ago)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const staleTokenMembers = appInstalled.filter(m => {
        if (!m.notifications_enabled) return false;
        if (!m.fcm_token_updated_at) return true; // Geen timestamp = potentieel stale
        const updatedAt = m.fcm_token_updated_at instanceof Date
          ? m.fcm_token_updated_at
          : new Date((m.fcm_token_updated_at as any).seconds * 1000);
        return updatedAt < thirtyDaysAgo;
      });

      // Version distribution
      const versions: Record<string, number> = {};
      appInstalled.forEach(m => {
        if (m.app_version) {
          const version = m.app_version;
          versions[version] = (versions[version] || 0) + 1;
        }
      });

      setStats({
        totalMembers: allMembers.length,
        totalWithAppAccess: membersWithAccess.length,
        appInstalled: appInstalled.length,
        iosUsers: iosUsers.length,
        androidUsers: androidUsers.length,
        notificationsEnabled: notificationsEnabled.length,
        adoptionRate: membersWithAccess.length > 0
          ? Math.round((appInstalled.length / membersWithAccess.length) * 100)
          : 0,
        notificationRate: appInstalled.length > 0
          ? Math.round((notificationsEnabled.length / appInstalled.length) * 100)
          : 0,
        recentlyActive: recentlyActive.length,
        staleTokens: staleTokenMembers.length,
        versions
      });

      setMembers(membersWithAccess);
    } catch (error) {
      logger.error('Error loading app adoption data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clubId]);

  // Detect installation via app_installed flag OR presence of FCM token
  const isInstalled = (m: MemberWithApp) =>
    m.app_installed || !!m.fcm_token || (Array.isArray(m.fcm_tokens) && m.fcm_tokens.length > 0);

  const toDate = (d: any): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (d?.seconds) return new Date(d.seconds * 1000);
    return null;
  };

  // Check of een member een stale FCM token heeft (>30 dagen niet vernieuwd)
  const isStaleToken = (m: MemberWithApp): boolean => {
    if (!m.notifications_enabled) return false;
    if (!m.fcm_token_updated_at) return true; // Geen timestamp = waarschijnlijk stale
    const updatedAt = toDate(m.fcm_token_updated_at);
    if (!updatedAt) return true;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return updatedAt < thirtyDaysAgo;
  };

  const tokenAgeDays = (m: MemberWithApp): number | null => {
    const updatedAt = toDate(m.fcm_token_updated_at);
    if (!updatedAt) return null;
    return Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'membre' ? 'asc' : 'desc');
    }
  };

  const filteredMembers = members.filter(m => {
    if (filter === 'installed') return isInstalled(m);
    if (filter === 'not_installed') return !isInstalled(m);
    return true;
  }).sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;

    switch (sortKey) {
      case 'membre': {
        const nameA = `${a.nom || ''} ${a.prenom || ''}`.toLowerCase();
        const nameB = `${b.nom || ''} ${b.prenom || ''}`.toLowerCase();
        return dir * nameA.localeCompare(nameB);
      }
      case 'statut': {
        const installedA = isInstalled(a) ? 1 : 0;
        const installedB = isInstalled(b) ? 1 : 0;
        return dir * (installedA - installedB);
      }
      case 'plateforme': {
        const platA = a.app_platform || '';
        const platB = b.app_platform || '';
        return dir * platA.localeCompare(platB);
      }
      case 'version': {
        const verA = a.app_version || '';
        const verB = b.app_version || '';
        return dir * verA.localeCompare(verB, undefined, { numeric: true });
      }
      case 'notifications': {
        const notifA = a.notifications_enabled ? (a.fcm_tokens?.length || 1) : 0;
        const notifB = b.notifications_enabled ? (b.fcm_tokens?.length || 1) : 0;
        return dir * (notifA - notifB);
      }
      case 'derniere_ouverture': {
        const dateA = toDate(a.app_last_opened)?.getTime() || 0;
        const dateB = toDate(b.app_last_opened)?.getTime() || 0;
        return dir * (dateA - dateB);
      }
      default:
        return 0;
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-calypso-blue" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <SettingsHeader
            breadcrumb={['Paramètres', 'App CalyMob']}
            title="Adoption CalyMob"
            description="Statistiques d'installation et d'utilisation de l'app mobile"
          />
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>

        {stats && (
          <>
            {/* Stale Token Warning Banner */}
            {stats.staleTokens > 0 && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    {stats.staleTokens} membre{stats.staleTokens > 1 ? 's' : ''} avec token FCM périmé
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Ces utilisateurs ne reçoivent probablement plus de notifications push.
                    Ils doivent ouvrir l'app pour rafraîchir leur token.
                  </p>
                </div>
              </div>
            )}

            {/* Main Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
              {/* Adoption Rate */}
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">Taux d'adoption</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.adoptionRate}%</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-muted">
                  {stats.appInstalled} / {stats.totalWithAppAccess} utilisateurs avec accès app
                </p>
              </div>

              {/* App Installed */}
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">App installée</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.appInstalled}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <span>🍎</span> {stats.iosUsers} iOS
                  </span>
                  <span className="flex items-center gap-1">
                    <span>🤖</span> {stats.androidUsers} Android
                  </span>
                </div>
              </div>

              {/* Notifications */}
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Bell className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">Notifications activées</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.notificationsEnabled}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-muted">
                  {stats.notificationRate}% des utilisateurs avec l'app
                </p>
              </div>

              {/* Recently Active */}
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">Actifs (7 jours)</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.recentlyActive}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-muted">
                  Utilisateurs ayant ouvert l'app récemment
                </p>
              </div>

              {/* Stale Tokens */}
              <div className={`bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border ${stats.staleTokens > 0 ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-dark-border'} p-6`}>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stats.staleTokens > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800/30'}`}>
                    <ShieldAlert className={`w-6 h-6 ${stats.staleTokens > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">Tokens périmés</p>
                    <p className={`text-2xl font-bold ${stats.staleTokens > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-dark-text-primary'}`}>{stats.staleTokens}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-muted">
                  Token FCM non rafraîchi depuis 30+ jours
                </p>
              </div>
            </div>

            {/* Version Publishing */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-8">
              <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-calypso-blue" />
                Gestion des versions
              </h3>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Current published version */}
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-1">Version publiée actuellement</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                      v{publishedVersion?.version || '...'}
                    </span>
                    {publishedVersion?.buildNumber && (
                      <span className="text-sm text-gray-400 dark:text-dark-text-muted">
                        (build {publishedVersion.buildNumber})
                      </span>
                    )}
                  </div>
                  {publishedVersion?.updatedAt && (
                    <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-1">
                      Publiée le {formatDate(publishedVersion.updatedAt)}
                      {publishedVersion.source && ` via ${publishedVersion.source}`}
                    </p>
                  )}
                </div>

                {/* Publish new version */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={newVersion}
                      onChange={(e) => setNewVersion(e.target.value)}
                      placeholder="Ex: 1.2.6"
                      className="w-32 px-3 py-2 border border-gray-300 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-calypso-blue"
                    />
                  </div>
                  <button
                    onClick={publishVersion}
                    disabled={isPublishing || !newVersion.trim()}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      publishSuccess
                        ? 'bg-green-600 text-white'
                        : 'bg-calypso-blue text-white hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isPublishing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : publishSuccess ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {publishSuccess ? 'Publié !' : 'Publier'}
                  </button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Publiez une nouvelle version uniquement après qu'elle soit approuvée et disponible
                    sur l'App Store et le Play Store. Les utilisateurs avec une version plus ancienne
                    verront une notification de mise à jour.
                  </span>
                </p>
              </div>
            </div>

            {/* Version Distribution */}
            {Object.keys(stats.versions).length > 0 && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-8">
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4">Distribution des versions</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(stats.versions)
                    .sort((a, b) => b[1] - a[1])
                    .map(([version, count]) => (
                      <div
                        key={version}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg"
                      >
                        <span className="font-medium text-gray-900 dark:text-dark-text-primary">v{version}</span>
                        <span className="text-sm text-gray-500 dark:text-dark-text-muted">({count})</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Member List */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">
                  Liste des membres ({filteredMembers.length})
                </h3>
              </div>

              {/* Filter */}
              <div className="px-6 py-3 bg-gray-50 dark:bg-dark-bg-tertiary flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    filter === 'all'
                      ? 'bg-calypso-blue text-white'
                      : 'bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                  }`}
                >
                  Tous ({stats.totalWithAppAccess})
                </button>
                <button
                  onClick={() => setFilter('installed')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    filter === 'installed'
                      ? 'bg-green-600 text-white'
                      : 'bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                  }`}
                >
                  Installée ({stats.appInstalled})
                </button>
                <button
                  onClick={() => setFilter('not_installed')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    filter === 'not_installed'
                      ? 'bg-gray-600 text-white'
                      : 'bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                  }`}
                >
                  Non installée ({stats.totalWithAppAccess - stats.appInstalled})
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-bg-tertiary text-xs text-gray-500 dark:text-dark-text-muted uppercase">
                    <tr>
                      {([
                        ['membre', 'Membre'],
                        ['statut', 'Statut'],
                        ['plateforme', 'Plateforme'],
                        ['version', 'Version'],
                        ['notifications', 'Notifications'],
                        ['derniere_ouverture', 'Dernière ouverture'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th
                          key={key}
                          className="px-6 py-3 text-left cursor-pointer select-none hover:text-gray-700 dark:hover:text-dark-text-primary transition-colors"
                          onClick={() => toggleSort(key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {sortKey === key ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                    {filteredMembers.map(member => (
                      <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                            {member.prenom} {member.nom}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-dark-text-muted">
                            {member.email}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isInstalled(member) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                              <Smartphone className="w-3 h-3" />
                              Installée
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary rounded-full text-xs font-medium">
                              Non installée
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {member.app_platform === 'ios' ? (
                            <span className="flex items-center gap-1">🍎 iOS</span>
                          ) : member.app_platform === 'android' ? (
                            <span className="flex items-center gap-1">🤖 Android</span>
                          ) : (
                            <span className="text-gray-400 dark:text-dark-text-muted">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {member.app_version ? (
                            <span className="text-gray-900 dark:text-dark-text-primary">
                              v{member.app_version}
                              {member.app_build_number && (
                                <span className="text-gray-400 dark:text-dark-text-muted ml-1">({member.app_build_number})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-dark-text-muted">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {member.notifications_enabled ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 ${isStaleToken(member) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                <Bell className="w-4 h-4" />
                                {member.fcm_tokens?.length || 1}
                              </span>
                              {isStaleToken(member) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs" title={`Token mis à jour il y a ${tokenAgeDays(member) ?? '?'} jours`}>
                                  <ShieldAlert className="w-3 h-3" />
                                  {tokenAgeDays(member) !== null ? `${tokenAgeDays(member)}j` : '?'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-dark-text-muted">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-dark-text-muted">
                          {member.app_last_opened ? formatDate(member.app_last_opened) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

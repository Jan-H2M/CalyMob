import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  Bug,
  List,
  Columns,
  Search,
  Filter,
  X,
  ChevronRight,
  Monitor,
  Clock,
  User,
  MapPin,
  Copy,
  Check,
  MessageSquare,
  Send,
  Trash2,
  AlertCircle,
  GripVertical,
  Plus,
  Pencil,
  Paperclip,
  Upload,
  Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayName } from '@/utils/fieldMapper';
import {
  bugReportManagementService,
  BugReport,
  BugStatus,
  BugPriority,
  BUG_STATUS_CONFIG,
  BUG_PRIORITY_CONFIG,
  BugReportComment,
} from '@/services/bugReportManagementService';
import { DEFAULT_CLUB_ID } from '@/lib/firebase';

// ============================================
// Helpers
// ============================================

function formatDate(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return '—';
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts as any);
  return d.toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return '';
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts as any);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'à l\'instant';
  if (diffMins < 60) return `il y a ${diffMins}min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `il y a ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `il y a ${diffDays}j`;
  return formatDate(ts);
}

// ============================================
// Main Page
// ============================================

type ViewMode = 'list' | 'kanban';

export default function BugReportsPage() {
  const { user, appUser } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<BugStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<BugPriority | 'all'>('all');
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Realtime subscription
  useEffect(() => {
    const unsubscribe = bugReportManagementService.subscribe(
      DEFAULT_CLUB_ID,
      (data) => {
        setReports(data);
        setLoading(false);
        // Update selected report if it changed
        if (selectedReport) {
          const updated = data.find((r) => r.id === selectedReport.id);
          if (updated) setSelectedReport(updated);
        }
      }
    );
    return unsubscribe;
  }, []);

  // Filtered & searched reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterPriority !== 'all' && r.priority !== filterPriority) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.reporter.name.toLowerCase().includes(q) ||
          r.currentRoute.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reports, filterStatus, filterPriority, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = reports.length;
    const nouveau = reports.filter((r) => r.status === 'nouveau').length;
    const enCours = reports.filter((r) => r.status === 'en_cours').length;
    const resolu = reports.filter((r) => r.status === 'resolu').length;
    const ferme = reports.filter((r) => r.status === 'ferme').length;
    return { total, nouveau, enCours, resolu, ferme };
  }, [reports]);

  const [deletingClosed, setDeletingClosed] = useState(false);

  const handleDeleteAllClosed = useCallback(async () => {
    if (!window.confirm(`Supprimer les ${stats.ferme} bugs fermés ? Les images associées seront aussi supprimées. Cette action est irréversible.`)) return;
    setDeletingClosed(true);
    try {
      const count = await bugReportManagementService.deleteClosedReports();
      toast.success(`${count} bug${count > 1 ? 's' : ''} fermé${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''}`);
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeletingClosed(false);
    }
  }, [stats.ferme]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary">
      <div className="max-w-7xl mx-auto p-6">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Signalements & Bugs']}
          title="Signalements & Bugs"
          description="Gérez les signalements de bugs remontés par les utilisateurs"
        />

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total" value={stats.total} color="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
          <StatCard label="Nouveaux" value={stats.nouveau} color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" />
          <StatCard label="En cours" value={stats.enCours} color="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" />
          <StatCard label="Résolus" value={stats.resolu} color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-6">
          {/* View toggle */}
          <div className="flex bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-calypso-blue text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-4 h-4" />
              Liste
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-calypso-blue text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Columns className="w-4 h-4" />
              Kanban
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un bug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
            />
          </div>

          {/* Filters */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as BugStatus | 'all')}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">Tous les statuts</option>
            {(Object.keys(BUG_STATUS_CONFIG) as BugStatus[]).map((s) => (
              <option key={s} value={s}>
                {BUG_STATUS_CONFIG[s].emoji} {BUG_STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as BugPriority | 'all')}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">Toutes priorités</option>
            {(Object.keys(BUG_PRIORITY_CONFIG) as BugPriority[]).map((p) => (
              <option key={p} value={p}>
                {BUG_PRIORITY_CONFIG[p].emoji} {BUG_PRIORITY_CONFIG[p].label}
              </option>
            ))}
          </select>

          {/* Delete all closed */}
          {stats.ferme > 0 && (
            <button
              onClick={handleDeleteAllClosed}
              disabled={deletingClosed}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deletingClosed ? 'Suppression...' : `Supprimer fermés (${stats.ferme})`}
            </button>
          )}

          {/* Add Bug button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-calypso-blue text-white text-sm font-medium hover:bg-calypso-blue/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un bug
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-calypso-blue border-t-transparent" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-20">
            <Bug className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              {reports.length === 0 ? 'Aucun signalement pour le moment' : 'Aucun résultat pour ces filtres'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <ListView reports={filteredReports} onSelect={setSelectedReport} />
        ) : (
          <KanbanView reports={filteredReports} onSelect={setSelectedReport} />
        )}
      </div>

      {/* Detail Panel (slide-over) */}
      {selectedReport && (
        <DetailPanel
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          currentUser={user}
          currentAppUser={appUser}
        />
      )}

      {/* Add Bug Modal */}
      {showAddModal && (
        <AddBugModal
          onClose={() => setShowAddModal(false)}
          currentUser={user}
          currentAppUser={appUser}
        />
      )}
    </div>
  );
}

// ============================================
// Add Bug Modal
// ============================================

function AddBugModal({
  onClose,
  currentUser,
  currentAppUser,
}: {
  onClose: () => void;
  currentUser: any;
  currentAppUser: any;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<BugPriority>('annoying');
  const [route, setRoute] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const [addModalDragging, setAddModalDragging] = useState(false);
  const addModalDragCounter = useRef(0);

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} est trop volumineux (max 10 MB)`);
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...newFiles]);
    if (addFileInputRef.current) addFileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }
    setSubmitting(true);
    try {
      const reportId = await bugReportManagementService.createManualReport({
        title: title.trim(),
        description: description.trim(),
        priority,
        currentRoute: route.trim(),
        reporter: {
          uid: currentUser?.uid || '',
          name: getDisplayName(currentAppUser) || currentUser?.email || 'Inconnu',
          email: currentUser?.email || '',
        },
      });

      // Upload pending attachments
      if (pendingFiles.length > 0) {
        let currentScreenshots: any[] = [];
        for (const file of pendingFiles) {
          try {
            const newScreenshot = await bugReportManagementService.addAttachment(
              reportId,
              file,
              currentScreenshots
            );
            currentScreenshots = [...currentScreenshots, newScreenshot];
          } catch (err) {
            console.error(`Failed to upload ${file.name}:`, err);
            toast.error(`Erreur upload: ${file.name}`);
          }
        }
      }

      toast.success('Bug ajouté avec succès');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la création du bug');
    } finally {
      setSubmitting(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type === 'application/pdf') return '📄';
    if (file.type.includes('spreadsheet') || file.name.match(/\.(xls|xlsx|csv)$/i)) return '📊';
    if (file.type.includes('document') || file.name.match(/\.(doc|docx|txt)$/i)) return '📝';
    if (file.type.includes('zip') || file.name.match(/\.zip$/i)) return '📦';
    return '📎';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bug className="w-5 h-5 text-calypso-blue" />
            Ajouter un bug manuellement
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Titre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Décrivez le problème en une phrase..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Détails supplémentaires, étapes pour reproduire..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-calypso-blue focus:border-transparent resize-none"
          />
        </div>

        {/* Priority + Route row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priorité
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as BugPriority)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-700 dark:text-gray-300"
            >
              {(Object.keys(BUG_PRIORITY_CONFIG) as BugPriority[]).map((p) => (
                <option key={p} value={p}>
                  {BUG_PRIORITY_CONFIG[p].emoji} {BUG_PRIORITY_CONFIG[p].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Route / Page
            </label>
            <input
              type="text"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="/parametres/..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
            />
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" />
            Pièces jointes
          </label>
          <input
            ref={addFileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip"
            onChange={handleAddFiles}
            className="hidden"
          />

          {/* File list */}
          {pendingFiles.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {pendingFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border text-sm"
                >
                  <span className="text-base flex-shrink-0">{getFileIcon(file)}</span>
                  <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addModalDragCounter.current++;
              if (e.dataTransfer.types.includes('Files')) setAddModalDragging(true);
            }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addModalDragCounter.current--;
              if (addModalDragCounter.current === 0) setAddModalDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addModalDragCounter.current = 0;
              setAddModalDragging(false);
              const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => {
                if (f.size > 10 * 1024 * 1024) {
                  toast.error(`${f.name} est trop volumineux (max 10 MB)`);
                  return false;
                }
                return true;
              });
              if (droppedFiles.length > 0) setPendingFiles((prev) => [...prev, ...droppedFiles]);
            }}
            onClick={() => addFileInputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border-2 border-dashed text-sm transition-all cursor-pointer ${
              addModalDragging
                ? 'border-calypso-blue bg-calypso-blue/10 text-calypso-blue scale-[1.02]'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-calypso-blue hover:text-calypso-blue dark:hover:border-calypso-blue dark:hover:text-calypso-blue'
            }`}
          >
            {addModalDragging ? (
              <>
                <Upload className="w-5 h-5" />
                <span className="font-medium">Déposez les fichiers ici</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>{pendingFiles.length === 0
                  ? 'Glissez des fichiers ici ou cliquez pour ajouter'
                  : 'Glissez ou cliquez pour ajouter d\'autres fichiers'}</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 text-center">
            Images, PDF, documents — max 10 MB par fichier
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="px-4 py-2 rounded-lg bg-calypso-blue text-white text-sm font-medium hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                {pendingFiles.length > 0 ? 'Création & upload...' : 'Création...'}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Créer le signalement
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================
// Stat Card
// ============================================

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}

// ============================================
// List View
// ============================================

function ListView({
  reports,
  onSelect,
}: {
  reports: BugReport[];
  onSelect: (r: BugReport) => void;
}) {
  const handleDeleteRow = useCallback(async (e: React.MouseEvent, r: BugReport) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer « ${r.title} » ? Les images associées seront aussi supprimées.`)) return;
    try {
      await bugReportManagementService.deleteReport(r.id, DEFAULT_CLUB_ID, r.screenshots);
      toast.success('Signalement supprimé');
    } catch (err) {
      toast.error('Erreur lors de la suppression');
    }
  }, []);

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Bug
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
              Rapporteur
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
              Page
            </th>
            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Priorité
            </th>
            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Statut
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
              Date
            </th>
            <th className="w-10 px-2 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
          {reports.map((r) => {
            const statusCfg = BUG_STATUS_CONFIG[r.status] || BUG_STATUS_CONFIG.nouveau;
            const priorityCfg = BUG_PRIORITY_CONFIG[r.priority] || BUG_PRIORITY_CONFIG.minor;
            const isClosed = r.status === 'ferme';
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r)}
                className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {(r.screenshots.length > 0 || r.screenshotUrl) && (
                      <img
                        src={r.screenshots[0]?.url || r.screenshotUrl || ''}
                        alt=""
                        className="w-10 h-10 rounded border border-gray-200 dark:border-dark-border object-cover flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {r.title}
                      </div>
                      {r.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                          {r.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
                  {r.reporter.name}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                    {r.currentRoute}
                  </code>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityCfg.bgColor} ${priorityCfg.color}`}>
                    {priorityCfg.emoji} {priorityCfg.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
                    {statusCfg.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell whitespace-nowrap">
                  {timeAgo(r.createdAt)}
                </td>
                <td className="px-2 py-3 text-center">
                  {isClosed && (
                    <button
                      onClick={(e) => handleDeleteRow(e, r)}
                      title="Supprimer ce bug fermé"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// Kanban View
// ============================================

const KANBAN_COLUMNS: BugStatus[] = ['nouveau', 'en_cours', 'resolu', 'ferme'];

function KanbanView({
  reports,
  onSelect,
}: {
  reports: BugReport[];
  onSelect: (r: BugReport) => void;
}) {
  const columns = useMemo(() => {
    const map: Record<BugStatus, BugReport[]> = {
      nouveau: [],
      en_cours: [],
      resolu: [],
      ferme: [],
    };
    reports.forEach((r) => {
      if (map[r.status]) {
        map[r.status].push(r);
      } else {
        map.nouveau.push(r);
      }
    });
    return map;
  }, [reports]);

  const handleDrop = useCallback(async (reportId: string, newStatus: BugStatus) => {
    try {
      await bugReportManagementService.updateStatus(reportId, newStatus);
      toast.success(`Statut mis à jour: ${BUG_STATUS_CONFIG[newStatus].label}`);
    } catch (e) {
      toast.error('Erreur lors de la mise à jour');
    }
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {KANBAN_COLUMNS.map((status) => {
        const cfg = BUG_STATUS_CONFIG[status];
        const items = columns[status];
        return (
          <KanbanColumn
            key={status}
            status={status}
            config={cfg}
            items={items}
            onSelect={onSelect}
            onDrop={handleDrop}
          />
        );
      })}
    </div>
  );
}

function KanbanColumn({
  status,
  config,
  items,
  onSelect,
  onDrop,
}: {
  status: BugStatus;
  config: typeof BUG_STATUS_CONFIG.nouveau;
  items: BugReport[];
  onSelect: (r: BugReport) => void;
  onDrop: (reportId: string, newStatus: BugStatus) => void;
}) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('ring-2', 'ring-calypso-blue');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-2', 'ring-calypso-blue');
  };

  const handleDropEvt = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-2', 'ring-calypso-blue');
    const reportId = e.dataTransfer.getData('reportId');
    if (reportId) {
      onDrop(reportId, status);
    }
  };

  return (
    <div
      className="bg-gray-100 dark:bg-dark-bg-tertiary rounded-xl p-3 min-h-[300px] transition-all"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvt}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{config.emoji}</span>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">
            {config.label}
          </span>
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-dark-bg-secondary px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {items.map((r) => (
          <KanbanCard key={r.id} report={r} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  report,
  onSelect,
}: {
  report: BugReport;
  onSelect: (r: BugReport) => void;
}) {
  const priorityCfg = BUG_PRIORITY_CONFIG[report.priority] || BUG_PRIORITY_CONFIG.minor;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('reportId', report.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect(report)}
      className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-3 cursor-pointer hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-gray-900 dark:text-white leading-snug">
            {report.title}
          </div>
        </div>
      </div>

      {(report.screenshots.length > 0 || report.screenshotUrl) && (
        <img
          src={report.screenshots[0]?.url || report.screenshotUrl || ''}
          alt=""
          className="w-full h-20 object-cover rounded border border-gray-100 dark:border-dark-border mb-2"
        />
      )}

      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center text-xs ${priorityCfg.color}`}>
          {priorityCfg.emoji} {priorityCfg.label}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {timeAgo(report.createdAt)}
        </span>
      </div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
        {report.reporter.name}
      </div>
    </div>
  );
}

// ============================================
// Detail Panel (Slide-over)
// ============================================

function DetailPanel({
  report,
  onClose,
  currentUser,
  currentAppUser,
}: {
  report: BugReport;
  onClose: () => void;
  currentUser: any;
  currentAppUser: any;
}) {
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const [comments, setComments] = useState<BugReportComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);

  // Editable title state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(report.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Editable description state
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(report.description);
  const [savingDescription, setSavingDescription] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Attachment upload state
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  // Sync edited title when report changes
  useEffect(() => {
    if (!isEditingTitle) {
      setEditedTitle(report.title);
    }
  }, [report.title, isEditingTitle]);

  // Auto-focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.setSelectionRange(
        titleInputRef.current.value.length,
        titleInputRef.current.value.length
      );
    }
  }, [isEditingTitle]);

  // Sync edited description when report changes
  useEffect(() => {
    if (!isEditingDescription) {
      setEditedDescription(report.description);
    }
  }, [report.description, isEditingDescription]);

  // Auto-focus textarea when editing
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
      descriptionRef.current.setSelectionRange(
        descriptionRef.current.value.length,
        descriptionRef.current.value.length
      );
    }
  }, [isEditingDescription]);

  const statusCfg = BUG_STATUS_CONFIG[report.status] || BUG_STATUS_CONFIG.nouveau;
  const priorityCfg = BUG_PRIORITY_CONFIG[report.priority] || BUG_PRIORITY_CONFIG.minor;

  // Load comments
  useEffect(() => {
    setLoadingComments(true);
    bugReportManagementService
      .fetchComments(report.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [report.id]);

  // Copy to Claude Code
  const handleCopyToClaudeCode = useCallback(async () => {
    const prompt = bugReportManagementService.generateClaudeCodePrompt(report);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedClipboard(true);
      toast.success('Copié vers le presse-papiers ! Collez dans Claude Code.');
      setTimeout(() => setCopiedClipboard(false), 3000);
    } catch (e) {
      toast.error('Erreur de copie');
    }
  }, [report]);

  // Change status
  const handleStatusChange = useCallback(
    async (newStatus: BugStatus) => {
      try {
        await bugReportManagementService.updateStatus(report.id, newStatus);
        toast.success(`Statut → ${BUG_STATUS_CONFIG[newStatus].label}`);
      } catch (e) {
        toast.error('Erreur lors de la mise à jour');
      }
    },
    [report.id]
  );

  // Change priority
  const handlePriorityChange = useCallback(
    async (newPriority: BugPriority) => {
      try {
        await bugReportManagementService.updatePriority(report.id, newPriority);
        toast.success(`Priorité → ${BUG_PRIORITY_CONFIG[newPriority].label}`);
      } catch (e) {
        toast.error('Erreur lors de la mise à jour');
      }
    },
    [report.id]
  );

  // Add comment
  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !currentUser) return;
    const userName = currentAppUser ? getDisplayName(currentAppUser) : currentUser.email || 'Admin';
    try {
      await bugReportManagementService.addComment(report.id, {
        authorName: userName,
        authorUid: currentUser.uid,
        text: newComment.trim(),
      });
      setNewComment('');
      // Refresh comments
      const updated = await bugReportManagementService.fetchComments(report.id);
      setComments(updated);
    } catch (e) {
      toast.error('Erreur lors de l\'ajout du commentaire');
    }
  }, [newComment, report.id, currentUser, currentAppUser]);

  // Delete report (with screenshots + comments cleanup)
  const handleDelete = useCallback(async () => {
    if (!window.confirm('Supprimer ce signalement ? Cette action est irréversible.')) return;
    try {
      await bugReportManagementService.deleteReport(report.id, DEFAULT_CLUB_ID, report.screenshots);
      toast.success('Signalement supprimé');
      onClose();
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    }
  }, [report.id, report.screenshots, onClose]);

  // Save title
  const handleSaveTitle = useCallback(async () => {
    if (!editedTitle.trim()) {
      toast.error('Le titre ne peut pas être vide');
      return;
    }
    if (editedTitle === report.title) {
      setIsEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      await bugReportManagementService.updateTitle(report.id, editedTitle.trim());
      toast.success('Titre mis à jour');
      setIsEditingTitle(false);
    } catch (e) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSavingTitle(false);
    }
  }, [editedTitle, report.title, report.id]);

  // Save description
  const handleSaveDescription = useCallback(async () => {
    if (editedDescription === report.description) {
      setIsEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      await bugReportManagementService.updateDescription(report.id, editedDescription);
      toast.success('Description mise à jour');
      setIsEditingDescription(false);
    } catch (e) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSavingDescription(false);
    }
  }, [editedDescription, report.description, report.id]);

  // Upload attachment
  const handleAttachmentUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} est trop volumineux (max 10 MB)`);
          continue;
        }
        await bugReportManagementService.addAttachment(
          report.id,
          file,
          report.screenshots
        );
        toast.success(`${file.name} ajouté`);
      }
    } catch (err) {
      toast.error('Erreur lors de l\'upload');
    } finally {
      setUploadingAttachment(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [report.id, report.screenshots]);

  // Shared file processing logic (used by drag-drop and paste)
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingAttachment(true);
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} est trop volumineux (max 10 MB)`);
          continue;
        }
        await bugReportManagementService.addAttachment(
          report.id,
          file,
          report.screenshots
        );
        toast.success(`${file.name} ajouté`);
      }
    } catch (err) {
      toast.error('Erreur lors de l\'upload');
    } finally {
      setUploadingAttachment(false);
    }
  }, [report.id, report.screenshots]);

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  }, [processFiles]);

  // Paste handler (for clipboard screenshots)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        processFiles(pastedFiles);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [processFiles]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-[101] w-full max-w-2xl bg-white dark:bg-dark-bg-secondary shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" title={report.id}>
                  <Hash className="w-3 h-3" />
                  {report.id.substring(0, 8)}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
                  {statusCfg.emoji} {statusCfg.label}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityCfg.bgColor} ${priorityCfg.color}`}>
                  {priorityCfg.emoji} {priorityCfg.label}
                </span>
              </div>
              {isEditingTitle ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditedTitle(report.title);
                        setIsEditingTitle(false);
                      }
                      if (e.key === 'Enter') {
                        handleSaveTitle();
                      }
                    }}
                    className="flex-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-lg font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  />
                  <button
                    onClick={handleSaveTitle}
                    disabled={savingTitle}
                    className="px-2 py-1 rounded-lg bg-calypso-blue text-white text-xs font-medium hover:bg-calypso-blue/90 disabled:opacity-50 transition-colors"
                  >
                    {savingTitle ? '...' : 'OK'}
                  </button>
                  <button
                    onClick={() => {
                      setEditedTitle(report.title);
                      setIsEditingTitle(false);
                    }}
                    className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <h2
                  className="text-lg font-semibold text-gray-900 dark:text-white group/title cursor-pointer flex items-center gap-1.5"
                  onClick={() => setIsEditingTitle(true)}
                  title="Cliquer pour modifier le titre"
                >
                  {report.title}
                  <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                </h2>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Description (editable) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
              </h3>
              {!isEditingDescription && (
                <button
                  onClick={() => setIsEditingDescription(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Modifier
                </button>
              )}
            </div>
            {isEditingDescription ? (
              <div className="space-y-2">
                <textarea
                  ref={descriptionRef}
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditedDescription(report.description);
                      setIsEditingDescription(false);
                    }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSaveDescription();
                    }
                  }}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-calypso-blue focus:border-transparent resize-y"
                  placeholder="Décrivez le problème..."
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveDescription}
                    disabled={savingDescription}
                    className="px-3 py-1.5 rounded-lg bg-calypso-blue text-white text-xs font-medium hover:bg-calypso-blue/90 disabled:opacity-50 transition-colors"
                  >
                    {savingDescription ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                  <button
                    onClick={() => {
                      setEditedDescription(report.description);
                      setIsEditingDescription(false);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Annuler
                  </button>
                  <span className="text-[10px] text-gray-400 ml-auto">⌘+Enter pour sauver · Esc pour annuler</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {report.description || <span className="italic text-gray-400">Aucune description</span>}
              </p>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4">
            <MetaItem icon={<User className="w-4 h-4" />} label="Rapporteur" value={`${report.reporter.name}`} subValue={report.reporter.email} />
            <MetaItem icon={<MapPin className="w-4 h-4" />} label="Page" value={report.currentRoute} isCode />
            <MetaItem icon={<Monitor className="w-4 h-4" />} label="Navigateur" value={report.device.model} subValue={`${report.device.osVersion} — v${report.device.appVersion}`} />
            <MetaItem icon={<Clock className="w-4 h-4" />} label="Signalé le" value={formatDate(report.createdAt)} />
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 dark:border-dark-border pt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              {/* Status change */}
              <select
                value={report.status}
                onChange={(e) => handleStatusChange(e.target.value as BugStatus)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-700 dark:text-gray-300"
              >
                {(Object.keys(BUG_STATUS_CONFIG) as BugStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {BUG_STATUS_CONFIG[s].emoji} {BUG_STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>

              {/* Priority change */}
              <select
                value={report.priority}
                onChange={(e) => handlePriorityChange(e.target.value as BugPriority)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-700 dark:text-gray-300"
              >
                {(Object.keys(BUG_PRIORITY_CONFIG) as BugPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {BUG_PRIORITY_CONFIG[p].emoji} {BUG_PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>

              {/* Copy to Claude Code */}
              <button
                onClick={handleCopyToClaudeCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-medium hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
              >
                {copiedClipboard ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedClipboard ? 'Copié !' : 'Envoyer à Claude Code'}
              </button>

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-auto"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer
              </button>
            </div>
          </div>

          {/* Comments */}
          <div className="border-t border-gray-200 dark:border-dark-border pt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" />
              Commentaires
            </h3>

            {loadingComments ? (
              <div className="text-sm text-gray-400">Chargement...</div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                Aucun commentaire
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {c.authorName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {timeAgo(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {c.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
                placeholder="Ajouter un commentaire..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="px-3 py-2 rounded-lg bg-calypso-blue text-white text-sm hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Add Attachment — placed above gallery */}
          <div className="border-t border-gray-200 dark:border-dark-border pt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
              <Upload className="w-4 h-4" />
              Ajouter des pièces jointes
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip"
              onChange={handleAttachmentUpload}
              className="hidden"
            />
            <div
              ref={dropZoneRef}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploadingAttachment && fileInputRef.current?.click()}
              className={`w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed text-sm transition-all cursor-pointer ${
                isDraggingOver
                  ? 'border-calypso-blue bg-calypso-blue/10 text-calypso-blue scale-[1.02]'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-calypso-blue hover:text-calypso-blue dark:hover:border-calypso-blue dark:hover:text-calypso-blue'
              } ${uploadingAttachment ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploadingAttachment ? (
                <>
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Upload en cours...</span>
                </>
              ) : isDraggingOver ? (
                <>
                  <Upload className="w-6 h-6" />
                  <span className="font-medium">Déposez les fichiers ici</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Glissez des fichiers ici, collez depuis le presse-papiers, ou cliquez</span>
                </>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-center">
              Images, PDF, documents — max 10 MB par fichier · Ctrl+V pour coller une capture d'écran
            </p>
          </div>

          {/* Screenshots & Image Attachments Gallery */}
          {(() => {
            // Helper: is this item displayable as an image?
            const isImageItem = (s: typeof report.screenshots[0]) => {
              // Auto-captured screenshots (no 'attachment_' in path) are always images
              if (!s.storagePath?.includes('attachment_')) return true;
              // Manually added attachment: check if it's an image
              return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(s.url) || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(s.page);
            };
            const getAttachmentIcon = (page: string) => {
              if (/\.(pdf)$/i.test(page)) return '📄';
              if (/\.(xls|xlsx|csv)$/i.test(page)) return '📊';
              if (/\.(doc|docx|txt)$/i.test(page)) return '📝';
              if (/\.(zip|rar|7z)$/i.test(page)) return '📦';
              return '📎';
            };

            const imageItems = report.screenshots.filter(isImageItem);
            const fileAttachments = report.screenshots.filter((s) => s.storagePath?.includes('attachment_') && !isImageItem(s));

            return (
              <>
                {/* Image gallery */}
                {imageItems.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {imageItems.length === 1 ? 'Capture d\'écran' : `Captures d'écran & images (${imageItems.length})`}
                      </h3>
                      {report.status === 'ferme' && (
                        <button
                          onClick={async () => {
                            if (!confirm('Supprimer toutes les captures ?')) return;
                            try {
                              await bugReportManagementService.deleteAllScreenshots(report.id, report.screenshots);
                              toast.success('Captures supprimées');
                            } catch (e) {
                              console.error('Erreur suppression screenshots:', e);
                              toast.error('Erreur lors de la suppression');
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Supprimer toutes les captures (bug fermé)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Tout supprimer
                        </button>
                      )}
                    </div>
                    <div className={`grid gap-2 ${imageItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {imageItems.map((s, i) => {
                        const globalIndex = report.screenshots.indexOf(s);
                        return (
                          <div key={i} className="relative group">
                            <a href={s.url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={s.url}
                                alt={`Screenshot ${i + 1}`}
                                className="w-full rounded-lg border border-gray-200 dark:border-dark-border hover:opacity-90 transition-opacity cursor-zoom-in object-cover object-top"
                                style={{ maxHeight: imageItems.length === 1 ? 'none' : '200px' }}
                              />
                            </a>
                            {/* Page label overlay */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 rounded-b-lg">
                              <code className="text-[10px] text-white/90">{s.page}</code>
                            </div>
                            {/* Badge number for multi */}
                            {imageItems.length > 1 && (
                              <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                                {i + 1}
                              </span>
                            )}
                            {/* Attachment badge for manually added images */}
                            {s.storagePath?.includes('attachment_') && (
                              <span className="absolute top-1.5 right-8 px-1.5 py-0.5 rounded-full bg-calypso-blue/80 text-white text-[9px] font-medium shadow">
                                pièce jointe
                              </span>
                            )}
                            {/* Individual delete for closed bugs */}
                            {report.status === 'ferme' && imageItems.length > 1 && (
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  if (!confirm(`Supprimer la capture ${i + 1} ?`)) return;
                                  try {
                                    await bugReportManagementService.deleteScreenshotByIndex(report.id, globalIndex, report.screenshots);
                                    toast.success('Capture supprimée');
                                  } catch (e) {
                                    toast.error('Erreur lors de la suppression');
                                  }
                                }}
                                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                title="Supprimer cette capture"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Non-image file attachments */}
                {fileAttachments.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4" />
                      Fichiers joints ({fileAttachments.length})
                    </h3>
                    <div className="space-y-1.5">
                      {fileAttachments.map((s, i) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        >
                          <span className="text-base flex-shrink-0">{getAttachmentIcon(s.page)}</span>
                          <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{s.page}</span>
                          <span className="text-xs text-calypso-blue flex-shrink-0">Ouvrir</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

        </div>
      </div>
    </>
  );
}

// ============================================
// Meta Item
// ============================================

function MetaItem({
  icon,
  label,
  value,
  subValue,
  isCode,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  isCode?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-gray-400 dark:text-gray-500 mt-0.5">{icon}</div>
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        {isCode ? (
          <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">
            {value}
          </code>
        ) : (
          <div className="text-sm text-gray-900 dark:text-white">{value}</div>
        )}
        {subValue && (
          <div className="text-xs text-gray-400 dark:text-gray-500">{subValue}</div>
        )}
      </div>
    </div>
  );
}

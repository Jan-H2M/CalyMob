import { useState, useEffect, useRef } from 'react';
import { logger } from '@/utils/logger';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Megaphone, Plus, Pencil, Trash2, X, User, Calendar, Info, AlertTriangle, AlertCircle, MessageCircle, ChevronRight, Send, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/utils/formatters';
import {
  getAnnonces,
  createAnnonce,
  updateAnnonce,
  deleteAnnonce,
  getTypeInfo,
  subscribeToAnnonceReplies,
  sendAnnonceReply,
  uploadAnnonceAttachment,
} from '@/services/annonceService';
import type { Annonce, AnnonceType } from '@/services/annonceService';
import type { AnnouncementReply, MessageAttachment } from '@/types/communication';

export function PushNotificationsPage() {
  const navigate = useNavigate();
  const { clubId, user, session } = useAuth();

  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnonce, setEditingAnnonce] = useState<Annonce | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formType, setFormType] = useState<AnnonceType>('info');
  const [formAttachments, setFormAttachments] = useState<MessageAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Replies panel state
  const [selectedAnnonce, setSelectedAnnonce] = useState<Annonce | null>(null);
  const [replies, setReplies] = useState<AnnouncementReply[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    // Wait for both clubId and session to be available
    // Session indicates that the user is fully authenticated and session is validated
    if (clubId && session) {
      loadAnnonces();
    }
  }, [clubId, session]);

  // Subscribe to replies when an annonce is selected
  useEffect(() => {
    if (!clubId || !selectedAnnonce) {
      setReplies([]);
      return;
    }

    const unsubscribe = subscribeToAnnonceReplies(
      clubId,
      selectedAnnonce.id,
      (newReplies) => setReplies(newReplies)
    );

    return () => unsubscribe();
  }, [clubId, selectedAnnonce]);

  const loadAnnonces = async () => {
    if (!clubId) return;
    try {
      setLoading(true);
      const data = await getAnnonces(clubId);
      setAnnonces(data);
    } catch (error) {
      logger.error('Error loading annonces:', error);
      toast.error('Erreur lors du chargement des annonces');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingAnnonce(null);
    setFormTitle('');
    setFormMessage('');
    setFormType('info');
    setFormAttachments([]);
    setPendingFiles([]);
    setIsModalOpen(true);
  };

  const openEditModal = (annonce: Annonce) => {
    setEditingAnnonce(annonce);
    setFormTitle(annonce.title);
    setFormMessage(annonce.message);
    setFormType(annonce.type);
    setFormAttachments(annonce.attachments || []);
    setPendingFiles([]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAnnonce(null);
    setFormAttachments([]);
    setPendingFiles([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Accept images and PDFs
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        if (file.size <= 10 * 1024 * 1024) { // 10MB limit
          validFiles.push(file);
        } else {
          toast.error(`${file.name} est trop volumineux (max 10MB)`);
        }
      } else {
        toast.error(`${file.name}: type de fichier non supporté`);
      }
    }

    setPendingFiles(prev => [...prev, ...validFiles]);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = (index: number) => {
    setFormAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const openRepliesPanel = (annonce: Annonce) => {
    setSelectedAnnonce(annonce);
  };

  const closeRepliesPanel = () => {
    setSelectedAnnonce(null);
    setReplies([]);
    setReplyMessage('');
  };

  const handleSendReply = async () => {
    if (!clubId || !user || !selectedAnnonce || !replyMessage.trim()) return;

    try {
      setSendingReply(true);
      await sendAnnonceReply(
        clubId,
        selectedAnnonce.id,
        user.uid,
        user.displayName || user.email?.split('@')[0] || 'Admin',
        replyMessage.trim()
      );
      setReplyMessage('');
      // Refresh annonces to update reply count
      loadAnnonces();
    } catch (error) {
      logger.error('Error sending reply:', error);
      toast.error('Erreur lors de l\'envoi de la réponse');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSave = async () => {
    if (!clubId || !user) return;

    if (!formTitle.trim()) {
      toast.error('Le titre est requis');
      return;
    }
    if (!formMessage.trim()) {
      toast.error('Le message est requis');
      return;
    }

    try {
      setSaving(true);

      // Upload pending files first
      let allAttachments = [...formAttachments];
      if (pendingFiles.length > 0) {
        setUploadingFiles(true);
        const tempAnnonceId = editingAnnonce?.id || `temp_${Date.now()}`;

        for (const file of pendingFiles) {
          try {
            const type = file.type.startsWith('image/') ? 'image' : 'pdf';
            const attachment = await uploadAnnonceAttachment(clubId, tempAnnonceId, file, type);
            allAttachments.push(attachment);
          } catch (uploadError) {
            logger.error('Error uploading file:', uploadError);
            toast.error(`Erreur lors de l'upload de ${file.name}`);
          }
        }
        setUploadingFiles(false);
      }

      if (editingAnnonce) {
        // Update existing
        await updateAnnonce(clubId, editingAnnonce.id, {
          title: formTitle.trim(),
          message: formMessage.trim(),
          type: formType,
          attachments: allAttachments,
        });
        toast.success('Annonce mise à jour');
      } else {
        // Create new
        await createAnnonce(clubId, {
          title: formTitle.trim(),
          message: formMessage.trim(),
          type: formType,
          sender_id: user.uid,
          sender_name: user.displayName || user.email?.split('@')[0] || 'Admin',
          attachments: allAttachments,
        });
        toast.success('Annonce créée');
      }

      closeModal();
      loadAnnonces();
    } catch (error) {
      logger.error('Error saving annonce:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
      setUploadingFiles(false);
    }
  };

  const handleDelete = async (annonce: Annonce) => {
    if (!clubId) return;

    if (!window.confirm(`Voulez-vous vraiment supprimer l'annonce "${annonce.title}" ?`)) {
      return;
    }

    try {
      await deleteAnnonce(clubId, annonce.id, user?.uid);
      toast.success('Annonce supprimée');
      loadAnnonces();
    } catch (error) {
      logger.error('Error deleting annonce:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const getTypeIcon = (type: AnnonceType) => {
    switch (type) {
      case 'info':
        return <Info className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      case 'urgent':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        {/* Breadcrumb */}
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
            Annonces du club
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              Annonces du club
            </h1>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              Gérez les annonces visibles par tous les membres dans l'application mobile.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Nouvelle annonce
          </button>
        </div>
      </div>

      {/* Annonces List */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
          </div>
        ) : annonces.length === 0 ? (
          <div className="text-center py-12">
            <Megaphone className="h-16 w-16 mx-auto text-gray-400 dark:text-dark-text-muted mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
              Aucune annonce
            </h2>
            <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
              Créez votre première annonce pour informer vos membres.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Créer une annonce
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {annonces.map((annonce) => {
              const typeInfo = getTypeInfo(annonce.type);

              return (
                <div
                  key={annonce.id}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Type badge and Title */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${typeInfo.bgColor} ${typeInfo.color}`}>
                          {getTypeIcon(annonce.type)}
                          {typeInfo.label}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary truncate">
                          {annonce.title}
                        </h3>
                      </div>

                      {/* Message */}
                      <p className="text-gray-600 dark:text-dark-text-secondary mb-3 line-clamp-2">
                        {annonce.message}
                      </p>

                      {/* Meta info */}
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>{annonce.sender_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDateTime(annonce.created_at)}</span>
                        </div>
                        {/* Attachments count */}
                        {annonce.attachments && annonce.attachments.length > 0 && (
                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Paperclip className="h-4 w-4" />
                            <span>{annonce.attachments.length} fichier{annonce.attachments.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {/* Reply count - clickable to open replies */}
                        <button
                          onClick={() => openRepliesPanel(annonce)}
                          className="flex items-center gap-1 hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span>{annonce.reply_count || 0} réponse{(annonce.reply_count || 0) !== 1 ? 's' : ''}</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => openEditModal(annonce)}
                        className="p-2 text-gray-600 dark:text-dark-text-secondary hover:text-calypso-blue hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(annonce)}
                        className="p-2 text-gray-600 dark:text-dark-text-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                {editingAnnonce ? 'Modifier l\'annonce' : 'Nouvelle annonce'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Type d'annonce
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['info', 'warning', 'urgent'] as AnnonceType[]).map((type) => {
                    const info = getTypeInfo(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormType(type)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${
                          formType === type
                            ? `${info.bgColor} ${info.color} border-current`
                            : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                        }`}
                      >
                        {getTypeIcon(type)}
                        <span className="font-medium">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Titre *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Sortie club ce weekend"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  maxLength={100}
                />
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">{formTitle.length}/100 caractères</p>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Message *
                </label>
                <textarea
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  placeholder="Le contenu de votre annonce..."
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary resize-none"
                  maxLength={1000}
                />
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">{formMessage.length}/1000 caractères</p>
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Pièces jointes
                </label>

                {/* Existing attachments */}
                {formAttachments.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {formAttachments.map((attachment, index) => (
                      <div
                        key={`existing-${index}`}
                        className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg"
                      >
                        {attachment.type === 'image' ? (
                          <ImageIcon className="h-5 w-5 text-blue-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-red-500" />
                        )}
                        <span className="flex-1 text-sm text-gray-700 dark:text-dark-text-primary truncate">
                          {attachment.filename}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeExistingAttachment(index)}
                          className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-red-500 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending files to upload */}
                {pendingFiles.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {pendingFiles.map((file, index) => (
                      <div
                        key={`pending-${index}`}
                        className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                      >
                        {file.type.startsWith('image/') ? (
                          <ImageIcon className="h-5 w-5 text-amber-600" />
                        ) : (
                          <FileText className="h-5 w-5 text-amber-600" />
                        )}
                        <span className="flex-1 text-sm text-amber-700 dark:text-amber-300 truncate">
                          {file.name}
                          <span className="text-xs ml-2 text-amber-500">
                            ({(file.size / 1024).toFixed(0)} KB - à uploader)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removePendingFile(index)}
                          className="p-1 text-amber-400 hover:text-red-500 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-gray-600 dark:text-dark-text-secondary hover:border-calypso-blue hover:text-calypso-blue dark:hover:border-calypso-aqua dark:hover:text-calypso-aqua transition-colors w-full justify-center"
                >
                  <Paperclip className="h-5 w-5" />
                  Ajouter des fichiers (images ou PDF)
                </button>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">Max 10MB par fichier</p>
              </div>

              {/* Info box */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Cette annonce sera visible par tous les membres dans l'application mobile CalyMob.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    {uploadingFiles ? 'Upload fichiers...' : 'Sauvegarde...'}
                  </>
                ) : (
                  <>
                    {editingAnnonce ? 'Mettre à jour' : 'Publier'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replies Panel (Slide-over) */}
      {selectedAnnonce && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/50" onClick={closeRepliesPanel} />
          <div className="absolute inset-y-0 right-0 flex max-w-full">
            <div className="w-screen max-w-md">
              <div className="flex h-full flex-col bg-white dark:bg-dark-bg-secondary shadow-xl">
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-dark-border">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                      Réponses
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary truncate max-w-[280px]">
                      {selectedAnnonce.title}
                    </p>
                  </div>
                  <button
                    onClick={closeRepliesPanel}
                    className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Original Announcement */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getTypeInfo(selectedAnnonce.type).bgColor} ${getTypeInfo(selectedAnnonce.type).color}`}>
                      {getTypeIcon(selectedAnnonce.type)}
                      {getTypeInfo(selectedAnnonce.type).label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-dark-text-primary line-clamp-3">
                    {selectedAnnonce.message}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary mt-2">
                    {selectedAnnonce.sender_name} • {formatDateTime(selectedAnnonce.created_at)}
                  </p>
                </div>

                {/* Replies List */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {replies.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageCircle className="h-12 w-12 mx-auto text-gray-400 dark:text-dark-text-muted mb-3" />
                      <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary">
                        Aucune réponse pour le moment
                      </p>
                    </div>
                  ) : (
                    replies.map((reply) => (
                      <div
                        key={reply.id}
                        className={`p-3 rounded-lg ${
                          reply.sender_id === user?.uid
                            ? 'bg-calypso-blue/10 dark:bg-calypso-blue/20 ml-4'
                            : 'bg-gray-100 dark:bg-dark-bg-tertiary mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {reply.sender_name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-tertiary">
                            {formatDateTime(reply.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-dark-text-primary">
                          {reply.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Input */}
                <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-border">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Votre réponse..."
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      disabled={sendingReply}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={sendingReply || !replyMessage.trim()}
                      className="p-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sendingReply ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

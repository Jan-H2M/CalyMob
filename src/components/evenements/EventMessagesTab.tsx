import { logger } from '@/utils/logger';
/**
 * EventMessagesTab - Messages tab for event detail view
 * Shows chat-like messages from event participants
 * Supports replies, read tracking, and attachments
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Trash2, User, Reply, Eye, Paperclip, X, Image, FileText } from 'lucide-react';
import { EventMessage, ReplyPreview, MessageAttachment } from '@/types/communication';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToEventMessages,
  sendEventMessage,
  deleteEventMessage,
  markMessageAsRead,
  uploadMessageAttachment,
  createReplyPreview
} from '@/services/eventMessageService';
import { getFirstName, getLastName, getRole } from '@/utils/fieldMapper';
import toast from 'react-hot-toast';

interface EventMessagesTabProps {
  clubId: string;
  operationId: string;
  operationTitre: string;
  isParticipant: boolean;
}

export function EventMessagesTab({
  clubId,
  operationId,
  operationTitre,
  isParticipant
}: EventMessagesTabProps) {
  const { appUser } = useAuth();

  // Debug: log user role
  const userRole = appUser ? getRole(appUser) : null;
  logger.debug('📨 [EventMessagesTab] User check:', {
    hasUser: !!appUser,
    userId: appUser?.id,
    userRole,
    userAppRole: appUser?.app_role,
    isParticipant,
    canSendMessage: isParticipant || (appUser && ['superadmin', 'admin', 'validateur'].includes(userRole || ''))
  });
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<EventMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to messages
  useEffect(() => {
    logger.debug('📨 [EventMessagesTab] Subscribing to messages:', { clubId, operationId });
    if (!clubId || !operationId) {
      logger.warn('📨 [EventMessagesTab] Missing clubId or operationId');
      setError('Configuration manquante');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const unsubscribe = subscribeToEventMessages(clubId, operationId, (msgs: EventMessage[]) => {
        logger.debug('📨 [EventMessagesTab] Received messages:', msgs.length);
        setMessages(msgs);
        setIsLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      logger.error('📨 [EventMessagesTab] Error subscribing:', err);
      setError('Erreur de chargement des messages');
      setIsLoading(false);
    }
  }, [clubId, operationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read when they become visible
  useEffect(() => {
    if (!appUser || messages.length === 0) return;

    messages.forEach(msg => {
      if (!msg.read_by?.includes(appUser.id)) {
        markMessageAsRead(clubId, operationId, msg.id, appUser.id).catch(err => logger.error('Failed to mark message as read', err));
      }
    });
  }, [messages, appUser, clubId, operationId]);

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !appUser || isSending) return;

    setIsSending(true);
    const userRole = getRole(appUser);
    logger.debug('📨 [EventMessagesTab] Sending message:', {
      clubId,
      operationId,
      userId: appUser.id,
      userRole,
      isParticipant,
      messageLength: newMessage.length,
      attachmentCount: pendingAttachments.length,
      replyingTo: replyingTo?.id
    });

    try {
      // Upload attachments first
      let attachments: MessageAttachment[] | undefined;
      if (pendingAttachments.length > 0) {
        attachments = [];
        for (const file of pendingAttachments) {
          const type = file.type.startsWith('image/') ? 'image' : 'pdf';
          const attachment = await uploadMessageAttachment(clubId, operationId, file, type as 'image' | 'pdf');
          attachments.push(attachment);
        }
      }

      // Create reply preview if replying
      let replyToPreview: ReplyPreview | undefined;
      if (replyingTo) {
        replyToPreview = createReplyPreview(replyingTo);
      }

      const senderName = `${getFirstName(appUser)} ${getLastName(appUser)}`.trim() || appUser.email || 'Utilisateur';
      await sendEventMessage(clubId, operationId, appUser.id, senderName, newMessage, {
        replyToId: replyingTo?.id,
        replyToPreview,
        attachments
      });
      logger.debug('📨 [EventMessagesTab] Message sent successfully');
      setNewMessage('');
      setReplyingTo(null);
      setPendingAttachments([]);
    } catch (error) {
      logger.error('📨 [EventMessagesTab] Error sending message:', error);
      toast.error('Erreur lors de l\'envoi du message');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      setPendingAttachments(prev => [...prev, ...validFiles]);
    }
    e.target.value = '';
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Supprimer ce message ?')) return;

    try {
      await deleteEventMessage(clubId, operationId, messageId);
      toast.success('Message supprimé');
    } catch (error) {
      logger.error('Error deleting message:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return `Aujourd'hui ${timeStr}`;
    } else if (isYesterday) {
      return `Hier ${timeStr}`;
    } else {
      return `${date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} ${timeStr}`;
    }
  };

  return (
    <div className="flex flex-col h-[60vh] md:h-[500px]">
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-t-lg">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-dark-text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue mb-4"></div>
            <p>Chargement des messages...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500">
            <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-center">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-dark-text-muted">
            <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-center">
              Aucun message pour cet événement.
              <br />
              {isParticipant ? 'Soyez le premier à écrire !' : 'Les participants peuvent discuter ici.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.sender_id === appUser?.id;
            const userRole = appUser ? getRole(appUser) : null;
            const isAdmin = userRole === 'superadmin' || userRole === 'admin';
            const readCount = msg.read_by?.length || 0;

            return (
              <div
                key={msg.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    isOwnMessage
                      ? 'bg-calypso-blue text-white'
                      : 'bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border'
                  }`}
                >
                  {/* Sender name (only for others' messages) */}
                  {!isOwnMessage && (
                    <div className="flex items-center gap-1 mb-1">
                      <User className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />
                      <span className="text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                        {msg.sender_name}
                      </span>
                    </div>
                  )}

                  {/* Reply preview */}
                  {msg.reply_to_preview && (
                    <div className={`mb-2 p-2 rounded border-l-2 ${
                      isOwnMessage
                        ? 'bg-blue-400/30 border-blue-200'
                        : 'bg-gray-100 dark:bg-dark-bg-tertiary border-gray-400'
                    }`}>
                      <span className={`text-xs font-medium ${isOwnMessage ? 'text-blue-100' : 'text-gray-600 dark:text-dark-text-secondary'}`}>
                        {msg.reply_to_preview.sender_name}
                      </span>
                      <p className={`text-xs ${isOwnMessage ? 'text-blue-100' : 'text-gray-500 dark:text-dark-text-muted'} line-clamp-2`}>
                        {msg.reply_to_preview.message_preview}
                      </p>
                    </div>
                  )}

                  {/* Message content */}
                  <p className={`text-sm whitespace-pre-wrap ${isOwnMessage ? 'text-white' : 'text-gray-900 dark:text-dark-text-primary'}`}>
                    {msg.message}
                  </p>

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.attachments.map((attachment, idx) => (
                        <a
                          key={idx}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 p-2 rounded ${
                            isOwnMessage
                              ? 'bg-blue-400/30 hover:bg-blue-400/50'
                              : 'bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-border'
                          }`}
                        >
                          {attachment.type === 'image' ? (
                            <>
                              <Image className="h-4 w-4" />
                              <img
                                src={attachment.url}
                                alt={attachment.filename}
                                className="max-h-32 rounded"
                              />
                            </>
                          ) : (
                            <>
                              <FileText className="h-4 w-4" />
                              <span className="text-xs truncate">{attachment.filename}</span>
                            </>
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Timestamp, read count, reply and delete buttons */}
                  <div className={`flex items-center gap-2 mt-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-dark-text-muted'}`}>
                    <span className="text-xs">
                      {formatMessageTime(msg.created_at)}
                    </span>
                    {readCount > 1 && (
                      <span className="flex items-center gap-0.5 text-xs" title={`Lu par ${readCount} personnes`}>
                        <Eye className="h-3 w-3" />
                        {readCount}
                      </span>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className={`p-1 rounded hover:bg-black/10 ${isOwnMessage ? 'text-blue-100 hover:text-white' : 'text-gray-400 dark:text-dark-text-muted hover:text-calypso-blue'}`}
                      title="Répondre"
                      aria-label="Répondre"
                    >
                      <Reply className="h-3 w-3" />
                    </button>
                    {(isOwnMessage || isAdmin) && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className={`p-1 rounded hover:bg-black/10 ${isOwnMessage ? 'text-blue-100 hover:text-white' : 'text-gray-400 dark:text-dark-text-muted hover:text-red-500'}`}
                        title="Supprimer"
                        aria-label="Supprimer le message"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="border-t border-gray-200 dark:border-dark-border p-4 bg-white dark:bg-dark-bg-secondary rounded-b-lg">
        {isParticipant || (appUser && ['superadmin', 'admin', 'validateur'].includes(getRole(appUser) || '')) ? (
          <div className="space-y-2">
            {/* Reply-to bar */}
            {replyingTo && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border-l-2 border-calypso-blue">
                <Reply className="h-4 w-4 text-calypso-blue" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-calypso-blue">
                    Répondre à {replyingTo.sender_name}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted truncate">
                    {replyingTo.message}
                  </p>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded"
                  aria-label="Annuler la réponse"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {pendingAttachments.map((file, idx) => (
                  <div key={idx} className="relative group">
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="h-16 w-16 object-cover rounded border"
                      />
                    ) : (
                      <div className="h-16 w-16 flex items-center justify-center bg-red-50 dark:bg-red-900/30 rounded border">
                        <FileText className="h-6 w-6 text-red-500" />
                      </div>
                    )}
                    <button
                      onClick={() => removePendingAttachment(idx)}
                      className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Supprimer la pièce jointe"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-calypso-blue hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                title="Ajouter une pièce jointe"
                disabled={isSending}
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={replyingTo ? "Écrire une réponse..." : "Écrire un message..."}
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary resize-none"
                rows={2}
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={(!newMessage.trim() && pendingAttachments.length === 0) || isSending}
                className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-gray-500 dark:text-dark-text-muted">
            Seuls les participants inscrits peuvent envoyer des messages.
          </p>
        )}
      </div>
    </div>
  );
}

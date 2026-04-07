import { logger } from '@/utils/logger';
/**
 * EventMessagesOverview - Overview page for all event messages
 * Shows all messages chronologically with event context
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Calendar, User, ChevronRight, Search, RefreshCw } from 'lucide-react';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import { EventMessageWithContext } from '@/types/communication';
import { getAllEventMessages } from '@/services/eventMessageService';
import { formatDate } from '@/utils/utils';

export function EventMessagesOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<EventMessageWithContext[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const clubId = user?.club_id || 'calypso';

  useEffect(() => {
    loadMessages();
  }, [clubId]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const msgs = await getAllEventMessages(clubId, 200);
      setMessages(msgs);
    } catch (error) {
      logger.error('Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter messages by search query
  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      msg.message.toLowerCase().includes(query) ||
      msg.sender_name.toLowerCase().includes(query) ||
      msg.operation_titre.toLowerCase().includes(query)
    );
  });

  // Group messages by date
  const groupedMessages = filteredMessages.reduce((groups, msg) => {
    const dateKey = msg.created_at.toLocaleDateString('fr-BE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(msg);
    return groups;
  }, {} as Record<string, EventMessageWithContext[]>);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-4xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Communication', 'Messages Événements']}
          title="Messages des Événements"
          description="Historique de tous les messages échangés dans les événements"
        />

        {/* Search and refresh */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par message, auteur ou événement..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-calypso-blue dark:bg-dark-bg-secondary dark:text-dark-text-primary"
            />
          </div>
          <button
            onClick={loadMessages}
            disabled={isLoading}
            className="px-4 py-2 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {messages.length}
            </div>
            <div className="text-sm text-gray-500 dark:text-dark-text-muted">Messages total</div>
          </div>
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {new Set(messages.map(m => m.operation_id)).size}
            </div>
            <div className="text-sm text-gray-500 dark:text-dark-text-muted">Événements actifs</div>
          </div>
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {messages.filter(m => {
                const today = new Date();
                return m.created_at.toDateString() === today.toDateString();
              }).length}
            </div>
            <div className="text-sm text-gray-500 dark:text-dark-text-muted">Aujourd'hui</div>
          </div>
        </div>

        {/* Messages list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-calypso-blue" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-12 text-center border border-gray-200 dark:border-dark-border">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-dark-text-secondary" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
              Aucun message trouvé
            </h3>
            <p className="text-gray-500 dark:text-dark-text-muted">
              {searchQuery
                ? 'Aucun message ne correspond à votre recherche.'
                : 'Les messages des événements apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMessages).map(([dateKey, dayMessages]) => (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <Calendar className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                  <h3 className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary capitalize">
                    {dateKey}
                  </h3>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-dark-border" />
                </div>

                {/* Messages for this date */}
                <div className="space-y-3">
                  {dayMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 border border-gray-200 dark:border-dark-border hover:border-calypso-blue dark:hover:border-calypso-aqua transition-colors cursor-pointer"
                      onClick={() => navigate(`/operations?id=${msg.operation_id}`)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0 w-10 h-10 bg-calypso-blue/10 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-calypso-blue" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                              {msg.sender_name}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-dark-text-muted">
                              {formatTime(msg.created_at)}
                            </span>
                          </div>

                          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-2 line-clamp-2">
                            {msg.message}
                          </p>

                          {/* Event badge */}
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                              <MessageCircle className="h-3 w-3" />
                              {msg.operation_titre}
                            </span>
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="h-5 w-5 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Send, Sparkles, CheckCircle, Trash2, Palette } from 'lucide-react';
import { toast } from 'react-hot-toast';
import EmailTemplateAiService, { ChatMessage } from '@/services/emailTemplateAiService';
import type { EmailTemplateType, EmailTemplateVariable, EmailTemplateStyles } from '@/types/emailTemplates';
import type { BrandingPreset } from '@/types/branding';
import { EmailPreviewPanel } from './EmailPreviewPanel';
import { getQuickPromptsForType, hasQuickPrompts, QuickPrompt } from '@/constants/emailQuickPrompts';
import { logger } from '@/utils/logger';

interface EmailTemplateAiChatboxProps {
  emailType: EmailTemplateType;
  variables: EmailTemplateVariable[];
  styles: EmailTemplateStyles;
  subject: string;
  htmlContent: string;
  branding?: BrandingPreset | null;
  onHtmlUpdate: (html: string) => void;
  onApplyHtml: (html: string) => void;
  onApplyMetadata?: (metadata: { name: string; description: string; subject: string }) => void;
}

export default function EmailTemplateAiChatbox({
  emailType,
  variables,
  styles,
  subject,
  htmlContent,
  branding,
  onHtmlUpdate,
  onApplyHtml,
  onApplyMetadata,
}: EmailTemplateAiChatboxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generatedMetadata, setGeneratedMetadata] = useState<{ name: string; description: string; subject: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get quick prompts for current email type
  const quickPrompts = getQuickPromptsForType(emailType);
  const showQuickPrompts = hasQuickPrompts(emailType) && messages.length === 0;

  // Auto-scroll vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus sur l'input au chargement
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (messageOverride?: string) => {
    const userMessage = (messageOverride || inputValue).trim();
    if (!userMessage || isGenerating) return;

    setInputValue('');

    // Ajouter le message de l'utilisateur
    const newUserMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsGenerating(true);

    try {
      logger.debug('🤖 [AI Chatbox] Sending message to EmailTemplateAiService...');
      logger.debug('📝 [AI Chatbox] User message:', userMessage);
      logger.debug('📧 [AI Chatbox] Email type:', emailType);
      logger.debug('🎨 [AI Chatbox] Branding:', branding?.name || 'none');

      // Générer la réponse avec Claude (avec métadonnées et branding)
      const result = await EmailTemplateAiService.generateEmailWithMetadata({
        userMessage,
        emailType,
        variables,
        styles,
        conversationHistory: messages,
        currentHtmlContent: htmlContent,
        branding: branding || undefined,
      });

      logger.debug('✅ [AI Chatbox] Received response with metadata');
      logger.debug('  - Name:', result.name);
      logger.debug('  - Subject:', result.subject);
      logger.debug('  - HTML length:', result.html.length);

      // Valider le HTML (warnings uniquement dans la console, pas de toast d'erreur)
      const validation = EmailTemplateAiService.validateHtml(result.html);
      if (!validation.valid) {
        logger.warn('HTML validation warnings:', validation.errors);
        // Note: Ces avertissements sont informatifs, l'email fonctionnera quand même
      }

      // Ajouter la réponse de l'assistant
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.html,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setGeneratedHtml(result.html);
      setGeneratedMetadata({
        name: result.name,
        description: result.description,
        subject: result.subject,
      });

      // Appliquer automatiquement le HTML et les métadonnées
      logger.debug('📧 [AI Chatbox] Calling onHtmlUpdate with HTML length:', result.html.length);
      onHtmlUpdate(result.html);
      if (onApplyMetadata) {
        logger.debug('📧 [AI Chatbox] Calling onApplyMetadata:', { name: result.name, subject: result.subject });
        onApplyMetadata({
          name: result.name,
          description: result.description,
          subject: result.subject,
        });
      }

      toast.success('Template mis a jour!');
    } catch (error) {
      logger.error('Erreur lors de la génération:', error);
      toast.error(error.message || 'Erreur lors de la génération du template');

      // Ajouter un message d'erreur dans le chat
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Erreur: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Envoyer avec Cmd+Enter (Mac) ou Ctrl+Enter (Windows/Linux)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickPromptClick = (prompt: QuickPrompt) => {
    // Send the prompt directly
    handleSendMessage(prompt.prompt);

    // Apply suggested subject if callback exists
    if (onApplyMetadata && prompt.suggestedSubject) {
      // We'll let the AI response handle the subject
    }
  };

  const handleApplyHtml = () => {
    logger.debug('🔘 [AI Chatbox] handleApplyHtml called, generatedHtml:', generatedHtml ? `${generatedHtml.length} chars` : 'null');
    if (generatedHtml) {
      onApplyHtml(generatedHtml);
      toast.success('HTML appliqué au template!');
    } else {
      logger.error('[AI Chatbox] generatedHtml is null!');
      toast.error('Aucun HTML généré à appliquer');
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Effacer toute la conversation?')) {
      setMessages([]);
      setGeneratedHtml(null);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full">
      {/* GAUCHE: Chat IA (40%) */}
      <div className="w-full md:w-[40%] flex flex-col bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-semibold">Assistant IA</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Branding badge */}
            {branding && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-white/20 rounded text-xs">
                <div
                  className="w-3 h-3 rounded-full border border-white/50"
                  style={{ backgroundColor: branding.primaryColor }}
                />
                <span className="max-w-[100px] truncate">{branding.name}</span>
              </div>
            )}
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="Effacer la conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col h-full">
              {/* Quick Prompts */}
              {showQuickPrompts && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-3">
                    Choisissez un modele pour commencer:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickPrompts.map((prompt, index) => (
                      <button
                        key={index}
                        onClick={() => handleQuickPromptClick(prompt)}
                        disabled={isGenerating}
                        className="flex flex-col items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="text-2xl">{prompt.icon}</span>
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                          {prompt.label}
                        </span>
                        {prompt.description && (
                          <span className="text-xs text-gray-500 dark:text-dark-text-muted text-center">
                            {prompt.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Or separator */}
              {showQuickPrompts && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-dark-border" />
                  <span className="text-xs text-gray-500 dark:text-dark-text-muted">ou</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-dark-border" />
                </div>
              )}

              {/* Free text prompt area */}
              <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-dark-text-muted">
                <Sparkles className="w-10 h-10 mb-3 text-purple-300" />
                <h4 className="text-base font-medium mb-2">Decrivez votre email</h4>
                <p className="text-sm text-gray-400 dark:text-dark-text-muted max-w-xs">
                  Decrivez ce que vous voulez en langage naturel. L'IA generera le HTML avec votre branding.
                </p>
                {branding && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-dark-text-muted bg-gray-100 dark:bg-dark-bg-tertiary px-3 py-1.5 rounded-full">
                    <Palette className="w-3 h-3" />
                    <span>Branding "{branding.name}" sera applique</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-purple-500 text-white'
                      : msg.content.startsWith('Erreur')
                      ? 'bg-red-50 text-red-900 border border-red-200'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm">{msg.content.length > 200 ? `${msg.content.substring(0, 200)}...` : msg.content}</p>
                  ) : msg.content.startsWith('Erreur') ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">HTML genere</span>
                      </div>
                      <pre className="text-xs bg-white/50 p-2 rounded overflow-x-auto max-h-48">
                        <code>{msg.content.substring(0, 500)}...</code>
                      </pre>
                      {index === messages.length - 1 && (
                        <button
                          onClick={handleApplyHtml}
                          className="mt-2 w-full px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium"
                        >
                          Utiliser ce code
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs opacity-70 mt-1">
                    {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg px-4 py-3 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Generation en cours avec Claude...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-dark-border p-4 bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Decrivez le contenu de votre email... (Cmd/Ctrl + Enter)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary text-sm"
              rows={2}
              disabled={isGenerating}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isGenerating}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              title="Envoyer (Cmd/Ctrl + Enter)"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2">
            Astuce: Affinez le resultat avec des messages de suivi ("Ajoute une table", "Change le bouton en vert")
          </p>
        </div>
      </div>

      {/* DROITE: Preview Panel (60%) */}
      <div className="w-full md:w-[60%]">
        <EmailPreviewPanel
          htmlContent={generatedHtml || htmlContent}
          subject={generatedMetadata?.subject || subject}
          emailType={emailType}
          styles={styles}
          variables={variables}
        />
      </div>
    </div>
  );
}

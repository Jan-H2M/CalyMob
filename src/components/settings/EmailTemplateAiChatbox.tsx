import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Send, Sparkles, CheckCircle, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import EmailTemplateAiService, { ChatMessage } from '@/services/emailTemplateAiService';
import type { EmailTemplateType, EmailTemplateVariable, EmailTemplateStyles } from '@/types/emailTemplates';
import { EmailPreviewPanel } from './EmailPreviewPanel';

interface EmailTemplateAiChatboxProps {
  emailType: EmailTemplateType;
  variables: EmailTemplateVariable[];
  styles: EmailTemplateStyles;
  subject: string;
  htmlContent: string;
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

  // Auto-scroll vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus sur l'input au chargement
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMessage = inputValue.trim();
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
      console.log('🤖 [AI Chatbox] Sending message to EmailTemplateAiService...');
      console.log('📝 [AI Chatbox] User message:', userMessage);
      console.log('📧 [AI Chatbox] Email type:', emailType);
      console.log('🎨 [AI Chatbox] Styles:', styles);

      // Générer la réponse avec Claude (avec métadonnées)
      const result = await EmailTemplateAiService.generateEmailWithMetadata({
        userMessage,
        emailType,
        variables,
        styles,
        conversationHistory: messages,
        currentHtmlContent: htmlContent, // Passer le HTML actuel pour les modifications incrémentales
      });

      console.log('✅ [AI Chatbox] Received response with metadata');
      console.log('  - Name:', result.name);
      console.log('  - Subject:', result.subject);
      console.log('  - HTML length:', result.html.length);

      // Valider le HTML
      const validation = EmailTemplateAiService.validateHtml(result.html);
      if (!validation.valid) {
        console.warn('HTML validation warnings:', validation.errors);
        toast.error(`HTML généré avec des avertissements: ${validation.errors.join(', ')}`);
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
      onHtmlUpdate(result.html);
      if (onApplyMetadata) {
        onApplyMetadata({
          name: result.name,
          description: result.description,
          subject: result.subject,
        });
      }

      toast.success('✓ Template mis à jour automatiquement!');
    } catch (error: any) {
      console.error('Erreur lors de la génération:', error);
      toast.error(error.message || 'Erreur lors de la génération du template');

      // Ajouter un message d'erreur dans le chat
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `❌ Erreur: ${error.message}`,
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

  const handleApplyHtml = () => {
    if (generatedHtml) {
      onApplyHtml(generatedHtml);
      toast.success('HTML appliqué au template!');
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Effacer toute la conversation?')) {
      setMessages([]);
      setGeneratedHtml(null);
    }
  };

  return (
    <div className="flex gap-4 h-full">
      {/* GAUCHE: Chat IA (40%) */}
      <div className="w-[40%] flex flex-col bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-semibold">Assistant IA</h3>
          </div>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Sparkles className="w-12 h-12 mb-4 text-purple-300" />
            <h4 className="text-lg font-medium mb-2">Décrivez votre email en langage naturel</h4>
            <div className="text-left max-w-2xl bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
              <p className="text-xs font-semibold text-gray-700 mb-2">💡 Exemple de prompt détaillé:</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                "Crée un email professionnel pour rappeler les demandes de remboursement en attente.
                <br/><br/>
                L'email doit contenir:
                <br/>• Un en-tête avec dégradé bleu et le logo du club: &lt;img src="https://calycompta.vercel.app/logo-vertical.png" alt="Calypso" style="height: 80px;"&gt;
                <br/>• Un message d'accueil pour {'{'}recipientName{'}'}
                <br/>• Une boîte récapitulative: "{'{'}demandesCount{'}'} demande(s) en attente - Total: {'{'}totalAmount{'}'} €"
                <br/>• Un tableau avec: Date, Demandeur, Description, Montant
                <br/>• Trois exemples de demandes (15/10/2025 - Jan Andriessens - Facture OVH - 125€, etc.)
                <br/>• Un bouton bleu "Consulter les demandes" vers {'{'}appUrl{'}'}/depenses
                <br/>• Une signature "Cordialement, {'{'}clubName{'}'}"
                <br/><br/>
                Utilise les variables Handlebars: {'{'}recipientName{'}'}, {'{'}clubName{'}'}, {'{'}demandesCount{'}'}, {'{'}totalAmount{'}'}, {'{'}appUrl{'}'}, et {'{'}#each demandes{'}'} pour la boucle.
                <br/><br/>
                Style: gradient {'{'}headerGradient{'}'}, couleur primaire {'{'}primaryColor{'}'}, bouton {'{'}buttonColor{'}'}."
              </p>
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
                    : msg.content.startsWith('❌')
                    ? 'bg-red-50 text-red-900 border border-red-200'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : msg.content.startsWith('❌') ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">HTML généré</span>
                    </div>
                    <pre className="text-xs bg-white/50 p-2 rounded overflow-x-auto max-h-48">
                      <code>{msg.content.substring(0, 500)}...</code>
                    </pre>
                    {index === messages.length - 1 && (
                      <button
                        onClick={handleApplyHtml}
                        className="mt-2 w-full px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium"
                      >
                        ✓ Utiliser ce code
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
            <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              <span className="text-sm text-gray-600">Génération en cours avec Claude...</span>
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
              placeholder="Décrivez le contenu de votre email... (Cmd/Ctrl + Enter pour envoyer)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
              rows={3}
              disabled={isGenerating}
            />
            <button
              onClick={handleSendMessage}
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            💡 Astuce: Vous pouvez affiner le résultat en envoyant des messages de suivi (ex: "Rends-le plus formel", "Ajoute une table")
          </p>
        </div>
      </div>

      {/* DROITE: Preview Panel (60%) */}
      <div className="w-[60%]">
        <EmailPreviewPanel
          htmlContent={htmlContent}
          subject={subject}
          emailType={emailType}
          styles={styles}
          variables={variables}
        />
      </div>
    </div>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Calendar, FileText, Bell, MessageCircle, MailPlus, Smartphone, Palette, Users } from 'lucide-react';
import { SettingsHeader } from '@/components/settings/SettingsHeader';

interface CommunicationCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  route: string;
  disabled?: boolean;
  disabledMessage?: string;
}

export function CommunicationDashboard() {
  const navigate = useNavigate();

  const cards: CommunicationCard[] = [
    // ROW 1: Primary Channels
    {
      id: 'envoyer-email',
      title: 'Envoyer un Email',
      description: 'Envoyez des emails personnalisés à des groupes de membres',
      icon: <MailPlus className="h-8 w-8" />,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      route: '/parametres/communication/envoyer'
    },
    {
      id: 'sms',
      title: 'SMS',
      description: 'Envoyez des SMS automatiques pour rappels de paiement et notifications',
      icon: <Smartphone className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/parametres/communication/sms'
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      description: 'Envoyez des messages WhatsApp en plus des SMS via Twilio',
      icon: <MessageCircle className="h-8 w-8" />,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      route: '/parametres/communication/whatsapp',
      disabled: true,
      disabledMessage: 'Non disponible'
    },

    {
      id: 'bulk-invite',
      title: 'Invitation CalyMob',
      description: 'Invitez tous les membres à utiliser l\'application mobile en un clic',
      icon: <Users className="h-8 w-8" />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      route: '/parametres/communication/bulk-invite'
    },

    // ROW 2: Automation & Management
    {
      id: 'communication-automatisee',
      title: 'Communications Automatisées',
      description: 'Configurez des jobs planifiés pour envoyer des emails automatiques aux membres',
      icon: <Calendar className="h-8 w-8" />,
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      route: '/parametres/communication/automatisee'
    },
    {
      id: 'emails-sortants',
      title: 'Emails Sortants',
      description: 'Historique de tous les emails envoyés (manuels et automatiques)',
      icon: <Send className="h-8 w-8" />,
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      route: '/parametres/communication/emails-sortants'
    },
    {
      id: 'event-messages',
      title: 'Messages Événements',
      description: 'Historique de tous les messages échangés entre participants dans les événements',
      icon: <MessageCircle className="h-8 w-8" />,
      iconBg: 'bg-violet-100 dark:bg-violet-900/30',
      iconColor: 'text-violet-600 dark:text-violet-400',
      route: '/parametres/communication/event-messages'
    },

    // ROW 3: Templates & Configuration
    {
      id: 'templates',
      title: 'Templates d\'Emails',
      description: 'Gérez vos templates d\'emails automatiques',
      icon: <FileText className="h-8 w-8" />,
      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
      iconColor: 'text-teal-600 dark:text-teal-400',
      route: '/parametres/communication/templates'
    },
    {
      id: 'sms-templates',
      title: 'Templates SMS/WhatsApp',
      description: 'Gérez vos modèles de messages courts pour SMS et WhatsApp',
      icon: <FileText className="h-8 w-8" />,
      iconBg: 'bg-pink-100 dark:bg-pink-900/30',
      iconColor: 'text-pink-600 dark:text-pink-400',
      route: '/parametres/communication/sms-templates'
    },
    {
      id: 'branding',
      title: 'Branding',
      description: 'Configurez le logo du club et les couleurs pour toutes les communications',
      icon: <Palette className="h-8 w-8" />,
      iconBg: 'bg-rose-100 dark:bg-rose-900/30',
      iconColor: 'text-rose-600 dark:text-rose-400',
      route: '/parametres/communication/branding'
    },

    // ROW 4: Announcements
    {
      id: 'annonces',
      title: 'Annonces du club',
      description: 'Gérez les annonces visibles par tous les membres dans l\'application mobile',
      icon: <Bell className="h-8 w-8" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      route: '/parametres/communication/push-notifications'
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Communication']}
          title="Communication"
          description="Emails automatiques et rappels planifiés"
        />

        {/* Cards Grid - 3 columns on large screens, responsive on smaller screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => !card.disabled && navigate(card.route)}
              disabled={card.disabled}
              className={`rounded-xl shadow-sm border p-6 transition-all text-left group ${
                card.disabled
                  ? 'bg-gray-100 dark:bg-dark-bg-tertiary border-gray-200 dark:border-dark-border opacity-60 cursor-not-allowed'
                  : 'bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border hover:shadow-md hover:border-calypso-blue dark:hover:border-calypso-aqua'
              }`}
            >
              {/* Icon */}
              <div className={`inline-flex p-4 rounded-lg ${card.disabled ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-dark-text-muted' : `${card.iconBg} ${card.iconColor}`} mb-4 ${!card.disabled && 'group-hover:scale-110'} transition-transform`}>
                {card.icon}
              </div>

              {/* Title with disabled badge */}
              <div className="flex items-center gap-2 mb-2">
                <h3 className={`text-lg font-semibold ${card.disabled ? 'text-gray-500 dark:text-dark-text-muted' : 'text-gray-900 dark:text-dark-text-primary'}`}>
                  {card.title}
                </h3>
                {card.disabled && card.disabledMessage && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300 rounded">
                    {card.disabledMessage}
                  </span>
                )}
              </div>

              {/* Description */}
              <p className={`text-sm mb-4 ${card.disabled ? 'text-gray-400 dark:text-dark-text-muted' : 'text-gray-600 dark:text-dark-text-secondary'}`}>
                {card.description}
              </p>

              {/* Button */}
              <div className={`flex items-center gap-2 font-medium text-sm ${
                card.disabled
                  ? 'text-gray-400 dark:text-dark-text-muted'
                  : 'text-calypso-blue dark:text-calypso-aqua group-hover:gap-3'
              } transition-all`}>
                <span>{card.disabled ? 'Indisponible' : 'Configurer'}</span>
                {!card.disabled && <span>→</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

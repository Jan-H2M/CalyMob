import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Send, Calendar, FileText } from 'lucide-react';
import { SettingsHeader } from '@/components/settings/SettingsHeader';

interface CommunicationCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  route: string;
}

export function CommunicationDashboard() {
  const navigate = useNavigate();

  const cards: CommunicationCard[] = [
    {
      id: 'emails-sortants',
      title: 'Emails Sortants',
      description: 'Historique de tous les emails envoyés (manuels et automatiques)',
      icon: <Send className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/parametres/communication/emails-sortants'
    },
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
      id: 'templates',
      title: 'Templates d\'Emails',
      description: 'Gérez vos templates d\'emails automatiques',
      icon: <FileText className="h-8 w-8" />,
      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
      iconColor: 'text-teal-600 dark:text-teal-400',
      route: '/parametres/communication/templates'
    }
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
              onClick={() => navigate(card.route)}
              className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 hover:shadow-md hover:border-calypso-blue dark:hover:border-calypso-aqua transition-all text-left group"
            >
              {/* Icon */}
              <div className={`inline-flex p-4 rounded-lg ${card.iconBg} ${card.iconColor} mb-4 group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
                {card.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                {card.description}
              </p>

              {/* Button */}
              <div className="flex items-center gap-2 text-calypso-blue dark:text-calypso-aqua font-medium text-sm group-hover:gap-3 transition-all">
                <span>Configurer</span>
                <span>→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

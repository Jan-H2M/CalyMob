import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  BookOpen,
  Users,
  Sparkles,
  Settings as SettingsIcon,
  Package,
  Mail,
  Key,
  MapPin,
  FileSpreadsheet,
  Shield,
  Brain,
  List as ListIcon,
  Database
} from 'lucide-react';

interface SettingsCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  route: string;
}

export function SettingsDashboard() {
  const navigate = useNavigate();
  const { appUser } = useAuth();

  // Alphabetically sorted cards
  const baseCards: SettingsCard[] = [
    {
      id: 'automatisation',
      title: 'Catégorisation Intelligente',
      description: 'Import de patterns pour la suggestion automatique de codes comptables',
      icon: <Sparkles className="h-8 w-8" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      route: '/parametres/automatisation'
    },
    {
      id: 'communication',
      title: 'Communication',
      description: 'Emails automatiques et rappels planifiés',
      icon: <Mail className="h-8 w-8" />,
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      route: '/parametres/communication'
    },
    {
      id: 'comptabilite',
      title: 'Comptabilité',
      description: 'Plan comptable, catégories et années fiscales',
      icon: <BookOpen className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/parametres/comptabilite'
    },
    {
      id: 'evenements',
      title: 'Événements',
      description: 'Gestion des lieux de plongée et tarifs',
      icon: <MapPin className="h-8 w-8" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      route: '/parametres/evenements'
    },
    {
      id: 'listes',
      title: 'Listes de Valeurs',
      description: 'Dropdowns dynamiques',
      icon: <ListIcon className="h-8 w-8" />,
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      route: '/parametres/listes-valeurs'
    },
    {
      id: 'membres',
      title: 'Membres & Sécurité',
      description: 'Gestion des membres, permissions, rôles et sécurité de session',
      icon: <Users className="h-8 w-8" />,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      route: '/parametres/utilisateurs'
    },
    {
      id: 'general',
      title: 'Paramètres Généraux',
      description: 'Club, devise, seuils',
      icon: <SettingsIcon className="h-8 w-8" />,
      iconBg: 'bg-gray-100 dark:bg-gray-900/30',
      iconColor: 'text-gray-600 dark:text-gray-400',
      route: '/parametres/general'
    },
    {
      id: 'integrations',
      title: 'Services Externes',
      description: 'Configuration des services externes (IA, Email, etc.)',
      icon: <Key className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/parametres/integrations'
    }
  ];

  // Add Inventaire card only for superadmin
  const cards: SettingsCard[] = appUser?.role === 'superadmin'
    ? [
        ...baseCards,
        {
          id: 'inventaire',
          title: 'Inventaire',
          description: 'Configuration du matériel, checklists, cautions et emplacements',
          icon: <Package className="h-8 w-8" />,
          iconBg: 'bg-orange-100 dark:bg-orange-900/30',
          iconColor: 'text-orange-600 dark:text-orange-400',
          route: '/parametres/inventaire'
        }
      ]
    : baseCards;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-3">
            <SettingsIcon className="h-8 w-8" />
            Paramètres
          </h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
            Configuration de l'application CalyCompta
          </p>
        </div>

        {/* Cards Grid - 3 columns */}
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

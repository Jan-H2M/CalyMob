import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Shield,
  Sparkles,
  Settings as SettingsIcon,
  Mail,
  Key,
  MapPin,
  List as ListIcon,
  Clock,
  Smartphone,
  Wrench,
  Building2,
  Banknote,
  Anchor,
  CreditCard,
  FileBarChart,
  Bug,
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

  // Alphabetically sorted cards by title
  const baseCards: SettingsCard[] = [
    {
      id: 'app-adoption',
      title: 'App CalyMob',
      description: 'Statistiques d\'adoption et utilisation de l\'app mobile',
      icon: <Smartphone className="h-8 w-8" />,
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      route: '/parametres/app-adoption'
    },
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
      id: 'cotisations',
      title: 'Cotisations',
      description: 'Tarifs de cotisation par saison et catégorie de membre',
      icon: <CreditCard className="h-8 w-8" />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      route: '/parametres/cotisations'
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
      id: 'fournisseurs',
      title: 'Fournisseurs',
      description: 'Gestion des fournisseurs externes pour les remboursements',
      icon: <Building2 className="h-8 w-8" />,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      route: '/parametres/fournisseurs'
    },
    {
      id: 'regles-lifras',
      title: 'Règles LIFRAS',
      description: 'Règles de composition des palanquées (MIL 2026)',
      icon: <Anchor className="h-8 w-8" />,
      iconBg: 'bg-sky-100 dark:bg-sky-900/30',
      iconColor: 'text-sky-600 dark:text-sky-400',
      route: '/parametres/regles-lifras'
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
      id: 'securite',
      title: 'Sécurité & Permissions',
      description: 'Gestion des permissions, rôles et sécurité de session',
      icon: <Shield className="h-8 w-8" />,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      route: '/parametres/utilisateurs'
    },
    {
      id: 'bank',
      title: 'Banque / IBAN',
      description: 'Compte bancaire pour les paiements EPC QR',
      icon: <Banknote className="h-8 w-8" />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      route: '/parametres/bank'
    },
    {
      id: 'general',
      title: 'Paramètres Généraux',
      description: 'Club, devise, seuils',
      icon: <SettingsIcon className="h-8 w-8" />,
      iconBg: 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-900/30',
      iconColor: 'text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted',
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
    },
    {
      id: 'compatibility',
      title: 'Compatibilité',
      description: 'Versions apps/browsers supportées (CalyMob & CalyCompta)',
      icon: <Smartphone className="h-8 w-8" />,
      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
      iconColor: 'text-teal-600 dark:text-teal-400',
      route: '/parametres/compatibilite'
    },
    {
      id: 'maintenance',
      title: 'Maintenance',
      description: 'Contrôle de version, force refresh et nettoyage de données',
      icon: <Wrench className="h-8 w-8" />,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      route: '/parametres/maintenance'
    },
    {
      id: 'automated-jobs',
      title: 'Tâches Automatisées',
      description: 'Jobs planifiés pour la maintenance et l\'automatisation',
      icon: <Clock className="h-8 w-8" />,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      route: '/parametres/taches-automatisees'
    },
    {
      id: 'rapports',
      title: 'Rapports & Exports',
      description: 'Exports comptables, statistiques membres et rapports',
      icon: <FileBarChart className="h-8 w-8" />,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      route: '/rapports'
    },
    {
      id: 'signalements',
      title: 'Signalements & Bugs',
      description: 'Gestion des signalements de bugs remontés par les utilisateurs',
      icon: <Bug className="h-8 w-8" />,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      route: '/parametres/signalements'
    }
  ];

  // Inventaire configuration moved to /stock/config
  const cards = baseCards;

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

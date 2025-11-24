import {
  Upload,
  Settings as SettingsIcon,
  Database,
  Shield,
  Brain,
  List as ListIcon,
  BookOpen,
  Tag,
  Calendar,
  FileSpreadsheet,
  Waves
} from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { useNavigate } from 'react-router-dom';

interface SystemButton {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  route: string;
}

export function SystemeSettings() {
  const navigate = useNavigate();

  const buttons: SystemButton[] = [
    {
      id: 'transactions',
      title: 'Transactions Bancaires',
      description: 'Import CSV (BNP, KBC, ING, Belfius)',
      icon: <Upload className="h-8 w-8" />,
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      route: '/transactions'
    },
    {
      id: 'operations',
      title: 'Activités VP Dive',
      description: 'Import XLS avec inscriptions',
      icon: <Waves className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/operations'
    },
    {
      id: 'import-batch',
      title: 'Import en Batch',
      description: 'Import multiple fichiers CSV',
      icon: <FileSpreadsheet className="h-8 w-8" />,
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      route: '/parametres/import-batch'
    },
    {
      id: 'plan-comptable',
      title: 'Plan Comptable',
      description: 'Codes comptables et gestion',
      icon: <BookOpen className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/parametres/comptabilite'
    },
    {
      id: 'categories',
      title: 'Catégories',
      description: 'Catégorisation des transactions',
      icon: <Tag className="h-8 w-8" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      route: '/parametres/comptabilite'
    },
    {
      id: 'annees-fiscales',
      title: 'Années Fiscales',
      description: 'Gestion et clôture annuelle',
      icon: <Calendar className="h-8 w-8" />,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      route: '/parametres/annees-fiscales'
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
      id: 'securite',
      title: 'Sécurité',
      description: 'Timeout de session',
      icon: <Shield className="h-8 w-8" />,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      route: '/parametres/securite'
    },
    {
      id: 'ia',
      title: 'Intelligence Artificielle',
      description: 'Clés API OpenAI/Anthropic',
      icon: <Brain className="h-8 w-8" />,
      iconBg: 'bg-violet-100 dark:bg-violet-900/30',
      iconColor: 'text-violet-600 dark:text-violet-400',
      route: '/parametres/ia-settings'
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
      id: 'maintenance',
      title: 'Maintenance',
      description: 'Nettoyage de la base',
      icon: <Database className="h-8 w-8" />,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      route: '/parametres/maintenance'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Système']}
          title="Système"
          description="Import/Export, paramètres généraux et maintenance"
        />

        {/* Flat Button Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buttons.map((button) => (
            <button
              key={button.id}
              onClick={() => navigate(button.route)}
              className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 hover:shadow-md hover:border-calypso-blue dark:hover:border-calypso-aqua transition-all text-left group"
            >
              {/* Icon */}
              <div className={`inline-flex p-4 rounded-lg ${button.iconBg} ${button.iconColor} mb-4 group-hover:scale-110 transition-transform`}>
                {button.icon}
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
                {button.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                {button.description}
              </p>

              {/* Arrow */}
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

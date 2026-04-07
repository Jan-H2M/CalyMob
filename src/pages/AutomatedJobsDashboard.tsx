import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Clock, Settings, History, Calendar } from 'lucide-react';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import { getAutomatedJobsSettings, getRecentLogsSummary } from '@/services/automatedJobsService';
import { logger } from '@/utils/logger';

interface AutomatedJobCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  route: string;
}

export function AutomatedJobsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stats, setStats] = useState<{
    activeJobs: number | null;
    lastExecution: Date | null;
    executions24h: number | null;
    loading: boolean;
  }>({
    activeJobs: null,
    lastExecution: null,
    executions24h: null,
    loading: true
  });

  useEffect(() => {
    async function loadStats() {
      if (!user?.clubId) return;

      try {
        const [settings, logsSummary] = await Promise.all([
          getAutomatedJobsSettings(user.clubId),
          getRecentLogsSummary(user.clubId)
        ]);

        const activeJobs = settings?.enabled
          ? settings.jobs.filter((j: { enabled: boolean }) => j.enabled).length
          : 0;

        setStats({
          activeJobs,
          lastExecution: logsSummary.lastExecution || null,
          executions24h: logsSummary.totalExecutions,
          loading: false
        });
      } catch (error) {
        logger.error('Error loading stats:', error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    }

    loadStats();
  }, [user?.clubId]);

  const formatLastExecution = (date: Date | null) => {
    if (!date) return '-';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    return date.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const cards: AutomatedJobCard[] = [
    {
      id: 'jobs-config',
      title: 'Configuration des Jobs',
      description: 'Créez et gérez les tâches automatisées planifiées',
      icon: <Settings className="h-8 w-8" />,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      route: '/parametres/taches-automatisees/config'
    },
    {
      id: 'jobs-logs',
      title: 'Historique d\'Exécution',
      description: 'Consultez les logs et statistiques des jobs exécutés',
      icon: <History className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/parametres/taches-automatisees/logs'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Tâches Automatisées']}
          title="Tâches Automatisées"
          description="Configuration des jobs planifiés pour la maintenance et l'automatisation"
        />

        {/* Info Banner */}
        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                À propos des tâches automatisées
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Les tâches automatisées s'exécutent selon un planning défini (cron) pour effectuer
                des opérations de maintenance comme la fermeture automatique d'événements passés,
                le nettoyage de données anciennes, ou les sauvegardes. Les jobs s'exécutent toutes
                les 15 minutes via Vercel Cron Jobs (timezone: Europe/Brussels).
              </p>
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => navigate(card.route)}
              className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 hover:shadow-md hover:border-calypso-blue dark:hover:border-calypso-aqua transition-all text-left group"
            >
              {/* Icon */}
              <div
                className={`inline-flex p-4 rounded-lg ${card.iconBg} ${card.iconColor} mb-4 group-hover:scale-110 transition-transform`}
              >
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

              {/* Action */}
              <div className="flex items-center gap-2 text-calypso-blue dark:text-calypso-aqua font-medium text-sm group-hover:gap-3 transition-all">
                <span>Ouvrir</span>
                <span>→</span>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Jobs actifs</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {stats.loading ? '...' : (stats.activeJobs ?? '-')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Dernière exécution</p>
                <p className={`font-bold text-gray-900 dark:text-dark-text-primary ${stats.lastExecution ? 'text-lg' : 'text-2xl'}`}>
                  {stats.loading ? '...' : formatLastExecution(stats.lastExecution)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <History className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Exécutions (24h)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {stats.loading ? '...' : (stats.executions24h ?? '-')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

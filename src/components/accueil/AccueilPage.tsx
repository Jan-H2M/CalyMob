import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { FiscalYearService } from '@/services/fiscalYearService';
import { DashboardService } from '@/services/dashboardService';
import { logger } from '@/utils/logger';
import { getFirstName } from '@/utils/fieldMapper';

// Interface TypeScript pour les citations
interface DivingQuote {
  text: string;
  author: string;
}

// Tableau des 79 citations sur la mer et la plongée (liste nettoyée)
// Deployment test: Project successfully migrated to root structure - Nov 2024
const DIVING_QUOTES: DivingQuote[] = [
  {
    text: "La mer, une fois qu'elle jette son sort, vous tient à jamais dans son filet d'émerveillement.",
    author: "Jacques Cousteau"
  },
  {
    text: "Le silence du monde sous-marin est l'un des sons les plus bruyants que j'ai jamais entendus.",
    author: "Sylvia Earle"
  },
  {
    text: "Dans l'océan, chaque créature a sa place, chaque plongeur trouve la sienne.",
    author: "Anonyme"
  },
  {
    text: "L'océan nous appelle, non pas à le conquérir, mais à le comprendre.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "La plongée sous-marine est une danse avec la gravité.",
    author: "Anonyme"
  },
  {
    text: "Les gens protègent ce qu'ils aiment.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "Sous l'eau, tout est calme et bleu. C'est là que je me sens le plus vivant.",
    author: "Anonyme"
  },
  {
    text: "La plongée, c'est voler dans l'eau.",
    author: "Anonyme"
  },
  {
    text: "On ne peut pas voir clairement si on ne plonge pas profondément.",
    author: "Proverbe"
  },
  {
    text: "Plonger, c'est entrer dans un monde où le temps n'existe plus.",
    author: "Anonyme"
  },
  {
    text: "L'eau et l'air, les deux fluides essentiels dont dépend toute vie, sont devenus des poubelles mondiales.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "L'océan est tout ce que je veux être : mystérieux, sauvage et libre.",
    author: "Anonyme"
  },
  {
    text: "La mer est dangereuse, disent-ils. Mais ceux qui y plongent savent qu'elle est juste.",
    author: "Anonyme"
  },
  {
    text: "En mer, j'ai appris combien peu une personne a besoin, non combien.",
    author: "Robin Lee Graham"
  },
  {
    text: "La mer est le plus grand musée du monde, elle contient plus d'histoire que tous les musées terrestres réunis.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "Chaque bulle qui monte raconte une histoire du fond.",
    author: "Anonyme"
  },
  {
    text: "La plongée te permet de toucher l'éternité et de revenir.",
    author: "Luc Besson"
  },
  {
    text: "L'océan ne connaît pas de frontières, tout comme le cœur d'un plongeur.",
    author: "Anonyme"
  },
  {
    text: "Nous oublions que le cycle de l'eau et le cycle de la vie sont un seul et même cycle.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "Nous ne protégeons que ce que nous aimons, nous n'aimons que ce que nous comprenons, nous ne comprenons que ce qu'on nous a enseigné.",
    author: "Baba Dioum"
  },
  {
    text: "Sous l'eau, nous sommes tous égaux face à l'immensité bleue.",
    author: "Anonyme"
  },
  {
    text: "Le meilleur moment pour plonger, c'est maintenant.",
    author: "Anonyme"
  },
  {
    text: "La plongée est le seul sport où l'on monte en descendant.",
    author: "Anonyme"
  },
  {
    text: "Pour la plupart de l'histoire, l'homme a dû lutter contre la nature pour survivre ; au XXe siècle, il commence à réaliser que pour survivre, il doit la protéger.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "L'eau est la force motrice de toute la nature.",
    author: "Léonard de Vinci"
  },
  {
    text: "L'océan est un musée vivant que chaque plongée visite différemment.",
    author: "Anonyme"
  },
  {
    text: "Chaque plongée est une aventure, chaque remontée un retour à la réalité.",
    author: "Anonyme"
  },
  {
    text: "Si un homme, pour quelque raison, a l'occasion de mener une vie extraordinaire, il n'a pas le droit de la garder pour lui.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "La mer est un espace de rigueur et de liberté.",
    author: "Victor Hugo"
  },
  {
    text: "Respirer sous l'eau, c'est réapprendre ce qu'est vivre.",
    author: "Anonyme"
  },
  {
    text: "Plonger, c'est méditer avec des bulles.",
    author: "Anonyme"
  },
  {
    text: "La mer nous enseigne la patience, la plongée nous donne l'humilité.",
    author: "Anonyme"
  },
  {
    text: "L'océan nous relie tous, peu importe où nous vivons.",
    author: "Sylvia Earle"
  },
  {
    text: "Dans les profondeurs, on trouve ce qu'on ne cherchait pas.",
    author: "Anonyme"
  },
  {
    text: "Le bonheur pour une abeille ou un dauphin est d'exister. Pour l'homme, c'est de le savoir et de s'en émerveiller.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "Sous l'eau, je suis un visiteur dans un monde qui n'est pas le mien.",
    author: "Anonyme"
  },
  {
    text: "L'apesanteur sous-marine libère l'esprit autant que le corps.",
    author: "Anonyme"
  },
  {
    text: "La plongée vous enseigne l'humilité face à la grandeur de l'océan.",
    author: "Anonyme"
  },
  {
    text: "On aime ce que l'on connaît, on protège ce que l'on aime.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "Chaque plongée est un privilège, pas un droit.",
    author: "Anonyme"
  },
  {
    text: "Respirer sous l'eau, c'est défier les lois de la nature avec respect.",
    author: "Anonyme"
  },
  {
    text: "L'océan parle à ceux qui savent l'écouter en silence.",
    author: "Anonyme"
  },
  {
    text: "L'océan est un livre dont chaque plongée tourne une nouvelle page.",
    author: "Anonyme"
  },
  {
    text: "La pollution de la planète est seulement le reflet extérieur d'une pollution psychique intérieure.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "La plongée transforme les peurs en émerveillement.",
    author: "Anonyme"
  },
  {
    text: "Sous la surface, le monde terrestre n'est plus qu'un souvenir lointain.",
    author: "Anonyme"
  },
  {
    text: "J'ai passé ma vie à descendre vers les profondeurs pour y trouver la lumière.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "L'eau salée guérit tout : les larmes, la sueur, et la mer.",
    author: "Proverbe danois"
  },
  {
    text: "Nous devons planter des arbres sous lesquels nous ne nous assoirons jamais.",
    author: "Jacques-Yves Cousteau"
  },
  {
    text: "Plonger, c'est accepter de n'être qu'un invité dans un royaume aquatique.",
    author: "Anonyme"
  },
  {
    text: "La mer, c'est ce que je connais le mieux, je ne m'en lasserai jamais.",
    author: "Éric Tabarly"
  },
  {
    text: "La mer enseigne aux marins des rêves que les ports assassinent.",
    author: "Éric Tabarly"
  },
  {
    text: "Je continue sans escale vers les îles du Pacifique parce que je suis heureux en mer, et peut-être aussi pour sauver mon âme.",
    author: "Bernard Moitessier"
  },
  {
    text: "Un homme seul dans l'océan est libre, même s'il doit lutter contre les éléments.",
    author: "Bernard Moitessier"
  },
  {
    text: "La mer, la vraie, celle qui façonne les côtes et tourmente les hommes depuis toujours.",
    author: "Bernard Moitessier"
  },
  {
    text: "Je laisse tomber. Je suis heureux en mer, et peut-être pour sauver mon âme.",
    author: "Bernard Moitessier"
  },
  {
    text: "La mer n'est pas un terrain de jeu, c'est un terrain de vie.",
    author: "Olivier de Kersauson"
  },
  {
    text: "La mer ne pardonne pas, mais elle ne juge pas non plus.",
    author: "Olivier de Kersauson"
  },
  {
    text: "On ne va pas en mer pour être heureux, on va en mer parce qu'on ne peut pas faire autrement.",
    author: "Olivier de Kersauson"
  },
  {
    text: "Un marin qui a peur de la mer ne devrait pas être marin.",
    author: "Olivier de Kersauson"
  },
  {
    text: "La mer vous met face à vous-même, il n'y a nulle part où se cacher.",
    author: "Ellen MacArthur"
  },
  {
    text: "Chaque jour en mer est un cadeau, chaque tempête une leçon.",
    author: "Ellen MacArthur"
  },
  {
    text: "Tout homme peut tenir le gouvernail quand la mer est calme.",
    author: "Francis Chichester"
  },
  {
    text: "La navigation solitaire n'est pas une évasion, c'est une confrontation.",
    author: "Francis Chichester"
  },
  {
    text: "Je me suis tenu seul face à l'immensité, et l'immensité m'a répondu.",
    author: "Joshua Slocum"
  },
  {
    text: "Le meilleur navire est celui qui vous ramène à bon port.",
    author: "Joshua Slocum"
  },
  {
    text: "La mer, c'est la liberté absolue, sans compromis.",
    author: "Florence Arthaud"
  },
  {
    text: "On ne dompte pas la mer, on compose avec elle.",
    author: "Florence Arthaud"
  },
  {
    text: "La solitude en mer n'est pas un vide, c'est une plénitude.",
    author: "Alain Gerbault"
  },
  {
    text: "J'ai trouvé plus de paix sur l'océan que dans tous les ports du monde.",
    author: "Alain Gerbault"
  },
  {
    text: "La mer est le dernier espace de liberté sur cette planète.",
    author: "Paul-Émile Victor"
  },
  {
    text: "Qui veut voyager loin ménage sa monture, qui veut naviguer longtemps ménage son bateau.",
    author: "Proverbe marin"
  },
  {
    text: "Rouge le soir, espoir ; rouge le matin, marin chagrin.",
    author: "Dicton marin"
  },
  {
    text: "La mer est la même pour tous les marins, seuls les bateaux diffèrent.",
    author: "Proverbe"
  },
  {
    text: "Un bon marin se reconnaît dans la tempête, pas au port.",
    author: "Proverbe marin"
  },
  {
    text: "Le vent qui souffle, c'est celui qu'on va chercher.",
    author: "Proverbe marin"
  },
  {
    text: "On ne commande la mer qu'en lui obéissant.",
    author: "Proverbe"
  },
  {
    text: "L'océan est un désert liquide où l'homme n'est jamais seul.",
    author: "Anonyme"
  },
  {
    text: "Tu deviens responsable pour toujours de ce que tu as apprivoisé.",
    author: "Antoine de Saint-Exupéry"
  }
];

// Hook pour sélectionner une citation aléatoire au chargement
const useRandomQuote = (): DivingQuote => {
  const [quote] = useState<DivingQuote>(() => {
    const randomIndex = Math.floor(Math.random() * DIVING_QUOTES.length);
    return DIVING_QUOTES[randomIndex];
  });
  return quote;
};

export function AccueilPage() {
  const { clubId, appUser } = useAuth();
  const queryClient = useQueryClient();
  const randomQuote = useRandomQuote();

  // ✨ PREFETCHING: Précharger les données du dashboard en arrière-plan
  // Pendant que l'utilisateur lit la citation, on charge silencieusement
  // toutes les données du dashboard pour un affichage instantané quand il navigue
  // ⚠️ CRITICAL: Users (role 'user') cannot access financial data - skip prefetch
  useEffect(() => {
    const prefetchDashboardData = async () => {
      if (!clubId) return;

      // ⚠️ Skip prefetch for regular users - they don't have access to financial data
      if (appUser?.app_role === 'user') {
        logger.debug('⏸️ [PREFETCH] User role cannot access dashboard data, skipping prefetch');
        return;
      }

      logger.debug('🚀 [PREFETCH] Préchargement des données du dashboard en arrière-plan...');

      try {
        // 1️⃣ ÉTAPE 1: Charger les années fiscales D'ABORD (requis pour le reste)
        logger.debug('   📅 Chargement années fiscales...');
        const [currentFY, previousFY] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: ['currentFiscalYear', clubId],
            queryFn: () => FiscalYearService.getCurrentFiscalYear(clubId),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.fetchQuery({
            queryKey: ['previousFiscalYear', clubId],
            queryFn: () => FiscalYearService.getPreviousFiscalYear(clubId),
            staleTime: 5 * 60 * 1000,
          })
        ]);

        if (!currentFY) {
          logger.warn('⚠️ [PREFETCH] Pas d\'année fiscale courante, arrêt du prefetch');
          return;
        }

        logger.debug('   ✅ Années fiscales chargées', { current: currentFY.year, previous: previousFY?.year || 'N/A' });

        // 2️⃣ ÉTAPE 2: Précharger toutes les autres données en parallèle
        logger.debug('   💾 Préchargement données dashboard...');
        await Promise.all([
          // Soldes bancaires
          queryClient.prefetchQuery({
            queryKey: ['balanceCurrent', clubId],
            queryFn: () => FiscalYearService.calculateCurrentBalance(clubId, 'current'),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['balanceSavings', clubId],
            queryFn: () => FiscalYearService.calculateCurrentBalance(clubId, 'savings'),
            staleTime: 5 * 60 * 1000,
          }),

          // Statistiques année fiscale
          queryClient.prefetchQuery({
            queryKey: ['fiscalYearStats', clubId, currentFY.id],
            queryFn: () => DashboardService.getFiscalYearStats(clubId, currentFY),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['monthlyBreakdown', clubId, currentFY.id],
            queryFn: () => DashboardService.getMonthlyBreakdown(clubId, currentFY),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['financialSummary', clubId, currentFY.id],
            queryFn: () => DashboardService.getFinancialSummary(clubId, currentFY),
            staleTime: 5 * 60 * 1000,
          }),

          // Stats générales
          queryClient.prefetchQuery({
            queryKey: ['currentMonthStats', clubId],
            queryFn: () => DashboardService.getCurrentMonthStats(clubId),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['memberStats', clubId],
            queryFn: () => DashboardService.getMemberStats(clubId),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['pendingActions', clubId],
            queryFn: () => DashboardService.getPendingActions(clubId),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['reconciliationStats', clubId, currentFY.id],
            queryFn: () => DashboardService.getReconciliationStats(clubId),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['accountingCodeStats', clubId, currentFY.id],
            queryFn: () => DashboardService.getAccountingCodeStats(clubId),
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['countStats', clubId],
            queryFn: () => DashboardService.getCountStats(clubId),
            staleTime: 5 * 60 * 1000,
          }),

          // Comparaison année par année (si année précédente existe)
          previousFY && queryClient.prefetchQuery({
            queryKey: ['yearOverYearData', clubId, currentFY.id, previousFY.id],
            queryFn: () => DashboardService.getYearOverYearComparison(clubId, currentFY, previousFY),
            staleTime: 5 * 60 * 1000,
          })
        ].filter(Boolean)); // Retirer les nulls (si pas de previousFY)

        logger.debug('✅ [PREFETCH] Préchargement terminé - Dashboard prêt à afficher instantanément!');
      } catch (error) {
        logger.error('⚠️ [PREFETCH] Erreur pendant le préchargement (non bloquant):', error);
      }
    };

    // Petit délai pour laisser la page d'accueil se charger d'abord
    const timer = setTimeout(() => {
      prefetchDashboardData();
    }, 500);

    return () => clearTimeout(timer);
  }, [clubId, queryClient, appUser]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-dark-bg-primary dark:to-dark-bg-secondary flex items-center justify-center p-6 relative">
      {/* Message de bienvenue en haut à droite */}
      {appUser && (
        <div className="absolute top-6 right-6">
          <p className="text-lg text-gray-600 dark:text-dark-text-secondary">
            Bonjour, {getFirstName(appUser) || appUser.displayName}
          </p>
        </div>
      )}

      <div className="max-w-2xl w-full flex flex-col items-center gap-12 animate-fade-in">
        {/* Logo Calypso */}
        <div className="flex justify-center">
          <img
            src="/logo-vertical.svg"
            alt="Calypso Diving Club"
            className="h-64 w-auto object-contain"
          />
        </div>

        {/* Citation aléatoire */}
        <div className="text-center px-8 max-w-xl">
          <blockquote className="text-xl md:text-2xl text-gray-700 dark:text-dark-text-primary font-light italic leading-relaxed mb-4">
            "{randomQuote.text}"
          </blockquote>
          <cite className="text-base text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary font-medium not-italic">
            — {randomQuote.author}
          </cite>
        </div>

        {/* Spinner animé discret */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>

      {/* Animation CSS fade-in */}
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

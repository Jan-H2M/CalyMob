export interface FAQItemContent {
  question: string;
  answer: string;
}

export interface FAQSectionContent {
  title: string;
  icon: 'mobile' | 'web' | 'general';
  items: FAQItemContent[];
}

export interface DocSectionContent {
  title: string;
  icon:
    | 'download'
    | 'login'
    | 'calendar'
    | 'payments'
    | 'notifications'
    | 'profile'
    | 'communication'
    | 'dashboard'
    | 'members'
    | 'accounting'
    | 'settings'
    | 'security';
  content: string;
}

export interface PrivacyPolicySectionContent {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export const faqSectionsContent: FAQSectionContent[] = [
  {
    title: 'CalyMob - Application Mobile',
    icon: 'mobile',
    items: [
      {
        question: 'Comment télécharger CalyMob ?',
        answer:
          'CalyMob est disponible sur l’App Store (iOS) et Google Play (Android). Utilisez les liens présents sur la page de documentation CalyMob ou recherchez "CalyMob".',
      },
      {
        question: 'Comment me connecter à l’application ?',
        answer:
          'L’accès à CalyMob est sur invitation. Lors de l’activation, le club vous envoie un email avec un lien sécurisé pour définir votre mot de passe. Une fois ce mot de passe défini, vous vous connectez avec votre adresse email et ce mot de passe.',
      },
      {
        question: 'J’ai oublié mon mot de passe, que faire ?',
        answer:
          'Utilisez "Mot de passe oublié" dans CalyMob ou sur la page web de connexion. Vous recevrez un lien de réinitialisation. Si nécessaire, le club peut aussi relancer votre invitation ou vous aider à repartir d’une procédure propre.',
      },
      {
        question: 'Puis-je utiliser Face ID ou l’empreinte digitale ?',
        answer:
          'Oui. Après une première connexion réussie, CalyMob peut proposer une connexion biométrique selon les capacités de votre appareil. Les identifiants biométriques restent gérés localement sur l’appareil.',
      },
      {
        question: 'Comment m’inscrire à un événement ?',
        answer:
          'Depuis la section "Événements", ouvrez l’activité souhaitée et confirmez votre inscription. Vous recevez ensuite les rappels et mises à jour du club dans l’application et, selon le cas, par email.',
      },
      {
        question: 'Comment fonctionne le paiement par QR code ?',
        answer:
          'Lorsqu’un paiement est demandé, CalyMob peut afficher un QR code EPC ou rediriger vers le parcours de paiement prévu. Les références de paiement sont préremplies pour limiter les erreurs.',
      },
    ],
  },
  {
    title: 'CalyCompta - Administration Web',
    icon: 'web',
    items: [
      {
        question: 'Qui peut accéder à CalyCompta ?',
        answer:
          'L’accès dépend du rôle attribué dans le club. Les rôles applicatifs actuels sont `user`, `validateur`, `admin` et `superadmin`. Tous n’ont pas les mêmes écrans ni les mêmes permissions.',
      },
      {
        question: 'Comment inviter des membres sur CalyMob ?',
        answer:
          'Depuis Paramètres > Communication > Invitation CalyMob. Le serveur crée ou réconcilie le compte Firebase Auth, puis envoie un email avec un lien sécurisé pour définir le mot de passe. Cette invitation ne crée pas de mot de passe temporaire visible côté utilisateur.',
      },
      {
        question: 'Comment envoyer une communication aux membres ?',
        answer:
          'Les envois manuels et automatisés passent par Paramètres > Communication. Les emails sont envoyés côté serveur via le fournisseur configuré pour le club, avec historique d’envoi stocké côté serveur.',
      },
      {
        question: 'Qui gère les intégrations email ?',
        answer:
          'Les réglages sensibles du fournisseur email et des intégrations sont réservés aux rôles `admin` et `superadmin`. Les écrans de communication courante sont accessibles aux rôles autorisés selon le contexte.',
      },
      {
        question: 'Comment fonctionne la réinitialisation de mot de passe administrateur ?',
        answer:
          'Une réinitialisation administrateur reste possible pour certains cas de support. Ce flux est distinct de l’invitation standard CalyMob. Un administrateur peut y définir un mot de passe temporaire et imposer un changement de mot de passe à la prochaine connexion.',
      },
    ],
  },
  {
    title: 'Questions Générales',
    icon: 'general',
    items: [
      {
        question: 'Mes données sont-elles sécurisées ?',
        answer:
          'Les données sont hébergées dans Firebase / Google Cloud Platform avec contrôle d’accès applicatif par rôle, journalisation technique et protections de session. Certaines données techniques comme les diagnostics, tokens de notifications et rapports de crash sont utilisées pour l’exploitation et le support.',
      },
      {
        question: 'Les applications sont-elles gratuites ?',
        answer:
          'Le club décide des modalités d’accès pour ses membres. Les stores mobiles distribuent l’application CalyMob gratuitement, mais l’accès fonctionnel reste contrôlé par le club.',
      },
      {
        question: 'Où trouver la politique de confidentialité ?',
        answer:
          'La version canonique et publique de la politique de confidentialité est publiée sur `https://caly.club/privacy`.',
      },
    ],
  },
];

export const calyMobDocSectionsContent: DocSectionContent[] = [
  {
    title: 'Installation',
    icon: 'download',
    content: `CalyMob est disponible sur l'App Store (iPhone/iPad) et Google Play (Android).

1. Téléchargez l'application depuis le store de votre appareil
2. Ouvrez CalyMob
3. Connectez-vous avec le compte activé par votre club

L'application nécessite un compte déjà autorisé par le club.`,
  },
  {
    title: 'Connexion',
    icon: 'login',
    content: `**Première connexion (sur invitation) :**
1. Un administrateur active votre accès
2. Vous recevez un email avec un lien sécurisé pour définir votre mot de passe
3. Vous choisissez votre mot de passe personnel
4. Vous ouvrez CalyMob et vous vous connectez avec votre email

**Réinitialisation :**
• "Mot de passe oublié" envoie un lien de réinitialisation
• Le lien peut être ouvert dans CalyMob ou dans le navigateur selon votre appareil

**Biométrie :**
Après une connexion réussie, CalyMob peut proposer Face ID, Touch ID ou l'empreinte digitale si l'appareil le permet.`,
  },
  {
    title: 'Événements',
    icon: 'calendar',
    content: `La section Événements vous permet de :

• Voir les événements à venir
• Consulter les détails, les places et les participants
• Vous inscrire ou vous désinscrire
• Suivre les rappels et messages liés aux activités`,
  },
  {
    title: 'Paiements',
    icon: 'payments',
    content: `CalyMob peut afficher les informations de paiement préparées par le club :

• QR code EPC pour les virements
• Références de paiement préremplies
• Retour vers l'application après certains parcours de paiement`,
  },
  {
    title: 'Notifications',
    icon: 'notifications',
    content: `Les notifications servent à :

• annoncer de nouvelles activités
• rappeler les événements à venir
• transmettre des messages importants du club
• confirmer certaines actions utilisateur

Vous pouvez gérer les autorisations de notification depuis votre appareil.`,
  },
  {
    title: 'Mon Profil',
    icon: 'profile',
    content: `Dans "Mon Profil", vous pouvez :

• consulter vos informations de membre
• gérer certaines préférences personnelles
• accéder aux paramètres de sécurité disponibles dans l'application
• vérifier l'état de vos accès et de certaines informations du club`,
  },
  {
    title: 'Communication',
    icon: 'communication',
    content: `CalyMob centralise les informations du club :

• annonces
• messages d'activités
• rappels envoyés par le club
• emails de support liés à votre compte ou à votre utilisation`,
  },
];

export const calyComptaDocSectionsContent: DocSectionContent[] = [
  {
    title: 'Tableau de Bord',
    icon: 'dashboard',
    content: `Le tableau de bord donne une vue d'ensemble du club :

• activité des membres
• finances
• événements
• alertes et tâches en attente`,
  },
  {
    title: 'Gestion des Membres',
    icon: 'members',
    content: `La section Membres permet de :

• consulter les profils
• suivre l'état d'activation applicative
• gérer les rôles et les statuts selon les permissions
• lancer une activation individuelle ou une invitation groupée vers CalyMob`,
  },
  {
    title: 'Comptabilité',
    icon: 'accounting',
    content: `Le module comptable centralise :

• transactions
• demandes de remboursement
• rapprochements
• rapports et exports

L'accès dépend du rôle utilisateur.`,
  },
  {
    title: 'Communications',
    icon: 'communication',
    content: `Le module Communication couvre :

• emails manuels
• emails automatisés
• templates
• historique des emails sortants
• push notifications
• invitation CalyMob

L'envoi d'email passe par le fournisseur configuré pour le club, côté serveur.`,
  },
  {
    title: 'Paramètres',
    icon: 'settings',
    content: `Les paramètres regroupent notamment :

• configuration du club
• comptabilité
• événements
• sécurité
• communication
• intégrations

Les pages d'intégration sensibles sont réservées aux rôles autorisés.`,
  },
  {
    title: 'Sécurité & Accès',
    icon: 'security',
    content: `Le modèle d'accès actuel repose sur quatre rôles :

**superadmin**
• accès complet
• gestion des rôles élevés et des réglages sensibles

**admin**
• administration du club
• gestion des membres, paramètres et intégrations autorisées

**validateur**
• accès opérationnel élargi
• transactions, rapports et communication selon les écrans

**user**
• accès limité à ses données ou à certains écrans permis

L'authentification repose sur Firebase Auth (email/mot de passe), des sessions applicatives et, sur mobile, une biométrie optionnelle selon l'appareil.`,
  },
];

export const privacyPolicyMeta = {
  updatedAt: 'mars 2026',
  contactEmail: 'calypsodivingclub@gmail.com',
  siteUrl: 'https://caly.club',
  officialPolicyUrl: 'https://caly.club/privacy',
};

export const privacyPolicySectionsContent: PrivacyPolicySectionContent[] = [
  {
    title: '1. Introduction',
    paragraphs: [
      'Cette politique de confidentialité couvre CalyMob (application mobile) et CalyCompta (application web) utilisées par le Calypso Diving Club.',
      'La version publique et canonique de cette politique est publiée sur `https://caly.club/privacy`.',
    ],
  },
  {
    title: '2. Données collectées',
    bullets: [
      'données de compte et d’identité: nom, prénom, adresse email, téléphone optionnel',
      'données de membre: rôles applicatifs, informations de club, niveaux et certifications utiles au fonctionnement',
      'données opérationnelles: événements, inscriptions, demandes de remboursement, justificatifs et documents liés',
      'données de communication: historique technique de certains emails envoyés par le club',
      'données techniques: tokens de notifications, informations d’appareil et d’application utiles au support, à la sécurité et aux notifications',
      'données de diagnostic: rapports de crash, diagnostics techniques et certains événements analytics nécessaires au suivi du service',
    ],
  },
  {
    title: '3. Utilisation des données',
    bullets: [
      'gérer les comptes et les accès aux applications',
      'organiser les activités du club et les inscriptions',
      'traiter les demandes de remboursement et les pièces justificatives',
      'envoyer des communications, notifications et emails liés au fonctionnement du club',
      'assurer la sécurité, le support et le diagnostic technique des applications',
    ],
  },
  {
    title: '4. Sécurité et authentification',
    paragraphs: [
      'L’authentification principale repose sur Firebase Authentication avec email et mot de passe.',
      'Sur mobile, une connexion biométrique peut être proposée selon l’appareil. Les éléments biométriques sont gérés localement par l’appareil et ne constituent pas une base biométrique centralisée du club.',
    ],
  },
  {
    title: '5. Hébergement et sous-traitants techniques',
    bullets: [
      'Firebase / Google Cloud Platform pour l’authentification, la base de données, le stockage, les notifications et certains diagnostics',
      'Gmail ou Resend comme fournisseur d’envoi email selon la configuration du club',
      'Apple et Google pour la distribution applicative et, le cas échéant, les mécanismes de notifications des plateformes',
    ],
  },
  {
    title: '6. Accès aux données',
    paragraphs: [
      'L’accès aux données dépend du rôle attribué à l’utilisateur (`user`, `validateur`, `admin`, `superadmin`) et des règles applicatives en place.',
      'Certaines données techniques et journaux sont réservés aux rôles autorisés pour l’exploitation et le support.',
    ],
  },
  {
    title: '7. Conservation',
    paragraphs: [
      'Les données sont conservées aussi longtemps que nécessaire au fonctionnement du club et au respect des obligations légales applicables.',
      'Les pièces comptables et éléments liés aux remboursements peuvent être conservés selon les durées légales requises.',
    ],
  },
  {
    title: '8. Vos droits',
    bullets: [
      'droit d’accès',
      'droit de rectification',
      'droit à l’effacement, dans les limites légales applicables',
      'droit à la limitation du traitement',
      'droit d’opposition',
      'droit à la portabilité lorsque pertinent',
    ],
  },
  {
    title: '9. Contact',
    paragraphs: [
      'Pour toute question relative à la confidentialité ou pour exercer vos droits, contactez le club via `calypsodivingclub@gmail.com`.',
    ],
  },
];

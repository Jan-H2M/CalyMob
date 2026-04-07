#!/usr/bin/env node
/**
 * Import session themes (thèmes de formation) into Firestore.
 *
 * Run from: CalyMob/scripts/  →  node import_session_themes.cjs
 *
 * Adds new training themes to clubs/calypso/session_themes/
 * Skips themes that already exist (matched by title).
 */
const path = require('path');

// Load firebase-admin from functions directory
const functionsPath = path.join(__dirname, '../functions');
const admin = require(path.join(functionsPath, 'node_modules/firebase-admin'));

// Initialize Firebase Admin with service account
const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '../functions/service-account-key.json')
].filter(Boolean);

let initialized = false;
for (const saPath of possibleServiceAccountPaths) {
  try {
    const serviceAccount = require(saPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    console.log(`✅ Firebase initialized with: ${path.basename(saPath)}`);
    break;
  } catch (e) {
    // try next
  }
}

if (!initialized) {
  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    initialized = true;
    console.log('✅ Firebase initialized with Application Default Credentials');
  } catch (e) {
    console.error('❌ Could not initialize Firebase. No valid credentials found.');
    process.exit(1);
  }
}

const db = admin.firestore();
const CLUB_ID = 'calypso';
const COLLECTION = `clubs/${CLUB_ID}/session_themes`;

// ──────────────────────────────────────────────────────────────
// New themes to import
// ──────────────────────────────────────────────────────────────
const NEW_THEMES = [
  // ── Sauvetage ──
  {
    title: 'Gestion d\'un plongeur paniqué',
    description: 'Reconnaissance des signes de panique sous l\'eau. Techniques d\'approche, de contrôle et d\'assistance d\'un plongeur en difficulté.',
    category: 'Sauvetage',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Travailler d\'abord en surface puis progressivement en immersion. Insister sur la sécurité du sauveteur.',
  },
  {
    title: 'Sauvetage, sortie de l\'eau et réanimation',
    description: 'Exercice complet : prise en charge d\'un plongeur inconscient, tractage, sortie de l\'eau et mise en œuvre des gestes de premiers secours.',
    category: 'Sauvetage',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Utiliser un mannequin si disponible. Rappeler la chaîne de secours.',
  },
  {
    title: 'Perte de palanquée & recherche structurée',
    description: 'Procédure en cas de perte de contact avec la palanquée. Techniques de recherche structurée en visibilité réduite.',
    category: 'Sauvetage',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Simuler la perte de palanquée. Enseigner la procédure standard : chercher 1 minute, remonter lentement.',
  },

  // ── Technique ──
  {
    title: 'Utilisation du parachute de palier',
    description: 'Déploiement du parachute de palier (SMB) : gonflage, largage et gestion de la ligne depuis différentes profondeurs.',
    category: 'Technique',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Commencer en piscine peu profonde. Vérifier que chaque élève maîtrise le gonflage et le largage sans perdre sa stabilité.',
  },
  {
    title: 'Utilisation de l\'ordinateur de plongée',
    description: 'Lecture et interprétation des données de l\'ordinateur de plongée : profondeur, temps, paliers, vitesse de remontée, gaz restant.',
    category: 'Technique',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Apporter différents modèles d\'ordinateurs. Faire des exercices de lecture en conditions simulées.',
  },
  {
    title: 'Gestion d\'un givrage',
    description: 'Reconnaissance et gestion d\'un givrage du détendeur. Procédures d\'urgence et passage sur le détendeur de secours.',
    category: 'Technique',
    difficulty: 'avance',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Exercice théorique en piscine (simulation). Rappeler les conditions favorisant le givrage en eau froide.',
  },

  // ── Encadrement ──
  {
    title: 'Rôle du serre-file (simulation)',
    description: 'Simulation du rôle de serre-file en palanquée. Positionnement, surveillance des plongeurs, communication avec le chef de palanquée.',
    category: 'Encadrement',
    difficulty: 'intermediaire',
    targetNiveaux: ['3*'],
    instructorNotes: 'Organiser des palanquées de 3-4 plongeurs avec rotation des rôles.',
  },
  {
    title: 'Chef de palanquée (simulation)',
    description: 'Simulation du rôle de chef de palanquée : planification de la plongée, briefing, gestion du groupe, prise de décision.',
    category: 'Encadrement',
    difficulty: 'intermediaire',
    targetNiveaux: ['3*'],
    instructorNotes: 'Proposer différents scénarios (courant, panne d\'air, plongeur en difficulté) pour tester la réactivité.',
  },
  {
    title: 'Briefing & débriefing simulés',
    description: 'Exercice de prise de parole : préparer et présenter un briefing de plongée complet, puis un débriefing constructif.',
    category: 'Encadrement',
    difficulty: 'intermediaire',
    targetNiveaux: ['3*'],
    instructorNotes: 'Évaluer la clarté, la structure et la pertinence des informations communiquées.',
  },
  {
    title: 'Travail en équipe – simulation de problèmes',
    description: 'Exercices de gestion de situations imprévues en équipe. Coordination, communication et résolution collective de problèmes.',
    category: 'Encadrement',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Préparer des scénarios variés. Débriefer chaque situation pour identifier les points d\'amélioration.',
  },

  // ── Communication ──
  {
    title: 'Signes et mise en œuvre d\'une lampe',
    description: 'Utilisation de la lampe comme outil de communication sous-marine. Signaux lumineux standards et procédures en plongée de nuit.',
    category: 'Communication',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Exercice en obscurité (lunettes opaques ou lumières éteintes). Travailler les signaux OK, problème, attention.',
  },

  // ── Orientation ──
  {
    title: 'Orientation en aveugle (guidage au contact)',
    description: 'Navigation sans visibilité : lunettes opaques, guidage au contact par un binôme. Développement de la confiance et de la communication tactile.',
    category: 'Orientation',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'Utiliser des lunettes opaques. Le binôme guide uniquement par le toucher. Alterner les rôles.',
  },

  // ── Apnée ──
  {
    title: 'Apnée – Économie d\'air et ventilation',
    description: 'Techniques de respiration et de ventilation pour optimiser la consommation d\'air. Exercices d\'apnée statique et dynamique.',
    category: 'Apnée',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*', '3*'],
    instructorNotes: 'Insister sur la sécurité : jamais d\'apnée seul. Exercices progressifs avec surveillance constante.',
  },
  {
    title: 'Apnée et agilité',
    description: 'Parcours ludique combinant apnée et exercices d\'agilité : passages dans des cerceaux, récupération d\'objets, slalom.',
    category: 'Apnée',
    difficulty: 'debutant',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Session ludique type « Saint-Nicolas ». Adapter la difficulté au niveau du groupe.',
  },

  // ── Gestion du stress ──
  {
    title: 'Gestion du stress – exercices surprises',
    description: 'Mise en situation inattendue : masque arraché, perte de détendeur, plongée sans vision. Apprentissage de la maîtrise émotionnelle.',
    category: 'Gestion du stress',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*', '3*'],
    instructorNotes: 'Prévenir les élèves qu\'il y aura des surprises sans donner les détails. Toujours surveiller de près. Ne jamais mettre un élève en danger réel.',
  },

  // ── Ludique ──
  {
    title: 'Parcours avec obstacles',
    description: 'Parcours aquatique avec cerceaux, couloirs, objets à déplacer. Développement de la coordination et de l\'aisance sous l\'eau.',
    category: 'Ludique',
    difficulty: 'debutant',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Installer le parcours avant la session. Varier les contraintes : avec palmes, sans masque, en binôme...',
  },
  {
    title: 'Relais chronométrés en palanquée',
    description: 'Course de relais en équipe avec contraintes techniques : transport d\'objet, passage d\'équipement, communication par signes.',
    category: 'Ludique',
    difficulty: 'debutant',
    targetNiveaux: ['1*', '2*', '3*'],
    instructorNotes: 'Former des équipes équilibrées. Les contraintes techniques doivent être adaptées au niveau (ex: vidage de masque pendant le relais pour les 2*).',
  },
  {
    title: 'Jeux de communication sous-marine',
    description: 'Jeux et exercices ludiques de communication : devinettes par signes, transmission de messages en chaîne, mime sous l\'eau.',
    category: 'Ludique',
    difficulty: 'debutant',
    targetNiveaux: ['1*', '2*', '3*'],
    instructorNotes: 'Excellente session pour renforcer la cohésion du groupe et réviser les signes standards de manière amusante.',
  },

  // ── Flottabilité ──
  {
    title: 'Flottabilité fine & utilisation du parachute',
    description: 'Maîtrise de la flottabilité neutre combinée au déploiement du parachute de palier. Maintien du palier pendant le gonflage du SMB.',
    category: 'Flottabilité',
    difficulty: 'intermediaire',
    targetNiveaux: ['2*', '3*'],
    instructorNotes: 'L\'exercice combine deux compétences. Vérifier la stabilité avant de passer au déploiement du parachute.',
  },

  // ── Préparation examen ──
  {
    title: 'Préparation examen – Théorie & briefing',
    description: 'Révision théorique ciblée : tables, physique, physiologie. Simulation de briefing d\'examen.',
    category: 'Préparation examen',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Identifier les lacunes de chaque élève. Fournir des exercices ciblés.',
  },
  {
    title: 'Préparation examen – Exercices pratiques',
    description: 'Enchaînement des exercices pratiques d\'examen : vidage de masque, remontée assistée, signes, stabilisation.',
    category: 'Préparation examen',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Reproduire les conditions d\'examen. Corriger les erreurs en temps réel.',
  },
  {
    title: 'Préparation examen – Simulation complète',
    description: 'Simulation d\'examen en conditions réelles : enchaînement complet des épreuves avec évaluation.',
    category: 'Préparation examen',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Évaluer comme un vrai examen. Débriefer individuellement après la session.',
  },
  {
    title: 'Examen blanc',
    description: 'Examen blanc complet avec notation. Dernière répétition avant l\'examen officiel.',
    category: 'Préparation examen',
    difficulty: 'intermediaire',
    targetNiveaux: ['1*', '2*'],
    instructorNotes: 'Conditions identiques à l\'examen réel. Fournir un retour détaillé écrit à chaque candidat.',
  },
];

async function importThemes() {
  console.log(`\n📚 Importing ${NEW_THEMES.length} session themes to ${COLLECTION}...\n`);

  // Fetch existing themes to avoid duplicates
  const existingSnap = await db.collection(COLLECTION).get();
  const existingTitles = new Set(existingSnap.docs.map(doc => doc.data().title));
  console.log(`📋 Found ${existingTitles.size} existing themes in Firestore.\n`);

  let added = 0;
  let skipped = 0;
  const batch = db.batch();

  for (const theme of NEW_THEMES) {
    if (existingTitles.has(theme.title)) {
      console.log(`  ⏭️  Skipped (exists): ${theme.title}`);
      skipped++;
      continue;
    }

    const docRef = db.collection(COLLECTION).doc();
    batch.set(docRef, {
      title: theme.title,
      description: theme.description,
      category: theme.category,
      difficulty: theme.difficulty,
      targetNiveaux: theme.targetNiveaux,
      instructorNotes: theme.instructorNotes || null,
      relatedExercices: [],
      timesUsed: 0,
      lastUsedDate: null,
    });
    console.log(`  ✅ Adding: ${theme.title} [${theme.category}]`);
    added++;
  }

  if (added > 0) {
    await batch.commit();
    console.log(`\n🎉 Done! Added ${added} new themes, skipped ${skipped} duplicates.`);
  } else {
    console.log('\n✅ All themes already exist. Nothing to import.');
  }

  process.exit(0);
}

importThemes().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

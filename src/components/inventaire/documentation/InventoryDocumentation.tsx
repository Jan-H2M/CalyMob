import { Book, Package, Calculator, Users, ClipboardCheck, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/utils';

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
}

const sections: Section[] = [
  { id: 'intro', title: 'Présentation Générale', icon: Book },
  { id: 'config', title: '1. Configuration Initiale', icon: Settings },
  { id: 'materiel', title: '2. Gestion du Matériel', icon: Package },
  { id: 'amortissement', title: '3. Amortissement Comptable', icon: Calculator },
  { id: 'prets', title: '4. Prêts de Matériel', icon: Users },
  { id: 'inventaire', title: '5. Inventaire Annuel', icon: ClipboardCheck },
];

export function InventoryDocumentation() {
  const [expandedSections, setExpandedSections] = useState<string[]>(['intro']);

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id)
        ? prev.filter(s => s !== id)
        : [...prev, id]
    );
  };

  const isExpanded = (id: string) => expandedSections.includes(id);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Book className="h-8 w-8" />
          <h1 className="text-2xl font-bold">Documentation Module Inventaire</h1>
        </div>
        <p className="text-blue-100">
          Guide complet pour la gestion du matériel, des prêts et de l'inventaire annuel
        </p>
      </div>

      {/* Table of Contents */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase mb-3">
          Sommaire
        </h2>
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => {
                  setExpandedSections([section.id]);
                  document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary transition-colors"
              >
                <Icon className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                {section.title}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content Sections */}
      <div className="space-y-4">
        {/* Intro Section */}
        <CollapsibleSection
          id="intro"
          title="Présentation Générale"
          icon={Book}
          isExpanded={isExpanded('intro')}
          onToggle={() => toggleSection('intro')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p>
              Le module Inventaire permet de gérer le matériel de plongée du club de manière complète :
              suivi unitaire de chaque article, prêts aux membres, et contrôle annuel.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mt-4">
              <h4 className="text-blue-800 dark:text-blue-300 font-semibold mb-2">Structure du module :</h4>
              <ul className="space-y-2 text-blue-700 dark:text-blue-400">
                <li><strong>Matériel</strong> : Gestion des articles individuels (régulateurs, gilets, lampes...)</li>
                <li><strong>Prêts</strong> : Suivi des prêts aux membres avec système de caution</li>
                <li><strong>Inventaire</strong> : Contrôle annuel pour vérifier physiquement le matériel</li>
              </ul>
            </div>
          </div>
        </CollapsibleSection>

        {/* Configuration Section */}
        <CollapsibleSection
          id="config"
          title="1. Configuration Initiale (Paramètres)"
          icon={Settings}
          isExpanded={isExpanded('config')}
          onToggle={() => toggleSection('config')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-4">
              <p className="text-yellow-800 dark:text-yellow-300 font-medium">
                Avant d'ajouter du matériel, configurez d'abord les types de matériel dans <strong>Paramètres &gt; Inventaire</strong>.
              </p>
            </div>

            <h3>1.1 Types de Matériel</h3>
            <p>Chaque type définit une catégorie de matériel avec ses caractéristiques propres.</p>

            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Champ</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-left">Exemple</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-4 py-2 font-medium">Nom *</td><td className="px-4 py-2">Nom du type</td><td className="px-4 py-2">Régulateur</td></tr>
                <tr><td className="px-4 py-2 font-medium">Préfixe *</td><td className="px-4 py-2">Préfixe pour codes auto (max 5 car.)</td><td className="px-4 py-2">REG</td></tr>
              </tbody>
            </table>

            <h4>Exemples de types courants :</h4>
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded p-4 font-mono text-sm">
              <pre>{`Type            Préfixe    Durée de vie
─────────────────────────────────────────
Régulateur      REG        10 ans
Gilet (BC)      BC         8 ans
Combinaison     COMB       5 ans
Lampe           LAMP       5 ans
Bloc            BLOC       15 ans
Ordinateur      ORDI       7 ans`}</pre>
            </div>

            <h3>1.2 Champs Personnalisés</h3>
            <p>Pour chaque type, vous pouvez ajouter des champs spécifiques :</p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Usage</th>
                  <th className="px-4 py-2 text-left">Exemple</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-4 py-2">Texte</td><td className="px-4 py-2">Saisie libre</td><td className="px-4 py-2">Commentaires</td></tr>
                <tr><td className="px-4 py-2">Nombre</td><td className="px-4 py-2">Valeur numérique</td><td className="px-4 py-2">Pression de service</td></tr>
                <tr><td className="px-4 py-2">Liste déroulante</td><td className="px-4 py-2">Choix parmi options</td><td className="px-4 py-2">Taille (XS, S, M, L, XL)</td></tr>
                <tr><td className="px-4 py-2">Date</td><td className="px-4 py-2">Date spécifique</td><td className="px-4 py-2">Date dernière épreuve</td></tr>
              </tbody>
            </table>

            <h3>1.3 Paramètres d'Amortissement</h3>
            <p>L'amortissement permet de calculer la dépréciation comptable du matériel.</p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Méthode</th>
                  <th className="px-4 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-4 py-2 font-medium">Linéaire</td><td className="px-4 py-2">Répartition égale sur la durée de vie (Valeur ÷ Années)</td></tr>
                <tr><td className="px-4 py-2 font-medium">Dégressif</td><td className="px-4 py-2">Accéléré les premières années (Taux × 2, max 40% règle belge)</td></tr>
                <tr><td className="px-4 py-2 font-medium">Manuel</td><td className="px-4 py-2">Montant saisi manuellement chaque année</td></tr>
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        {/* Materiel Section */}
        <CollapsibleSection
          id="materiel"
          title="2. Gestion du Matériel"
          icon={Package}
          isExpanded={isExpanded('materiel')}
          onToggle={() => toggleSection('materiel')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <h3>2.1 Créer un Nouveau Matériel</h3>
            <ol>
              <li>Allez dans <strong>Inventaire &gt; Matériel</strong></li>
              <li>Cliquez sur <strong>"Nouveau matériel"</strong></li>
              <li>Remplissez les informations</li>
            </ol>

            <h4>Informations recommandées :</h4>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Champ</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-left">Exemple</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-4 py-2">Fabricant</td><td className="px-4 py-2">Marque</td><td className="px-4 py-2">Mares, Scubapro</td></tr>
                <tr><td className="px-4 py-2">Modèle</td><td className="px-4 py-2">Nom du modèle</td><td className="px-4 py-2">MK25/S620</td></tr>
                <tr><td className="px-4 py-2">N° série</td><td className="px-4 py-2">Numéro fabricant</td><td className="px-4 py-2">123456789</td></tr>
                <tr><td className="px-4 py-2">Valeur d'achat</td><td className="px-4 py-2">Prix en euros</td><td className="px-4 py-2">450.00</td></tr>
                <tr><td className="px-4 py-2">Date d'achat</td><td className="px-4 py-2">Date acquisition</td><td className="px-4 py-2">15/03/2022</td></tr>
              </tbody>
            </table>

            <h3>2.2 Lieu d'Utilisation</h3>
            <p>Indiquez où le matériel est principalement utilisé :</p>
            <div className="grid grid-cols-3 gap-4 not-prose mb-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg text-center">
                <span className="text-2xl">🏔️</span>
                <p className="font-medium text-amber-800 dark:text-amber-300">Carrière</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Sorties en eau libre</p>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded-lg text-center">
                <span className="text-2xl">🏊</span>
                <p className="font-medium text-cyan-800 dark:text-cyan-300">Piscine</p>
                <p className="text-xs text-cyan-600 dark:text-cyan-400">Entraînement</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg text-center">
                <span className="text-2xl">📍</span>
                <p className="font-medium text-purple-800 dark:text-purple-300">Les deux</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Usage mixte</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
              Vous pouvez filtrer le matériel par lieu d'utilisation dans la liste principale.
            </p>

            <h3>2.3 Statuts et Conditions</h3>

            <h4>Statuts (où est le matériel) :</h4>
            <div className="grid grid-cols-3 gap-4 not-prose mb-4">
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center">
                <span className="text-2xl">📍</span>
                <p className="font-medium text-green-800 dark:text-green-300">Disponible</p>
                <p className="text-xs text-green-600 dark:text-green-400">Au local</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
                <span className="text-2xl">👤</span>
                <p className="font-medium text-blue-800 dark:text-blue-300">Prêté</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Chez un membre</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg text-center">
                <span className="text-2xl">🔧</span>
                <p className="font-medium text-orange-800 dark:text-orange-300">Maintenance</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">En révision</p>
              </div>
            </div>

            <h4>Conditions (état physique) :</h4>
            <div className="grid grid-cols-5 gap-2 not-prose">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Excellent</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-green-800 dark:text-green-300">Bon</p>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">Correct</p>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-orange-800 dark:text-orange-300">Usé</p>
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-red-800 dark:text-red-300">Hors service</p>
              </div>
            </div>

            <h3>2.4 Déclassement / Mise au Rebut</h3>
            <p>
              Lorsqu'un article est marqué <strong>"Hors service"</strong>, une section spéciale apparaît
              pour documenter le déclassement :
            </p>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4 not-prose">
              <h4 className="text-red-800 dark:text-red-300 font-semibold mb-3">Informations de déclassement</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">Date de déclassement</p>
                  <p className="text-red-600 dark:text-red-500">Quand l'article a été mis hors service</p>
                </div>
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">Motif</p>
                  <p className="text-red-600 dark:text-red-500">Usé, Fuite, Cassé, Perdu, Obsolète...</p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
              Ces informations sont utiles pour le suivi historique et les décisions de remplacement.
            </p>
          </div>
        </CollapsibleSection>

        {/* Amortissement Section */}
        <CollapsibleSection
          id="amortissement"
          title="3. Amortissement Comptable"
          icon={Calculator}
          isExpanded={isExpanded('amortissement')}
          onToggle={() => toggleSection('amortissement')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <h3>3.1 Fonctionnement</h3>
            <p>L'amortissement est calculé automatiquement selon les paramètres du type de matériel.</p>

            <h4>Exemple - Amortissement linéaire :</h4>
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded p-4 font-mono text-sm overflow-x-auto">
              <p className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mb-2">Régulateur acheté 500€ le 01/01/2020, durée de vie 10 ans</p>
              <pre>{`Année    Dotation    Valeur début    Valeur fin
──────────────────────────────────────────────────
2020     50€         500€            450€
2021     50€         450€            400€
2022     50€         400€            350€
...
2029     50€         50€             0€`}</pre>
            </div>

            <h4>Exemple - Amortissement dégressif (40%) :</h4>
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded p-4 font-mono text-sm overflow-x-auto">
              <p className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mb-2">Ordinateur acheté 400€ le 01/01/2022, durée de vie 5 ans</p>
              <pre>{`Année    Taux    Dotation    Valeur fin
────────────────────────────────────────
2022     40%     160€        240€
2023     40%     96€         144€
2024     40%     57.60€      86.40€
2025     40%     34.56€      51.84€
2026     -       51.84€      0€ (solde)`}</pre>
            </div>

            <h3>3.2 Verrouillage des Exercices</h3>
            <p>Pour garantir l'intégrité comptable, vous pouvez verrouiller les années passées.</p>

            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 p-4">
              <h4 className="text-red-800 dark:text-red-300 font-semibold mb-2">Conséquences du verrouillage :</h4>
              <ul className="text-red-700 dark:text-red-400 space-y-1">
                <li>❌ Impossible de modifier les dotations passées</li>
                <li>❌ Impossible de changer la méthode d'amortissement</li>
                <li>✅ Les années futures restent modifiables</li>
              </ul>
            </div>

            <h3>3.3 Override par Article</h3>
            <p>
              Vous pouvez personnaliser l'amortissement d'un article spécifique sans modifier
              les paramètres du type : méthode, durée de vie, taux, valeur résiduelle, date de début.
            </p>
          </div>
        </CollapsibleSection>

        {/* Prets Section */}
        <CollapsibleSection
          id="prets"
          title="4. Prêts de Matériel"
          icon={Users}
          isExpanded={isExpanded('prets')}
          onToggle={() => toggleSection('prets')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <h3>4.1 Créer un Nouveau Prêt</h3>
            <ol>
              <li>Allez dans <strong>Inventaire &gt; Prêts</strong></li>
              <li>Cliquez sur <strong>"Nouveau prêt"</strong></li>
              <li>Suivez l'assistant en 3 étapes</li>
            </ol>

            <div className="grid grid-cols-3 gap-4 not-prose mb-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="font-bold text-blue-800 dark:text-blue-300 mb-1">Étape 1</p>
                <p className="text-sm text-blue-700 dark:text-blue-400">Sélection du membre emprunteur</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="font-bold text-blue-800 dark:text-blue-300 mb-1">Étape 2</p>
                <p className="text-sm text-blue-700 dark:text-blue-400">Sélection du matériel disponible</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="font-bold text-blue-800 dark:text-blue-300 mb-1">Étape 3</p>
                <p className="text-sm text-blue-700 dark:text-blue-400">Dates et caution</p>
              </div>
            </div>

            <h3>4.2 Gestion des Cautions</h3>
            <p>Les cautions sont calculées automatiquement selon les règles définies.</p>

            <h4>Barème de remboursement typique :</h4>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">État au retour</th>
                  <th className="px-4 py-2 text-left">Remboursement</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-4 py-2">Excellent / Bon</td><td className="px-4 py-2 text-green-600">100%</td></tr>
                <tr><td className="px-4 py-2">Correct</td><td className="px-4 py-2 text-yellow-600">80%</td></tr>
                <tr><td className="px-4 py-2">Usé</td><td className="px-4 py-2 text-orange-600">50%</td></tr>
                <tr><td className="px-4 py-2">Perte / Casse</td><td className="px-4 py-2 text-red-600">0%</td></tr>
              </tbody>
            </table>

            <h3>4.3 Statuts des Prêts</h3>
            <div className="grid grid-cols-3 gap-4 not-prose">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg text-center">
                <p className="font-medium text-blue-800 dark:text-blue-300">Actif</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Prêt en cours</p>
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg text-center">
                <p className="font-medium text-red-800 dark:text-red-300">En retard</p>
                <p className="text-xs text-red-600 dark:text-red-400">Date dépassée</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg text-center">
                <p className="font-medium text-green-800 dark:text-green-300">Rendu</p>
                <p className="text-xs text-green-600 dark:text-green-400">Matériel retourné</p>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Inventaire Section */}
        <CollapsibleSection
          id="inventaire"
          title="5. Inventaire Annuel"
          icon={ClipboardCheck}
          isExpanded={isExpanded('inventaire')}
          onToggle={() => toggleSection('inventaire')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p>
              L'inventaire annuel permet de vérifier physiquement que tout le matériel est présent et en bon état.
            </p>

            <h3>5.1 Démarrer un Inventaire</h3>
            <ol>
              <li>Allez dans <strong>Inventaire &gt; Inventaire</strong> (onglet)</li>
              <li>Cliquez sur <strong>"Démarrer l'inventaire [année]"</strong></li>
              <li>Une liste de contrôle est créée avec tous les articles</li>
            </ol>

            <h3>5.2 Effectuer le Contrôle</h3>
            <p>Pour chaque article :</p>
            <ol>
              <li><strong>Localisez physiquement</strong> l'article avec son code (ex: REG-001)</li>
              <li><strong>Cochez "Retrouvé"</strong> si présent</li>
              <li><strong>Indiquez la nouvelle condition</strong> si elle a changé</li>
              <li><strong>Ajoutez des notes</strong> si nécessaire</li>
            </ol>

            <h4>Filtres disponibles :</h4>
            <div className="grid grid-cols-4 gap-2 not-prose mb-4">
              <div className="bg-gray-100 dark:bg-dark-bg-tertiary p-2 rounded text-center">
                <p className="text-xs font-medium">Tous</p>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">À faire</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-green-800 dark:text-green-300">Faits</p>
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded text-center">
                <p className="text-xs font-medium text-red-800 dark:text-red-300">Manquants</p>
              </div>
            </div>

            <h3>5.3 Fermer et Verrouiller</h3>
            <p>L'inventaire passe par trois états :</p>

            <div className="grid grid-cols-3 gap-3 not-prose my-4">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg text-center">
                <p className="font-bold text-blue-800 dark:text-blue-300">En cours</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Contrôle en cours</p>
              </div>
              <div className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 p-3 rounded-lg text-center">
                <p className="font-bold text-gray-800 dark:text-gray-300">Fermé</p>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mt-1">Encore modifiable</p>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg text-center">
                <p className="font-bold text-orange-800 dark:text-orange-300">Verrouillé</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Lecture seule</p>
              </div>
            </div>

            <h4>Bouton "Fermer" (gris)</h4>
            <ul>
              <li>Marque l'inventaire comme <strong>fermé</strong></li>
              <li>Les modifications restent possibles</li>
              <li>Peut être réouvert avec le bouton "Ouvrir"</li>
            </ul>

            <h4>Bouton "Verrouiller" (orange)</h4>
            <ul>
              <li>Fige définitivement l'inventaire</li>
              <li><strong>Aucune modification possible</strong> après verrouillage</li>
              <li>Destiné à la comptabilité officielle</li>
            </ul>

            <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 p-4 mt-4">
              <h4 className="text-orange-800 dark:text-orange-300 font-semibold mb-2">Double confirmation pour déverrouiller</h4>
              <p className="text-orange-700 dark:text-orange-400 text-sm">
                Le déverrouillage nécessite deux confirmations car l'inventaire peut déjà être
                repris en comptabilité. Normalement, on ne modifie <strong>jamais</strong> un
                inventaire verrouillé.
              </p>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 p-4 mt-4">
              <h4 className="text-green-800 dark:text-green-300 font-semibold mb-2">Rapport généré :</h4>
              <ul className="text-green-700 dark:text-green-400 space-y-1">
                <li>Total d'articles contrôlés</li>
                <li>Nombre d'articles retrouvés</li>
                <li>Nombre d'articles manquants</li>
                <li>Liste des changements d'état</li>
              </ul>
            </div>

            <h3>5.4 Historique et Comparaison</h3>
            <p>
              Après avoir terminé un inventaire, vous pouvez consulter l'historique et comparer avec les années précédentes.
            </p>

            <h4>Tableau de comparaison :</h4>
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded p-4 font-mono text-sm overflow-x-auto mb-4">
              <pre>{`Année    Total    Retrouvés    Manquants    Taux
─────────────────────────────────────────────────
2025     155      152          3            98%
2024     148      145          3            98%
2023     140      138          2            99%`}</pre>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-4">
              <h4 className="text-blue-800 dark:text-blue-300 font-semibold mb-2">Indicateurs de tendance :</h4>
              <ul className="text-blue-700 dark:text-blue-400 space-y-1">
                <li>📈 <strong>Flèche verte vers le haut</strong> : amélioration (plus d'articles, moins de manquants)</li>
                <li>📉 <strong>Flèche rouge vers le bas</strong> : dégradation (moins d'articles, plus de manquants)</li>
                <li>➖ <strong>Trait gris</strong> : stable</li>
              </ul>
            </div>

            <h4 className="mt-4">Résumé automatique :</h4>
            <p>
              Le système affiche automatiquement la comparaison avec l'année précédente :
            </p>
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded p-3 mt-2 text-sm">
              <em>"Par rapport à 2024 : <span className="text-green-600">+7 articles</span>, <span className="text-green-600">même nombre de manquants</span>"</em>
            </div>

            <h3>5.5 Annuler un Contrôle</h3>
            <p>
              Si vous avez coché un article par erreur, vous pouvez annuler le contrôle en cliquant à nouveau sur le même bouton :
            </p>
            <ul>
              <li>Cliquez sur ✓ (retrouvé) alors que l'article est déjà marqué retrouvé → Remis à "À vérifier"</li>
              <li>Cliquez sur ✗ (manquant) alors que l'article est déjà marqué manquant → Remis à "À vérifier"</li>
            </ul>
          </div>
        </CollapsibleSection>
      </div>

      {/* Footer */}
      <div className="mt-8 p-4 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-center text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
        Documentation Module Inventaire - CalyCompta
      </div>
    </div>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon: React.ElementType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ id, title, icon: Icon, isExpanded, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div id={id} className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">{title}</h2>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
        )}
      </button>

      <div className={cn(
        'transition-all duration-200 overflow-hidden',
        isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="p-6 pt-2 border-t border-gray-200 dark:border-dark-border">
          {children}
        </div>
      </div>
    </div>
  );
}

import { Book, Calendar, CalendarDays, Users, UserCheck, Wind, Settings, MessageSquare, ChevronDown, ChevronRight, Check, X, Minus, Smartphone, Monitor, BookOpen, Gauge, Clock, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/utils';

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
}

const sections: Section[] = [
  { id: 'intro', title: 'Présentation Générale', icon: Book },
  { id: 'config', title: '1. Configuration (Admin)', icon: Settings },
  { id: 'disponibilites', title: '2. Disponibilités (CalyMob)', icon: Calendar },
  { id: 'planning', title: '3. Planning des Séances', icon: CalendarDays },
  { id: 'grid', title: '4. Grille des Disponibilités', icon: Users },
  { id: 'equipes', title: '5. Équipes & Discussion', icon: MessageSquare },
];

export function PiscineDocumentation() {
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
          <h1 className="text-2xl font-bold">Documentation Planification Piscine</h1>
        </div>
        <p className="text-blue-100">
          Guide complet pour la gestion des séances piscine, des disponibilités et des équipes
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
              Le système de planification piscine permet de gérer les séances d'entraînement hebdomadaires,
              les disponibilités des encadrants, et la communication entre les équipes.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mt-4">
              <h4 className="text-blue-800 dark:text-blue-300 font-semibold mb-2">Deux applications complémentaires :</h4>
              <div className="grid grid-cols-2 gap-4 not-prose">
                <div className="bg-white dark:bg-dark-bg-tertiary rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-blue-800 dark:text-blue-300">CalyCompta (Web)</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Pour les administrateurs : planification des séances, vue d'ensemble des disponibilités
                  </p>
                </div>
                <div className="bg-white dark:bg-dark-bg-tertiary rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-blue-800 dark:text-blue-300">CalyMob (Mobile)</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Pour les membres : indiquer ses disponibilités, discussions d'équipe
                  </p>
                </div>
              </div>
            </div>

            <h3>Les quatre rôles piscine</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 not-prose mb-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-center">
                <Users className="h-8 w-8 mx-auto text-blue-600 dark:text-blue-400 mb-2" />
                <p className="font-bold text-blue-800 dark:text-blue-300">Accueil</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Vestiaires & entrée</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg text-center">
                <UserCheck className="h-8 w-8 mx-auto text-purple-600 dark:text-purple-400 mb-2" />
                <p className="font-bold text-purple-800 dark:text-purple-300">Encadrants</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Instructeurs par niveau</p>
              </div>
              <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-lg text-center">
                <Wind className="h-8 w-8 mx-auto text-sky-600 dark:text-sky-400 mb-2" />
                <p className="font-bold text-sky-800 dark:text-sky-300">Gonflage</p>
                <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">Remplissage bouteilles</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg text-center">
                <BookOpen className="h-8 w-8 mx-auto text-orange-600 dark:text-orange-400 mb-2" />
                <p className="font-bold text-orange-800 dark:text-orange-300">Théorie</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Cours théoriques</p>
              </div>
            </div>

            <h3>Les niveaux de formation</h3>
            <div className="grid grid-cols-6 gap-2 not-prose">
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-center">
                <p className="text-lg">⭐</p>
                <p className="text-xs font-medium">1*</p>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-center">
                <p className="text-lg">⭐⭐</p>
                <p className="text-xs font-medium">2*</p>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-center">
                <p className="text-lg">⭐⭐⭐</p>
                <p className="text-xs font-medium">3*</p>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-center">
                <p className="text-lg">⭐⭐⭐⭐</p>
                <p className="text-xs font-medium">4*</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded text-center">
                <p className="text-lg">🎓</p>
                <p className="text-xs font-medium">AM</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded text-center">
                <p className="text-lg">🎓🎓</p>
                <p className="text-xs font-medium">MC</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mt-2">
              AM = Aide Moniteur, MC = Moniteur Club
            </p>
          </div>
        </CollapsibleSection>

        {/* Configuration Section */}
        <CollapsibleSection
          id="config"
          title="1. Configuration (Admin)"
          icon={Settings}
          isExpanded={isExpanded('config')}
          onToggle={() => toggleSection('config')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-4">
              <p className="text-yellow-800 dark:text-yellow-300 font-medium">
                Avant d'utiliser le système, assurez-vous que les membres ont les bonnes fonctions attribuées.
              </p>
            </div>

            <h3>1.1 Attribuer les fonctions aux membres</h3>
            <p>Les fonctions sont gérées dans le profil de chaque membre, dans le champ <strong>clubStatuten</strong>.</p>

            <ol>
              <li>Allez dans <strong>Membres &gt; [Sélectionner un membre]</strong></li>
              <li>Dans la section <strong>Statuts du club</strong>, ajoutez les fonctions appropriées</li>
              <li>Les fonctions disponibles sont : Accueil, Encadrant, Gonflage, Théorie</li>
            </ol>

            <h3>1.2 Gérer la liste des fonctions</h3>
            <p>Les fonctions sont définies dans la liste de valeurs <strong>fonction</strong>.</p>

            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Fonction</th>
                  <th className="px-4 py-2 text-left">Couleur</th>
                  <th className="px-4 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 font-medium">Accueil</td>
                  <td className="px-4 py-2"><span className="inline-block w-4 h-4 rounded bg-blue-500"></span> Bleu</td>
                  <td className="px-4 py-2">Gestion vestiaires et accueil des plongeurs</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">Encadrant</td>
                  <td className="px-4 py-2"><span className="inline-block w-4 h-4 rounded bg-purple-500"></span> Violet</td>
                  <td className="px-4 py-2">Instructeur de plongée</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">Gonflage</td>
                  <td className="px-4 py-2"><span className="inline-block w-4 h-4 rounded bg-sky-500"></span> Sky</td>
                  <td className="px-4 py-2">Responsable du remplissage des bouteilles</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">Théorie</td>
                  <td className="px-4 py-2"><span className="inline-block w-4 h-4 rounded bg-orange-500"></span> Orange</td>
                  <td className="px-4 py-2">Encadrant pour les cours théoriques</td>
                </tr>
              </tbody>
            </table>

            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-4 mt-4">
              <h4 className="text-blue-800 dark:text-blue-300 font-semibold mb-2">Chemin d'accès :</h4>
              <p className="text-blue-700 dark:text-blue-400 text-sm">
                <strong>Paramètres &gt; Listes de valeurs &gt; fonction</strong>
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Disponibilités Section */}
        <CollapsibleSection
          id="disponibilites"
          title="2. Disponibilités (CalyMob)"
          icon={Calendar}
          isExpanded={isExpanded('disponibilites')}
          onToggle={() => toggleSection('disponibilites')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p>
              Les membres utilisent l'application mobile <strong>CalyMob</strong> pour indiquer leurs disponibilités
              pour les séances piscine du mois.
            </p>

            <h3>2.1 Accéder à la section Piscine</h3>
            <ol>
              <li>Ouvrir l'application CalyMob</li>
              <li>Appuyer sur le bouton <strong>Piscine</strong> sur l'écran d'accueil</li>
              <li>Le bouton n'apparaît que si le membre a au moins une fonction piscine (Accueil, Encadrant, Gonflage ou Théorie)</li>
            </ol>

            <h3>2.2 Indiquer ses disponibilités</h3>
            <p>Les séances piscine ont lieu chaque <strong>mardi</strong>. Pour chaque mardi du mois :</p>

            <div className="grid grid-cols-3 gap-4 not-prose mb-4">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center border-2 border-green-300 dark:border-green-700">
                <Check className="h-8 w-8 mx-auto text-green-600 dark:text-green-400 mb-2" />
                <p className="font-bold text-green-800 dark:text-green-300">Disponible</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Je peux venir</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-center border-2 border-red-300 dark:border-red-700">
                <X className="h-8 w-8 mx-auto text-red-600 dark:text-red-400 mb-2" />
                <p className="font-bold text-red-800 dark:text-red-300">Non disponible</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Je ne peux pas</p>
              </div>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700 p-4 rounded-lg text-center border-2 border-gray-300 dark:border-dark-border dark:border-gray-600">
                <Minus className="h-8 w-8 mx-auto text-gray-400 dark:text-dark-text-muted mb-2" />
                <p className="font-bold text-gray-800 dark:text-gray-300">Pas indiqué</p>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mt-1">En attente</p>
              </div>
            </div>

            <h3>2.3 Par rôle</h3>
            <p>
              Si un membre a plusieurs fonctions (ex: Encadrant ET Accueil), il verra un onglet par fonction
              et devra indiquer sa disponibilité pour chaque rôle séparément.
            </p>

            <h3>2.4 Créneaux spécifiques</h3>
            <p>
              Certains rôles permettent d'indiquer des <strong>créneaux horaires</strong> précis :
            </p>

            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Rôle</th>
                  <th className="px-4 py-2 text-left">Créneaux disponibles</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 font-medium text-purple-600">Encadrants</td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-medium bg-purple-100 dark:bg-purple-800/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded mr-1">20h15</span>
                    <span className="text-[10px] font-medium bg-purple-100 dark:bg-purple-800/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">21h15</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium text-sky-600">Gonflage</td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-medium bg-sky-100 dark:bg-sky-800/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded mr-1">19h45</span>
                    <span className="text-[10px] font-medium bg-sky-100 dark:bg-sky-800/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded mr-1">20h15</span>
                    <span className="text-[10px] font-medium bg-sky-100 dark:bg-sky-800/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded">21h30</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium text-orange-600">Théorie</td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-medium bg-orange-100 dark:bg-orange-800/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded mr-1">19h30</span>
                    <span className="text-[10px] font-medium bg-orange-100 dark:bg-orange-800/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">21h45</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mt-4">
              <h4 className="text-yellow-800 dark:text-yellow-300 font-semibold mb-2">Important :</h4>
              <p className="text-yellow-700 dark:text-yellow-400 text-sm">
                Les disponibilités doivent être indiquées <strong>avant</strong> que l'administrateur ne crée le planning.
                Une fois assigné à une séance, le membre recevra une notification.
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Planning Section */}
        <CollapsibleSection
          id="planning"
          title="3. Planning des Séances"
          icon={CalendarDays}
          isExpanded={isExpanded('planning')}
          onToggle={() => toggleSection('planning')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p>
              L'administrateur utilise <strong>CalyCompta</strong> pour créer et gérer les séances piscine.
              Le planning s'affiche sous forme d'un <strong>timeline visuel</strong> (style "guide TV")
              couvrant la plage horaire 19:30 à 23:30.
            </p>

            <h3>3.1 Créer une séance</h3>
            <ol>
              <li>Cliquez sur <strong>"Nouvelle séance"</strong> en haut à droite</li>
              <li>Sélectionnez le ou les mardis du mois</li>
              <li>Choisissez le type : <strong>Normal</strong> ou <strong>Théorie</strong> (badge "T" orange)</li>
            </ol>

            <h3>3.2 Le timeline (vue guide TV)</h3>
            <p>Chaque séance s'affiche comme un timeline horizontal avec des pistes par rôle :</p>

            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-dark-bg-tertiary">
                  <th className="px-4 py-2 text-left">Piste</th>
                  <th className="px-4 py-2 text-left">Blocs horaires</th>
                  <th className="px-4 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 font-medium text-blue-600 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Accueil
                  </td>
                  <td className="px-4 py-2 text-xs">20:15-21:15, 21:15-22:15</td>
                  <td className="px-4 py-2">Responsables de l'accueil et des vestiaires</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium text-teal-600 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> Baptêmes
                  </td>
                  <td className="px-4 py-2 text-xs">20:15-21:15</td>
                  <td className="px-4 py-2">Encadrants pour les initiations/découvertes</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium text-gray-600 flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5" /> Gonflage
                  </td>
                  <td className="px-4 py-2 text-xs">19:45-20:15, 20:15-21:15, 21:15-22:30</td>
                  <td className="px-4 py-2">Remplissage des bouteilles par créneau</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium text-orange-600 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" /> Théorie
                  </td>
                  <td className="px-4 py-2 text-xs">19:30-20:30, 21:45-22:30, 22:30-23:30</td>
                  <td className="px-4 py-2">Cours théoriques en salle</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium text-purple-600">Niveaux (1*, 2*, 3*, 4*, AM, MC)</td>
                  <td className="px-4 py-2 text-xs">1ère heure: 20:15-21:15, 2ème heure: 21:15-22:15</td>
                  <td className="px-4 py-2">Une piste par niveau de formation</td>
                </tr>
              </tbody>
            </table>

            <h3>3.3 Assigner des membres</h3>
            <p>
              Cliquez sur le bouton <strong>+</strong> dans un bloc horaire pour assigner un membre.
              Seuls les membres ayant le rôle correspondant (et étant disponibles) sont proposés.
            </p>

            <h3>3.4 Thèmes et commentaires</h3>
            <p>
              Chaque bloc horaire peut avoir un <strong>thème</strong> ou un <strong>commentaire</strong>.
              Cliquez sur la ligne de thème dans le bloc pour le modifier.
            </p>
            <p>
              Pour les niveaux, le thème peut être défini <strong>par heure</strong> (1ère heure et 2ème heure
              peuvent avoir des thèmes différents, ex: "Vidage de masque" puis "Remontée contrôlée").
            </p>

            <h3>3.5 Détection de conflits</h3>
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <h4 className="text-red-800 dark:text-red-300 font-semibold">Conflits d'assignation</h4>
              </div>
              <p className="text-red-700 dark:text-red-400 text-sm">
                Si un membre est assigné à deux blocs horaires qui se chevauchent, un <strong>anneau rouge</strong> apparaît
                autour de son badge pour signaler le conflit. Vérifiez et corrigez les assignations en conséquence.
              </p>
            </div>

            <h3>3.6 Statuts et export</h3>
            <p>
              Chaque séance a un <strong>statut</strong> (brouillon, publié, etc.) modifiable via le menu de statut.
              Vous pouvez également <strong>exporter un rapport</strong> de la séance.
            </p>
          </div>
        </CollapsibleSection>

        {/* Grid Section */}
        <CollapsibleSection
          id="grid"
          title="4. Grille des Disponibilités"
          icon={Users}
          isExpanded={isExpanded('grid')}
          onToggle={() => toggleSection('grid')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p>
              La grille des disponibilités offre une vue d'ensemble de qui est disponible chaque mardi du mois.
            </p>

            <h3>4.1 Accéder à la grille</h3>
            <ol>
              <li>Allez dans <strong>Piscine &gt; Disponibilités</strong></li>
              <li>Utilisez les flèches pour naviguer entre les mois</li>
            </ol>

            <h3>4.2 Filtrer par rôle</h3>
            <p>Utilisez les boutons de filtre pour voir uniquement un type de membre :</p>

            <div className="flex gap-2 not-prose mb-4 flex-wrap">
              <div className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                Tous
              </div>
              <div className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Accueil (5)
              </div>
              <div className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                Encadrants (12)
              </div>
              <div className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
                <Wind className="w-4 h-4" />
                Gonflage (3)
              </div>
              <div className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Théorie (4)
              </div>
            </div>

            <h3>4.3 Légende des statuts</h3>
            <div className="flex items-center gap-6 text-sm not-prose mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800/40 px-1.5 py-0.5 rounded">
                  1ère h.
                </span>
                <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Créneaux spécifiques</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center">
                  <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Non disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded flex items-center justify-center">
                  <Minus className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                </div>
                <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Pas encore indiqué</span>
              </div>
            </div>

            <h3>4.4 Structure de la grille</h3>
            <p>
              La grille est organisée par <strong>section de rôle</strong>. Pour les Encadrants, Gonflage et Théorie,
              des <strong>chips de créneaux</strong> indiquent les heures disponibles du membre.
            </p>
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded p-4 font-mono text-sm overflow-x-auto">
              <pre>{`Membre              7 jan      14 jan     21 jan
────────────────────────────────────────────────
Équipe Accueil
  Jean Dupont        ✓          ✓          ✗
  Marie Lambert      ✓          ✗          -

Encadrants (20h15 / 21h15)
  Pierre Martin      20h15      20h15      ✗
  Sophie Bernard     ✗          21h15      20h15

Équipe Gonflage (19h45 / 20h15 / 21h30)
  François Thomas    19h45      19h45      ✓
                     20h15      21h30

Théorie (19h30 / 21h45)
  Alice Moreau       19h30      ✗          19h30
                                            21h45`}</pre>
            </div>
          </div>
        </CollapsibleSection>

        {/* Équipes Section */}
        <CollapsibleSection
          id="equipes"
          title="5. Équipes & Discussion"
          icon={MessageSquare}
          isExpanded={isExpanded('equipes')}
          onToggle={() => toggleSection('equipes')}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p>
              Chaque rôle dispose d'un canal de discussion permanent dans l'application mobile CalyMob.
            </p>

            <h3>5.1 Canaux d'équipe</h3>
            <div className="grid grid-cols-3 gap-4 not-prose mb-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎫</span>
                  <span className="font-semibold text-blue-800 dark:text-blue-300">Équipe Accueil</span>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  Discussion permanente pour l'équipe d'accueil piscine
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎓</span>
                  <span className="font-semibold text-purple-800 dark:text-purple-300">Équipe Encadrants</span>
                </div>
                <p className="text-sm text-purple-700 dark:text-purple-400">
                  Discussion permanente pour tous les encadrants
                </p>
              </div>
              <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-lg border border-sky-200 dark:border-sky-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎈</span>
                  <span className="font-semibold text-sky-800 dark:text-sky-300">Équipe Gonflage</span>
                </div>
                <p className="text-sm text-sky-700 dark:text-sky-400">
                  Discussion permanente pour l'équipe gonflage
                </p>
              </div>
            </div>

            <h3>5.2 Fonctionnalités</h3>
            <ul>
              <li><strong>Messages texte</strong> : Communication entre membres de l'équipe</li>
              <li><strong>Pièces jointes</strong> : Partage d'images et de documents PDF</li>
              <li><strong>Notifications</strong> : Alerte lors de nouveaux messages</li>
              <li><strong>Indicateur non-lu</strong> : Badge affichant le nombre de messages non lus</li>
            </ul>

            <h3>5.3 Accès</h3>
            <p>Un membre voit uniquement les canaux correspondant à ses fonctions :</p>

            <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded p-4 font-mono text-sm">
              <pre>{`Exemple: Jean (Accueil + Encadrant)
────────────────────────────────────
✓ Équipe Accueil    (visible)
✓ Équipe Encadrants (visible)
✗ Équipe Gonflage   (non visible)`}</pre>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 p-4 mt-4">
              <h4 className="text-green-800 dark:text-green-300 font-semibold mb-2">Avantage :</h4>
              <p className="text-green-700 dark:text-green-400 text-sm">
                Les canaux sont <strong>permanents</strong> : l'historique des discussions est conservé,
                contrairement aux messages liés à une séance spécifique.
              </p>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Footer */}
      <div className="mt-8 p-4 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-center text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
        Documentation Module Piscine - CalyCompta & CalyMob
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

export default PiscineDocumentation;

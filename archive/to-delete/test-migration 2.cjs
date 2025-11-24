#!/usr/bin/env node

/**
 * Script de Tests Automatisés - Migration Événements → Opérations
 *
 * Ce script exécute tous les tests automatisables pour vérifier que la migration
 * est complète et que l'application fonctionne correctement.
 *
 * Usage: node scripts/test-migration.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Statistiques globales
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  startTime: Date.now(),
};

// Résultats détaillés
const results = [];

/**
 * Affiche un message coloré
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Affiche un titre de section
 */
function section(title) {
  log('\n' + '='.repeat(80), 'cyan');
  log(`  ${title}`, 'bright');
  log('='.repeat(80), 'cyan');
}

/**
 * Enregistre un résultat de test
 */
function recordTest(name, status, details = '') {
  stats.total++;
  if (status === 'PASS') stats.passed++;
  if (status === 'FAIL') stats.failed++;
  if (status === 'WARN') stats.warnings++;

  results.push({ name, status, details });

  const color = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';

  log(`  ${icon} ${name}`, color);
  if (details) {
    log(`    ${details}`, 'reset');
  }
}

/**
 * Exécute une commande shell et retourne le résultat
 */
function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (error) {
    if (options.ignoreError) {
      return error.stdout || '';
    }
    throw error;
  }
}

/**
 * Cherche un pattern dans les fichiers du projet
 */
function searchInFiles(pattern, extensions = ['ts', 'tsx', 'js', 'jsx']) {
  const extPattern = extensions.join(',');
  const command = `find calycompta-app/src -type f \\( -name "*.${extPattern.replace(/,/g, '" -o -name "*.')}" \\) -exec grep -l "${pattern}" {} \\;`;

  try {
    const result = exec(command, { silent: true, ignoreError: true });
    return result.trim().split('\n').filter(line => line.length > 0);
  } catch (error) {
    return [];
  }
}

/**
 * Compte les occurrences d'un pattern dans les fichiers
 */
function countOccurrences(pattern, extensions = ['ts', 'tsx', 'js', 'jsx']) {
  const extPattern = extensions.join(',');
  const command = `find calycompta-app/src -type f \\( -name "*.${extPattern.replace(/,/g, '" -o -name "*.')}" \\) -exec grep -o "${pattern}" {} \\; | wc -l`;

  try {
    const result = exec(command, { silent: true, ignoreError: true });
    return parseInt(result.trim()) || 0;
  } catch (error) {
    return 0;
  }
}

// =============================================================================
// TESTS SECTION 1: Validation de la Terminologie
// =============================================================================

function testTerminology() {
  section('SECTION 1: Validation Terminologie');

  // Test 1.1: Vérifier qu'il n'y a plus de "Événements" dans l'interface
  const eventFilesUI = searchInFiles('Événement[s]?(?!\\s*VP\\s*Dive)', ['tsx']);
  if (eventFilesUI.length === 0) {
    recordTest('Terminologie "Événements" remplacée dans UI', 'PASS');
  } else {
    recordTest('Terminologie "Événements" remplacée dans UI', 'FAIL',
      `Trouvé dans: ${eventFilesUI.slice(0, 3).join(', ')}`);
  }

  // Test 1.2: Vérifier que "Opérations" est utilisé
  const operationsCount = countOccurrences('Opération[s]?', ['tsx']);
  if (operationsCount > 50) {
    recordTest('Terminologie "Opérations" utilisée', 'PASS', `${operationsCount} occurrences`);
  } else {
    recordTest('Terminologie "Opérations" utilisée', 'WARN',
      `Seulement ${operationsCount} occurrences trouvées`);
  }

  // Test 1.3: Vérifier App.tsx importe OperationsPage
  const appContent = fs.readFileSync('calycompta-app/src/App.tsx', 'utf8');
  if (appContent.includes("import { OperationsPage }") &&
      !appContent.includes("import { EvenementsPage }")) {
    recordTest('App.tsx importe OperationsPage', 'PASS');
  } else {
    recordTest('App.tsx importe OperationsPage', 'FAIL',
      'App.tsx doit importer OperationsPage, pas EvenementsPage');
  }

  // Test 1.4: Vérifier Layout.tsx utilise "Opérations"
  const layoutContent = fs.readFileSync('calycompta-app/src/components/commun/Layout.tsx', 'utf8');
  if (layoutContent.includes('Opérations') && !layoutContent.includes('Événements')) {
    recordTest('Layout.tsx utilise "Opérations"', 'PASS');
  } else {
    recordTest('Layout.tsx utilise "Opérations"', 'FAIL');
  }

  // Test 1.5: Vérifier PermissionMatrix utilise "Opérations"
  const permContent = fs.readFileSync('calycompta-app/src/components/settings/PermissionMatrix.tsx', 'utf8');
  if (permContent.includes("category: 'Opérations'")) {
    recordTest('PermissionMatrix utilise catégorie "Opérations"', 'PASS');
  } else {
    recordTest('PermissionMatrix utilise catégorie "Opérations"', 'FAIL');
  }

  // Test 1.6: Vérifier que EvenementsPage.tsx n'existe plus
  const oldPageExists = fs.existsSync('calycompta-app/src/components/evenements/EvenementsPage.tsx');
  if (!oldPageExists) {
    recordTest('EvenementsPage.tsx supprimé', 'PASS');
  } else {
    recordTest('EvenementsPage.tsx supprimé', 'FAIL',
      'Le fichier legacy existe encore');
  }

  // Test 1.7: Vérifier que OperationsPage.tsx existe
  const newPageExists = fs.existsSync('calycompta-app/src/components/operations/OperationsPage.tsx');
  if (newPageExists) {
    recordTest('OperationsPage.tsx existe', 'PASS');
  } else {
    recordTest('OperationsPage.tsx existe', 'FAIL',
      'Le nouveau composant est manquant');
  }
}

// =============================================================================
// TESTS SECTION 2: Structure des Fichiers
// =============================================================================

function testFileStructure() {
  section('SECTION 2: Structure des Fichiers');

  // Test 2.1: Vérifier composants operations
  const operationsComponents = [
    'OperationsPage.tsx',
    'OperationTypeSelector.tsx',
    'VPDiveImportModal.tsx',
    'CotisationFormModal.tsx',
    'DonFormModal.tsx',
    'SubventionFormModal.tsx',
    'VenteFormModal.tsx',
    'AutreOperationFormModal.tsx',
  ];

  operationsComponents.forEach(component => {
    const exists = fs.existsSync(`calycompta-app/src/components/operations/${component}`);
    recordTest(`Composant operations/${component} existe`, exists ? 'PASS' : 'FAIL');
  });

  // Test 2.2: Vérifier services
  const services = [
    'operationService.ts',
    'membreExcelParser.ts',
    'pptxExportService.ts',
  ];

  services.forEach(service => {
    const exists = fs.existsSync(`calycompta-app/src/services/${service}`);
    recordTest(`Service ${service} existe`, exists ? 'PASS' : 'FAIL');
  });

  // Test 2.3: Vérifier scripts de migration
  const scripts = [
    'migrate-to-operations.js',
    'backup-firestore.js',
    'restore-firestore.js',
    'compare-firestore.js',
  ];

  scripts.forEach(script => {
    const exists = fs.existsSync(`calycompta-app/scripts/${script}`);
    recordTest(`Script ${script} existe`, exists ? 'PASS' : 'FAIL');
  });

  // Test 2.4: Vérifier documentation
  const docs = [
    'MIGRATION_COMPLETE.md',
    'ROLLBACK.md',
    'TESTS_FIREBASE.md',
    'TESTS_MANUELS.md',
  ];

  docs.forEach(doc => {
    const exists = fs.existsSync(doc);
    recordTest(`Documentation ${doc} existe`, exists ? 'PASS' : 'FAIL');
  });
}

// =============================================================================
// TESTS SECTION 3: Validation TypeScript
// =============================================================================

function testTypeScript() {
  section('SECTION 3: Validation TypeScript');

  // Test 3.1: Vérifier les types Operation dans types/index.ts
  const typesContent = fs.readFileSync('calycompta-app/src/types/index.ts', 'utf8');

  const requiredTypes = [
    'Operation',
    'ParticipantOperation',
    'OperationType',
    'Cotisation',
    'Don',
    'Subvention',
    'Vente',
    'AutreOperation',
  ];

  requiredTypes.forEach(type => {
    if (typesContent.includes(`export interface ${type}`) ||
        typesContent.includes(`export type ${type}`)) {
      recordTest(`Type ${type} défini`, 'PASS');
    } else {
      recordTest(`Type ${type} défini`, 'FAIL');
    }
  });

  // Test 3.2: Build TypeScript (vérification compilation)
  try {
    log('\n  Compilation TypeScript en cours...', 'blue');
    exec('cd calycompta-app && npm run build', { silent: false });
    recordTest('Build TypeScript réussit', 'PASS');
  } catch (error) {
    recordTest('Build TypeScript réussit', 'FAIL',
      'Erreurs de compilation détectées');
  }
}

// =============================================================================
// TESTS SECTION 4: Validation des Routes
// =============================================================================

function testRouting() {
  section('SECTION 4: Validation des Routes');

  const appContent = fs.readFileSync('calycompta-app/src/App.tsx', 'utf8');

  // Test 4.1: Route /operations existe
  if (appContent.includes('path="operations"') &&
      appContent.includes('<OperationsPage />')) {
    recordTest('Route /operations configurée', 'PASS');
  } else {
    recordTest('Route /operations configurée', 'FAIL');
  }

  // Test 4.2: Pas de route /evenements
  if (!appContent.includes('path="evenements"')) {
    recordTest('Route /evenements supprimée', 'PASS');
  } else {
    recordTest('Route /evenements supprimée', 'FAIL',
      'La route legacy existe encore');
  }

  // Test 4.3: Navigation dans Layout
  const layoutContent = fs.readFileSync('calycompta-app/src/components/commun/Layout.tsx', 'utf8');
  if (layoutContent.includes('to="/operations"')) {
    recordTest('Navigation vers /operations dans Layout', 'PASS');
  } else {
    recordTest('Navigation vers /operations dans Layout', 'FAIL');
  }
}

// =============================================================================
// TESTS SECTION 5: Firebase Rules
// =============================================================================

function testFirebaseRules() {
  section('SECTION 5: Validation Firebase Rules');

  // Test 5.1: Firestore rules - collections operations
  const firestoreRules = fs.readFileSync('calycompta-app/firestore.rules', 'utf8');

  if (firestoreRules.includes('/operations/{operationId}')) {
    recordTest('Firestore rules: collection operations', 'PASS');
  } else {
    recordTest('Firestore rules: collection operations', 'FAIL');
  }

  if (firestoreRules.includes('/operation_participants/{participantId}')) {
    recordTest('Firestore rules: collection operation_participants', 'PASS');
  } else {
    recordTest('Firestore rules: collection operation_participants', 'FAIL');
  }

  // Test 5.2: Storage rules - path operations
  const storageRules = fs.readFileSync('calycompta-app/storage.rules', 'utf8');

  if (storageRules.includes('/operations/{operationId}')) {
    recordTest('Storage rules: path operations', 'PASS');
  } else {
    recordTest('Storage rules: path operations', 'FAIL');
  }

  // Test 5.3: Vérifier rôle validateur
  if (firestoreRules.includes("role == 'validateur'") ||
      firestoreRules.includes('validateur')) {
    recordTest('Firestore rules: rôle validateur', 'PASS');
  } else {
    recordTest('Firestore rules: rôle validateur', 'WARN',
      'Vérifier si le rôle validateur est utilisé');
  }
}

// =============================================================================
// TESTS SECTION 6: Imports et Dépendances
// =============================================================================

function testImports() {
  section('SECTION 6: Validation Imports et Dépendances');

  // Test 6.1: Rechercher imports cassés (EvenementsPage)
  const brokenImports = searchInFiles("from.*evenements/EvenementsPage", ['ts', 'tsx']);
  if (brokenImports.length === 0) {
    recordTest('Aucun import cassé vers EvenementsPage', 'PASS');
  } else {
    recordTest('Aucun import cassé vers EvenementsPage', 'FAIL',
      `Imports cassés dans: ${brokenImports.join(', ')}`);
  }

  // Test 6.2: Vérifier imports OperationsPage
  const operationsImports = searchInFiles("from.*operations/OperationsPage", ['ts', 'tsx']);
  if (operationsImports.length > 0) {
    recordTest('Imports vers OperationsPage trouvés', 'PASS',
      `${operationsImports.length} fichier(s)`);
  } else {
    recordTest('Imports vers OperationsPage trouvés', 'FAIL');
  }

  // Test 6.3: Vérifier package.json (dépendances migration)
  const packageJson = JSON.parse(fs.readFileSync('calycompta-app/package.json', 'utf8'));

  const requiredDeps = ['pptxgenjs', 'xlsx'];
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      recordTest(`Dépendance ${dep} installée`, 'PASS',
        `v${packageJson.dependencies[dep]}`);
    } else {
      recordTest(`Dépendance ${dep} installée`, 'WARN',
        'Package pourrait être nécessaire');
    }
  });
}

// =============================================================================
// TESTS SECTION 7: Vérification Git
// =============================================================================

function testGit() {
  section('SECTION 7: Vérification Git et Déploiement');

  // Test 7.1: Vérifier que tout est commité
  try {
    const status = exec('git status --porcelain', { silent: true });
    if (status.trim().length === 0) {
      recordTest('Aucun fichier non commité', 'PASS');
    } else {
      recordTest('Aucun fichier non commité', 'WARN',
        'Il y a des changements non commités');
    }
  } catch (error) {
    recordTest('Aucun fichier non commité', 'FAIL', 'Erreur git');
  }

  // Test 7.2: Vérifier dernier commit
  try {
    const lastCommit = exec('git log -1 --oneline', { silent: true }).trim();
    if (lastCommit.includes('migration') || lastCommit.includes('opérations')) {
      recordTest('Dernier commit lié à la migration', 'PASS', lastCommit);
    } else {
      recordTest('Dernier commit lié à la migration', 'WARN', lastCommit);
    }
  } catch (error) {
    recordTest('Dernier commit lié à la migration', 'FAIL');
  }

  // Test 7.3: Vérifier branches synchronisées
  try {
    const branch = exec('git branch --show-current', { silent: true }).trim();
    recordTest(`Branche actuelle: ${branch}`, 'PASS');
  } catch (error) {
    recordTest('Vérification branche Git', 'FAIL');
  }
}

// =============================================================================
// GÉNÉRATION DU RAPPORT
// =============================================================================

function generateReport() {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);

  section('RAPPORT FINAL');

  log(`\n  Total de tests: ${stats.total}`, 'bright');
  log(`  ✓ Réussis:      ${stats.passed}`, 'green');
  log(`  ✗ Échoués:      ${stats.failed}`, 'red');
  log(`  ⚠ Avertissements: ${stats.warnings}`, 'yellow');
  log(`  ⏱ Durée:        ${duration}s`, 'cyan');

  const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
  log(`\n  Taux de réussite: ${successRate}%`,
    successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red');

  // Sauvegarder le rapport JSON
  const report = {
    timestamp: new Date().toISOString(),
    duration: parseFloat(duration),
    stats,
    results,
  };

  fs.writeFileSync(
    'RAPPORT_TESTS_AUTO.json',
    JSON.stringify(report, null, 2)
  );

  log('\n  📄 Rapport JSON sauvegardé: RAPPORT_TESTS_AUTO.json', 'cyan');

  // Générer rapport Markdown
  generateMarkdownReport(report, duration, successRate);

  // Verdict final
  log('\n' + '='.repeat(80), 'cyan');
  if (stats.failed === 0) {
    log('  ✅ MIGRATION VALIDÉE - Tous les tests automatiques sont passés!', 'green');
  } else if (stats.failed <= 3) {
    log('  ⚠️  MIGRATION PARTIELLE - Quelques tests ont échoué', 'yellow');
  } else {
    log('  ❌ MIGRATION INCOMPLÈTE - Plusieurs tests ont échoué', 'red');
  }
  log('='.repeat(80) + '\n', 'cyan');

  process.exit(stats.failed > 0 ? 1 : 0);
}

function generateMarkdownReport(report, duration, successRate) {
  let markdown = `# Rapport de Tests Automatisés - Migration Événements → Opérations

**Date**: ${new Date().toLocaleString('fr-FR')}
**Durée**: ${duration}s
**Taux de réussite**: ${successRate}%

## Statistiques

- **Total de tests**: ${stats.total}
- ✓ **Réussis**: ${stats.passed}
- ✗ **Échoués**: ${stats.failed}
- ⚠ **Avertissements**: ${stats.warnings}

## Résultats Détaillés

`;

  // Grouper par status
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const warnings = results.filter(r => r.status === 'WARN');

  if (failed.length > 0) {
    markdown += `### ❌ Tests Échoués (${failed.length})\n\n`;
    failed.forEach(r => {
      markdown += `- **${r.name}**\n`;
      if (r.details) markdown += `  - ${r.details}\n`;
    });
    markdown += '\n';
  }

  if (warnings.length > 0) {
    markdown += `### ⚠️ Avertissements (${warnings.length})\n\n`;
    warnings.forEach(r => {
      markdown += `- **${r.name}**\n`;
      if (r.details) markdown += `  - ${r.details}\n`;
    });
    markdown += '\n';
  }

  markdown += `### ✓ Tests Réussis (${passed.length})\n\n`;
  passed.forEach(r => {
    markdown += `- ${r.name}`;
    if (r.details) markdown += ` (${r.details})`;
    markdown += '\n';
  });

  markdown += `\n## Prochaines Étapes

`;

  if (stats.failed === 0 && stats.warnings === 0) {
    markdown += `✅ **Tous les tests automatiques sont passés!**

Vous pouvez maintenant:
1. Effectuer les tests manuels UI (voir TESTS_MANUELS.md sections 1-4)
2. Vérifier la production: https://calycompta.vercel.app
3. Tester les fonctionnalités critiques dans l'interface
`;
  } else {
    markdown += `⚠️ **Certains tests nécessitent votre attention**

Veuillez:
1. Corriger les tests échoués listés ci-dessus
2. Vérifier les avertissements
3. Re-exécuter ce script: \`node scripts/test-migration.js\`
4. Une fois tous les tests passés, procéder aux tests manuels
`;
  }

  fs.writeFileSync('RAPPORT_TESTS_AUTO.md', markdown);
  log('  📄 Rapport Markdown sauvegardé: RAPPORT_TESTS_AUTO.md', 'cyan');
}

// =============================================================================
// EXÉCUTION PRINCIPALE
// =============================================================================

function main() {
  log('\n🚀 Démarrage des Tests Automatisés - Migration Événements → Opérations\n', 'bright');

  try {
    testTerminology();
    testFileStructure();
    testTypeScript();
    testRouting();
    testFirebaseRules();
    testImports();
    testGit();
    generateReport();
  } catch (error) {
    log('\n❌ Erreur fatale lors de l\'exécution des tests:', 'red');
    console.error(error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  main();
}

module.exports = { main };

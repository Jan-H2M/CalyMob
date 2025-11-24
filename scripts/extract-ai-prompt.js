#!/usr/bin/env node
/**
 * Script pour extraire le dernier prompt AI depuis localStorage
 *
 * Usage:
 * 1. Lancez l'analyse IA dans le navigateur
 * 2. Dans la console: copy(localStorage.getItem("DEBUG_LAST_AI_PROMPT"))
 * 3. Collez le résultat dans un fichier texte
 * 4. Ou utilisez ce script avec Puppeteer pour l'automatiser
 */

const fs = require('fs');
const path = require('path');

// Pour l'instant, ce script lit depuis un fichier temporaire
// que vous devez créer en collant le prompt depuis la console

const promptPath = process.argv[2] || '/tmp/ai_prompt.txt';

if (!fs.existsSync(promptPath)) {
  console.error('❌ Fichier non trouvé:', promptPath);
  console.log('\n📝 Pour extraire le prompt:');
  console.log('1. Ouvrez http://localhost:5173/ dans Chrome');
  console.log('2. Lancez "Analyse IA"');
  console.log('3. Dans la console (F12), tapez: copy(localStorage.getItem("DEBUG_LAST_AI_PROMPT"))');
  console.log('4. Collez dans un fichier: pbpaste > /tmp/ai_prompt.txt (Mac)');
  console.log('5. Relancez ce script');
  process.exit(1);
}

const prompt = fs.readFileSync(promptPath, 'utf-8');
const outputPath = path.join(__dirname, '../../DEBUG_AI_PROMPT_COMPLET.txt');

fs.writeFileSync(outputPath, prompt, 'utf-8');

console.log('✅ Prompt sauvegardé:', outputPath);
console.log('📊 Taille:', prompt.length, 'caractères');
console.log('📋 Lignes:', prompt.split('\n').length);

// Analyser le contenu
const txCount = (prompt.match(/TX-\d+\./g) || []).length;
const insCount = (prompt.match(/INS-\d+\./g) || []).length;

console.log('🔢 Transactions trouvées:', txCount);
console.log('🔢 Inscriptions trouvées:', insCount);

// Extraire les noms
const txNames = [...prompt.matchAll(/Contrepartie: (.+)/g)].map(m => m[1]);
const insNames = [...prompt.matchAll(/Participant: (.+)/g)].map(m => m[1]);

console.log('\n👥 Noms dans inscriptions:', insNames.join(', '));
console.log('\n🔍 Cherchons si ces noms apparaissent dans les transactions:');

insNames.forEach(insName => {
  const found = txNames.find(txName =>
    txName.toLowerCase().includes(insName.split(' ')[0].toLowerCase()) ||
    txName.toLowerCase().includes(insName.split(' ')[1]?.toLowerCase() || '')
  );
  if (found) {
    console.log(`  ✅ ${insName} → TROUVÉ: ${found}`);
  } else {
    console.log(`  ❌ ${insName} → NON TROUVÉ`);
  }
});

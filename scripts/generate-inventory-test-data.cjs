#!/usr/bin/env node

/**
 * Script de Génération de Données de Test - Module Inventaire CalyCompta
 *
 * Crée des données réalistes pour tester le module inventaire:
 * - Configuration (types matériel, checklists, emplacements)
 * - Membres
 * - Matériel unitaire
 * - Produits en stock
 * - Prêts
 * - Ventes
 *
 * Toutes les données sont préfixées avec "TEST-" pour identification facile
 *
 * Usage:
 *   node scripts/generate-inventory-test-data.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Configuration
const TEST_PREFIX = 'TEST-';
const CLUB_ID = 'calypso';
const FISCAL_YEAR_ID = '2025';

// Initialiser Firebase Admin
let serviceAccount;
try {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  serviceAccount = require(serviceAccountPath);
} catch (error) {
  console.error('❌ Erreur: serviceAccountKey.json introuvable!');
  console.error('   Placez votre clé de service Firebase dans serviceAccountKey.json');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ===========================================
// DONNÉES DE TEST RÉALISTES
// ===========================================

const testData = {
  itemTypes: [
    {
      id: `${TEST_PREFIX}detendeur`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Détendeur`,
      description: 'Détendeur de plongée (test)',
      valeur_caution_defaut: 50.00,
      checklistIds: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}gilet`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Gilet`,
      description: 'Gilet stabilisateur (test)',
      valeur_caution_defaut: 40.00,
      checklistIds: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}combinaison`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Combinaison`,
      description: 'Combinaison de plongée (test)',
      valeur_caution_defaut: 30.00,
      checklistIds: [],
      isTestData: true
    }
  ],

  checklists: [
    {
      id: `${TEST_PREFIX}checklist-detendeur`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Checklist Détendeur`,
      description: 'Vérifications détendeur (test)',
      items: [
        { id: 'check-1', texte: 'État général OK', ordre: 1 },
        { id: 'check-2', texte: 'Joints toriques OK', ordre: 2 },
        { id: 'check-3', texte: 'Purge 1er étage fonctionnelle', ordre: 3 },
        { id: 'check-4', texte: 'Manomètre lisible', ordre: 4 }
      ],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}checklist-gilet`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Checklist Gilet`,
      description: 'Vérifications gilet (test)',
      items: [
        { id: 'check-1', texte: 'Tissu en bon état', ordre: 1 },
        { id: 'check-2', texte: 'Inflateur fonctionnel', ordre: 2 },
        { id: 'check-3', texte: 'Purge rapide OK', ordre: 3 }
      ],
      isTestData: true
    }
  ],

  members: [
    {
      id: `${TEST_PREFIX}member-1`,
      nom: 'Dupont',
      prenom: TEST_PREFIX + 'Jean',
      email: 'test-jean@calypso-test.be',
      telephone: '+32 470 12 34 56',
      niveau_plongee: 'P2',
      statut: 'actif',
      licence_lifras: 'TEST-LIF-12345',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}member-2`,
      nom: 'Martin',
      prenom: TEST_PREFIX + 'Marie',
      email: 'test-marie@calypso-test.be',
      telephone: '+32 471 23 45 67',
      niveau_plongee: 'P3',
      statut: 'actif',
      licence_lifras: 'TEST-LIF-23456',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}member-3`,
      nom: 'Bernard',
      prenom: TEST_PREFIX + 'Luc',
      email: 'test-luc@calypso-test.be',
      telephone: '+32 472 34 56 78',
      niveau_plongee: 'P1',
      statut: 'actif',
      licence_lifras: 'TEST-LIF-34567',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}member-4`,
      nom: 'Leroy',
      prenom: TEST_PREFIX + 'Sophie',
      email: 'test-sophie@calypso-test.be',
      telephone: '+32 473 45 67 89',
      niveau_plongee: 'Moniteur',
      statut: 'actif',
      licence_lifras: 'TEST-LIF-45678',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}member-5`,
      nom: 'Dubois',
      prenom: TEST_PREFIX + 'Thomas',
      email: 'test-thomas@calypso-test.be',
      telephone: '+32 474 56 78 90',
      niveau_plongee: 'P2',
      statut: 'inactif',
      licence_lifras: 'TEST-LIF-56789',
      isTestData: true
    }
  ],

  items: [
    // Détendeurs
    {
      id: `${TEST_PREFIX}item-reg-001`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}detendeur`,
      nom: `${TEST_PREFIX}Détendeur Scubapro MK25`,
      numero_serie: `${TEST_PREFIX}REG-001`,
      date_achat: Timestamp.fromDate(new Date('2023-01-15')),
      prix_achat: 450.00,
      statut: 'disponible',
      localisation: `${TEST_PREFIX}Salle matériel`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-reg-002`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}detendeur`,
      nom: `${TEST_PREFIX}Détendeur Apeks XTX50`,
      numero_serie: `${TEST_PREFIX}REG-002`,
      date_achat: Timestamp.fromDate(new Date('2023-03-20')),
      prix_achat: 420.00,
      statut: 'prete',
      localisation: `${TEST_PREFIX}Prêté`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-reg-003`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}detendeur`,
      nom: `${TEST_PREFIX}Détendeur Aqualung Legend`,
      numero_serie: `${TEST_PREFIX}REG-003`,
      date_achat: Timestamp.fromDate(new Date('2022-11-10')),
      prix_achat: 380.00,
      statut: 'en_maintenance',
      localisation: `${TEST_PREFIX}Atelier`,
      photos: [],
      historique_maintenance: [
        {
          date: Timestamp.fromDate(new Date('2024-12-15')),
          type: 'revision',
          description: 'Révision annuelle',
          cout: 75.00
        }
      ],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-reg-004`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}detendeur`,
      nom: `${TEST_PREFIX}Détendeur Mares Prestige`,
      numero_serie: `${TEST_PREFIX}REG-004`,
      date_achat: Timestamp.fromDate(new Date('2023-06-05')),
      prix_achat: 360.00,
      statut: 'prete',
      localisation: `${TEST_PREFIX}Prêté`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },

    // Gilets
    {
      id: `${TEST_PREFIX}item-bc-001`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}gilet`,
      nom: `${TEST_PREFIX}Gilet Aqualung Axiom`,
      numero_serie: `${TEST_PREFIX}BC-001`,
      date_achat: Timestamp.fromDate(new Date('2023-02-10')),
      prix_achat: 380.00,
      statut: 'prete',
      localisation: `${TEST_PREFIX}Prêté`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-bc-002`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}gilet`,
      nom: `${TEST_PREFIX}Gilet Scubapro Hydros Pro`,
      numero_serie: `${TEST_PREFIX}BC-002`,
      date_achat: Timestamp.fromDate(new Date('2023-04-15')),
      prix_achat: 420.00,
      statut: 'disponible',
      localisation: `${TEST_PREFIX}Salle matériel`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-bc-003`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}gilet`,
      nom: `${TEST_PREFIX}Gilet Mares Pure`,
      numero_serie: `${TEST_PREFIX}BC-003`,
      date_achat: Timestamp.fromDate(new Date('2022-09-20')),
      prix_achat: 350.00,
      statut: 'prete',
      localisation: `${TEST_PREFIX}Prêté`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },

    // Combinaisons
    {
      id: `${TEST_PREFIX}item-ws-001`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}combinaison`,
      nom: `${TEST_PREFIX}Combinaison 7mm Taille L`,
      numero_serie: `${TEST_PREFIX}WS-001`,
      date_achat: Timestamp.fromDate(new Date('2023-01-20')),
      prix_achat: 280.00,
      statut: 'disponible',
      localisation: `${TEST_PREFIX}Salle matériel`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-ws-002`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}combinaison`,
      nom: `${TEST_PREFIX}Combinaison 5mm Taille M`,
      numero_serie: `${TEST_PREFIX}WS-002`,
      date_achat: Timestamp.fromDate(new Date('2023-03-10')),
      prix_achat: 250.00,
      statut: 'prete',
      localisation: `${TEST_PREFIX}Prêté`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}item-ws-003`,
      clubId: CLUB_ID,
      typeId: `${TEST_PREFIX}combinaison`,
      nom: `${TEST_PREFIX}Combinaison 7mm Taille XL`,
      numero_serie: `${TEST_PREFIX}WS-003`,
      date_achat: Timestamp.fromDate(new Date('2022-12-15')),
      prix_achat: 290.00,
      statut: 'disponible',
      localisation: `${TEST_PREFIX}Salle matériel`,
      photos: [],
      historique_maintenance: [],
      isTestData: true
    }
  ],

  products: [
    {
      id: `${TEST_PREFIX}product-1`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}T-shirt Calypso`,
      description: 'T-shirt bleu avec logo (test)',
      prix_achat: 8.00,
      prix_vente: 15.00,
      quantite_stock: 45,
      seuil_alerte: 10,
      categorie: 'Vêtements',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}product-2`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Gourde isotherme`,
      description: 'Gourde 500ml (test)',
      prix_achat: 12.00,
      prix_vente: 20.00,
      quantite_stock: 3,  // ALERTE!
      seuil_alerte: 10,
      categorie: 'Accessoires',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}product-3`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Casquette`,
      description: 'Casquette noire avec logo (test)',
      prix_achat: 6.00,
      prix_vente: 12.00,
      quantite_stock: 20,
      seuil_alerte: 5,
      categorie: 'Vêtements',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}product-4`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Autocollant`,
      description: 'Autocollant logo Calypso (test)',
      prix_achat: 0.50,
      prix_vente: 2.00,
      quantite_stock: 100,
      seuil_alerte: 20,
      categorie: 'Accessoires',
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}product-5`,
      clubId: CLUB_ID,
      nom: `${TEST_PREFIX}Carnet de plongée`,
      description: 'Carnet de plongée Lifras (test)',
      prix_achat: 3.00,
      prix_vente: 8.00,
      quantite_stock: 8,  // ALERTE!
      seuil_alerte: 10,
      categorie: 'Documents',
      isTestData: true
    }
  ]
};

// ===========================================
// FONCTIONS DE CRÉATION
// ===========================================

async function createSettings() {
  console.log('\n📋 Configuration (Settings)...');

  const batch = db.batch();
  const now = Timestamp.now();

  // 1. Types de matériel
  console.log('   Création types de matériel...');
  for (const itemType of testData.itemTypes) {
    const ref = db.collection('clubs').doc(CLUB_ID).collection('item_types').doc(itemType.id);
    batch.set(ref, {
      ...itemType,
      createdAt: now,
      updatedAt: now
    });
  }

  // 2. Checklists
  console.log('   Création checklists...');
  for (const checklist of testData.checklists) {
    const ref = db.collection('clubs').doc(CLUB_ID).collection('checklists').doc(checklist.id);
    batch.set(ref, {
      ...checklist,
      createdAt: now,
      updatedAt: now
    });
  }

  await batch.commit();

  console.log(`   ✅ ${testData.itemTypes.length} types de matériel créés`);
  console.log(`   ✅ ${testData.checklists.length} checklists créées`);
}

async function createMembers() {
  console.log('\n👥 Membres...');

  const batch = db.batch();
  const now = Timestamp.now();

  for (const member of testData.members) {
    const ref = db.collection('clubs').doc(CLUB_ID).collection('members').doc(member.id);
    batch.set(ref, {
      ...member,
      createdAt: now,
      updatedAt: now
    });
  }

  await batch.commit();

  console.log(`   ✅ ${testData.members.length} membres créés`);
}

async function createItems() {
  console.log('\n📦 Matériel unitaire...');

  const batch = db.batch();
  const now = Timestamp.now();

  for (const item of testData.items) {
    const ref = db.collection('clubs').doc(CLUB_ID).collection('inventory_items').doc(item.id);
    batch.set(ref, {
      ...item,
      createdAt: now,
      updatedAt: now,
      createdBy: 'test-script'
    });
  }

  await batch.commit();

  console.log(`   ✅ ${testData.items.length} items créés`);
  console.log(`      - ${testData.items.filter(i => i.statut === 'disponible').length} disponibles`);
  console.log(`      - ${testData.items.filter(i => i.statut === 'prete').length} prêtés`);
  console.log(`      - ${testData.items.filter(i => i.statut === 'en_maintenance').length} en maintenance`);
}

async function createProducts() {
  console.log('\n🛒 Produits en stock...');

  const batch = db.batch();
  const now = Timestamp.now();

  for (const product of testData.products) {
    const ref = db.collection('clubs').doc(CLUB_ID).collection('stock_products').doc(product.id);
    batch.set(ref, {
      ...product,
      createdAt: now,
      updatedAt: now
    });
  }

  await batch.commit();

  const alertCount = testData.products.filter(p => p.quantite_stock < p.seuil_alerte).length;

  console.log(`   ✅ ${testData.products.length} produits créés`);
  console.log(`      - ${alertCount} produits en alerte stock faible ⚠️`);
}

async function createLoans() {
  console.log('\n🤝 Prêts...');

  const now = Timestamp.now();
  const batch = db.batch();

  // Prêt 1: En cours (retour prévu dans 5 jours)
  const loan1Id = `${TEST_PREFIX}loan-1`;
  const loan1 = {
    id: loan1Id,
    clubId: CLUB_ID,
    memberId: `${TEST_PREFIX}member-1`,
    itemIds: [`${TEST_PREFIX}item-reg-002`, `${TEST_PREFIX}item-reg-004`, `${TEST_PREFIX}item-bc-001`],
    date_pret: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), // Il y a 10 jours
    date_retour_prevue: Timestamp.fromDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)), // Dans 5 jours
    statut: 'en_cours',
    montant_caution: 130.00, // 50 + 50 + 40
    caution_payee: true,
    checklist_snapshot: [],
    isTestData: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'test-script'
  };

  // Prêt 2: En retard (retour prévu il y a 3 jours)
  const loan2Id = `${TEST_PREFIX}loan-2`;
  const loan2 = {
    id: loan2Id,
    clubId: CLUB_ID,
    memberId: `${TEST_PREFIX}member-2`,
    itemIds: [`${TEST_PREFIX}item-ws-002`, `${TEST_PREFIX}item-bc-003`],
    date_pret: Timestamp.fromDate(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)), // Il y a 20 jours
    date_retour_prevue: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), // Il y a 3 jours (EN RETARD!)
    statut: 'en_retard',
    montant_caution: 70.00, // 30 + 40
    caution_payee: true,
    checklist_snapshot: [],
    isTestData: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'test-script'
  };

  // Prêt 3: Terminé (retourné il y a 10 jours)
  const loan3Id = `${TEST_PREFIX}loan-3`;
  const loan3 = {
    id: loan3Id,
    clubId: CLUB_ID,
    memberId: `${TEST_PREFIX}member-3`,
    itemIds: [`${TEST_PREFIX}item-bc-002`],
    date_pret: Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // Il y a 30 jours
    date_retour_prevue: Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), // Il y a 15 jours
    date_retour_effective: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), // Il y a 10 jours
    statut: 'retourne',
    montant_caution: 40.00,
    caution_payee: true,
    caution_retournee: 40.00,
    checklist_snapshot: [],
    isTestData: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'test-script'
  };

  batch.set(db.collection('clubs').doc(CLUB_ID).collection('loans').doc(loan1Id), loan1);
  batch.set(db.collection('clubs').doc(CLUB_ID).collection('loans').doc(loan2Id), loan2);
  batch.set(db.collection('clubs').doc(CLUB_ID).collection('loans').doc(loan3Id), loan3);

  await batch.commit();

  console.log('   ✅ 3 prêts créés');
  console.log('      - 1 en cours');
  console.log('      - 1 en retard ⚠️');
  console.log('      - 1 terminé');
}

async function createSales() {
  console.log('\n💰 Ventes...');

  const now = Timestamp.now();
  const batch = db.batch();

  // 5 ventes historiques
  const sales = [
    {
      id: `${TEST_PREFIX}sale-1`,
      clubId: CLUB_ID,
      productId: `${TEST_PREFIX}product-1`,
      memberId: `${TEST_PREFIX}member-1`,
      quantite: 2,
      prix_unitaire: 15.00,
      montant_total: 30.00,
      date_vente: Timestamp.fromDate(new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)),
      fiscal_year_id: FISCAL_YEAR_ID,
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}sale-2`,
      clubId: CLUB_ID,
      productId: `${TEST_PREFIX}product-2`,
      memberId: `${TEST_PREFIX}member-2`,
      quantite: 1,
      prix_unitaire: 20.00,
      montant_total: 20.00,
      date_vente: Timestamp.fromDate(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)),
      fiscal_year_id: FISCAL_YEAR_ID,
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}sale-3`,
      clubId: CLUB_ID,
      productId: `${TEST_PREFIX}product-3`,
      memberId: `${TEST_PREFIX}member-3`,
      quantite: 1,
      prix_unitaire: 12.00,
      montant_total: 12.00,
      date_vente: Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)),
      fiscal_year_id: FISCAL_YEAR_ID,
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}sale-4`,
      clubId: CLUB_ID,
      productId: `${TEST_PREFIX}product-4`,
      memberId: `${TEST_PREFIX}member-4`,
      quantite: 5,
      prix_unitaire: 2.00,
      montant_total: 10.00,
      date_vente: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)),
      fiscal_year_id: FISCAL_YEAR_ID,
      isTestData: true
    },
    {
      id: `${TEST_PREFIX}sale-5`,
      clubId: CLUB_ID,
      productId: `${TEST_PREFIX}product-5`,
      memberId: `${TEST_PREFIX}member-1`,
      quantite: 2,
      prix_unitaire: 8.00,
      montant_total: 16.00,
      date_vente: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)),
      fiscal_year_id: FISCAL_YEAR_ID,
      isTestData: true
    }
  ];

  for (const sale of sales) {
    const ref = db.collection('clubs').doc(CLUB_ID).collection('sales').doc(sale.id);
    batch.set(ref, {
      ...sale,
      createdAt: now,
      createdBy: 'test-script'
    });
  }

  await batch.commit();

  const totalRevenue = sales.reduce((sum, s) => sum + s.montant_total, 0);

  console.log(`   ✅ ${sales.length} ventes créées`);
  console.log(`      - Revenu total: ${totalRevenue.toFixed(2)} €`);
}

// ===========================================
// FONCTION PRINCIPALE
// ===========================================

async function generateTestData() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🚀 GÉNÉRATION DONNÉES DE TEST - MODULE INVENTAIRE     ║');
  console.log('║     CalyCompta - Calypso Diving Club                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📍 Club: ${CLUB_ID}`);
  console.log(`🏷️  Prefix: ${TEST_PREFIX}`);
  console.log(`📅 Année fiscale: ${FISCAL_YEAR_ID}`);
  console.log('');

  try {
    // Vérifier que le club existe
    const clubRef = db.collection('clubs').doc(CLUB_ID);
    const clubSnap = await clubRef.get();

    if (!clubSnap.exists) {
      console.error(`❌ Erreur: Le club "${CLUB_ID}" n'existe pas dans Firestore!`);
      console.error('   Créez d\'abord le club dans Firebase Console.');
      process.exit(1);
    }

    // Générer toutes les données
    await createSettings();
    await createMembers();
    await createItems();
    await createProducts();
    await createLoans();
    await createSales();

    // Résumé final
    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  ✅ TERMINÉ! Données de test générées avec succès.    ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📊 RÉSUMÉ:');
    console.log(`   - Types de matériel: ${testData.itemTypes.length}`);
    console.log(`   - Checklists: ${testData.checklists.length}`);
    console.log(`   - Membres: ${testData.members.length}`);
    console.log(`   - Matériel unitaire: ${testData.items.length}`);
    console.log(`   - Produits en stock: ${testData.products.length}`);
    console.log(`   - Prêts: 3`);
    console.log(`   - Ventes: 5`);
    console.log('');
    console.log(`   TOTAL: ${testData.itemTypes.length + testData.checklists.length + testData.members.length + testData.items.length + testData.products.length + 3 + 5} documents créés`);
    console.log('');
    console.log('🔍 Pour consulter les données:');
    console.log('   - Ouvrez CalyCompta → Inventaire');
    console.log('   - Cherchez les éléments avec prefix "TEST-"');
    console.log('');
    console.log('🗑️  Pour nettoyer les données:');
    console.log('   node scripts/cleanup-inventory-test-data.js');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ ERREUR lors de la génération des données:');
    console.error(error);
    console.error('');
    console.error('💡 Vérifiez:');
    console.error('   - Votre serviceAccountKey.json est valide');
    console.error('   - Vous avez les permissions Firebase Admin');
    console.error('   - Les règles Firestore autorisent l\'écriture');
    console.error('');
    process.exit(1);
  }
}

// Lancer le script
generateTestData();

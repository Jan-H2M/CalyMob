#!/usr/bin/env node
/**
 * Upload documents from Downloads/Piscine to Firebase Storage
 * and link them to the corresponding session themes in Firestore.
 *
 * Run from: CalyMob/scripts/  →  node upload_theme_documents.cjs
 */
const path = require('path');
const fs = require('fs');

const functionsPath = path.join(__dirname, '../functions');
const admin = require(path.join(functionsPath, 'node_modules/firebase-admin'));

// Initialize Firebase Admin
const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '../functions/service-account-key.json')
].filter(Boolean);

let initialized = false;
for (const saPath of possibleServiceAccountPaths) {
  try {
    const serviceAccount = require(saPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'calycompta.firebasestorage.app',
    });
    initialized = true;
    console.log(`✅ Firebase initialized with: ${path.basename(saPath)}`);
    break;
  } catch (e) { /* try next */ }
}
if (!initialized) {
  console.error('❌ Could not initialize Firebase.');
  process.exit(1);
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
const CLUB_ID = 'calypso';
const COLLECTION = `clubs/${CLUB_ID}/session_themes`;
const DOCS_DIR = '/Users/jan/Downloads/Piscine';

// Mapping: filename → theme title(s) to attach to
const FILE_THEME_MAP = [
  {
    file: '2025-03-17 -- Givrage en plongée.docx',
    themeTitle: "Gestion d'un givrage",
  },
  {
    file: '2025-03-17 -- Le Triangle de Sécurité.docx',
    themeTitle: "Travail en équipe – simulation de problèmes",
  },
  {
    file: '2025-03-17 -- Le rôle du serre-fil.docx',
    themeTitle: 'Rôle du serre-file (simulation)',
  },
  {
    file: '2025-04-08 -- Combinée.docx',
    themeTitle: 'Répétition examen combiné',
  },
  {
    file: '2025-05-27 -- Apnée.docx',
    themeTitle: 'Apnée – Économie d\'air et ventilation',
  },
  {
    file: '2025-11-03 -- Gestion du givrage Fiche fil rouge.docx',
    themeTitle: "Gestion d'un givrage",
  },
  {
    file: '2025-11-17 -- Signes à la lampe & Plongée de nuit.docx',
    themeTitle: "Signes et mise en œuvre d'une lampe",
  },
];

async function uploadDocuments() {
  console.log('\n📎 Uploading documents to themes...\n');

  // Load all themes
  const snapshot = await db.collection(COLLECTION).get();
  const themesByTitle = {};
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    themesByTitle[data.title] = { id: doc.id, data };
  });

  for (const mapping of FILE_THEME_MAP) {
    const filePath = path.join(DOCS_DIR, mapping.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ File not found: ${mapping.file}`);
      continue;
    }

    // Find theme
    const theme = themesByTitle[mapping.themeTitle];
    if (!theme) {
      console.log(`  ❌ Theme not found: "${mapping.themeTitle}"`);
      continue;
    }

    // Check if document already attached
    const existingDocs = theme.data.documents || [];
    if (existingDocs.some(d => d.name === mapping.file)) {
      console.log(`  ⏭️  Already attached: ${mapping.file}`);
      continue;
    }

    // Upload to Firebase Storage
    const storagePath = `clubs/calypso/session_themes/${Date.now()}_${mapping.file.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    console.log(`  ⬆️  Uploading: ${mapping.file} → ${mapping.themeTitle}`);

    try {
      await bucket.upload(filePath, {
        destination: storagePath,
        metadata: {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          metadata: {
            originalName: mapping.file,
            themeId: theme.id,
          },
        },
      });

      // Get download URL
      const file = bucket.file(storagePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '2030-01-01',
      });

      // Update Firestore
      const newDoc = {
        name: mapping.file,
        url: signedUrl,
        type: 'docx',
        uploadedBy: 'script',
        uploadedByName: 'Jan Andriessens',
        uploadedAt: admin.firestore.Timestamp.now(),
      };

      const themeRef = db.collection(COLLECTION).doc(theme.id);
      await themeRef.update({
        documents: admin.firestore.FieldValue.arrayUnion(newDoc),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      console.log(`  ✅ Attached to "${mapping.themeTitle}"`);
    } catch (err) {
      console.error(`  ❌ Error uploading ${mapping.file}:`, err.message);
    }
  }

  console.log('\n🎉 Done!');
  process.exit(0);
}

uploadDocuments().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

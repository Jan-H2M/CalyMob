/**
 * Script to create/update the "Codes comptables" email template in Firestore
 * Run with: node scripts/create-accounting-codes-template.cjs
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
require('dotenv').config();

// Initialize Firebase Admin
try {
  initializeApp({
    credential: cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  if (error.code !== 'app/duplicate-app') {
    console.error('❌ Error initializing Firebase:', error);
    process.exit(1);
  }
}

const db = getFirestore();
const clubId = 'calypso';

// Template definition
const template = {
  name: 'Codes comptables',
  description: 'Email automatique envoyé lorsque de nouvelles transactions reçoivent des codes comptables',
  emailType: 'accounting_codes',

  subject: 'Nouvelles transactions avec codes comptables ({{totalTransactions}} transaction(s))',

  htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <!-- Logo Calypso -->
  <div style="text-align: center; margin: 20px 0;">
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 300px; height: auto;" />
  </div>

  <h2 style="color: #1e40af;">Nouvelles transactions avec codes comptables</h2>
  <p>Bonjour,</p>
  <p>Il y a <strong>{{totalTransactions}} nouvelle(s) transaction(s)</strong> avec des codes comptables assignés.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Date</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">N° Séquence</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Contrepartie</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Code</th>
        <th style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">Montant</th>
      </tr>
    </thead>
    <tbody>
      {{#each transactions}}
      <tr>
        <td style="padding: 10px; border: 1px solid #e5e7eb;">{{this.date}}</td>
        <td style="padding: 10px; border: 1px solid #e5e7eb;">{{this.numero_sequence}}</td>
        <td style="padding: 10px; border: 1px solid #e5e7eb;">{{this.contrepartie}}</td>
        <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>{{this.code_comptable}}</strong></td>
        <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; font-weight: 600;">{{this.montant}} €</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <p style="margin-top: 20px;">
    <a href="{{appUrl}}/transactions" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
      Voir toutes les transactions
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

  <div style="text-align: center; color: #6b7280; font-size: 12px;">
    <p style="margin: 10px 0;">Email automatique envoyé par CalyCompta</p>
    <img src="{{appUrl}}/logo-vertical.png" alt="{{clubName}}" style="max-width: 80px; height: auto; opacity: 0.6; margin: 10px 0;" />
    <p style="margin: 5px 0;">{{clubName}}</p>
  </div>
</div>`,

  variables: [
    {
      name: 'clubName',
      type: 'string',
      required: true,
      description: 'Nom du club',
      example: 'Calypso Diving Club',
    },
    {
      name: 'date',
      type: 'string',
      required: false,
      description: 'Date du rapport',
      example: '22/11/2025',
    },
    {
      name: 'totalTransactions',
      type: 'number',
      required: true,
      description: 'Nombre total de transactions',
      example: '5',
    },
    {
      name: 'logoUrl',
      type: 'string',
      required: false,
      description: 'URL du logo du club',
      example: 'https://caly-compta.vercel.app/logo-horizontal.jpg',
    },
    {
      name: 'appUrl',
      type: 'string',
      required: true,
      description: "URL de l'application",
      example: 'https://caly-compta.vercel.app',
    },
    {
      name: 'transactions',
      type: 'array',
      required: true,
      description: 'Liste des transactions avec codes comptables',
      example: JSON.stringify([
        {
          date: '22/11/2025',
          numero_sequence: '2025-00957',
          contrepartie: 'M STEPHAAN SWINNEN',
          code_comptable: '618-00-732',
          montant: '4.00',
        },
      ], null, 2),
    },
  ],

  styles: {
    primaryColor: '#1e40af',
    secondaryColor: '#3B82F6',
    headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    buttonColor: '#1e40af',
    buttonTextColor: '#FFFFFF',
    fontFamily: 'Arial, sans-serif',
  },

  isActive: true,
  isDefault: true,
  usageCount: 0,
};

async function createOrUpdateTemplate() {
  try {
    console.log('\n🔍 Checking for existing template...');

    // Check if template already exists
    const existingTemplates = await db
      .collection('clubs')
      .doc(clubId)
      .collection('email_templates')
      .where('emailType', '==', 'accounting_codes')
      .get();

    if (!existingTemplates.empty) {
      console.log(`⚠️  Found ${existingTemplates.size} existing template(s) for accounting_codes`);

      // Update the first one
      const docToUpdate = existingTemplates.docs[0];
      console.log(`📝 Updating existing template: ${docToUpdate.id}`);

      await db
        .collection('clubs')
        .doc(clubId)
        .collection('email_templates')
        .doc(docToUpdate.id)
        .update({
          ...template,
          updatedAt: Timestamp.now(),
          updatedBy: 'system',
        });

      console.log(`✅ Template updated successfully: ${docToUpdate.id}`);
      console.log(`   Name: ${template.name}`);
      console.log(`   Type: ${template.emailType}`);
      return;
    }

    // Create new template
    console.log('📝 Creating new template...');

    const docRef = await db
      .collection('clubs')
      .doc(clubId)
      .collection('email_templates')
      .add({
        ...template,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: 'system',
      });

    console.log(`✅ Template created successfully: ${docRef.id}`);
    console.log(`   Name: ${template.name}`);
    console.log(`   Type: ${template.emailType}`);

  } catch (error) {
    console.error('❌ Error creating/updating template:', error);
    process.exit(1);
  }
}

// Run the script
createOrUpdateTemplate()
  .then(() => {
    console.log('\n✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

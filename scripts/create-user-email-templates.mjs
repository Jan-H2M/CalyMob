/**
 * Script to create default email templates for user management
 * (Account Activated and Password Reset)
 *
 * Usage: node scripts/create-user-email-templates.mjs [userId]
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CLUB_ID = process.env.VITE_CLUB_ID || 'calypso';
const USER_ID = process.argv[2] || 'system'; // Get from command line or use 'system'

// Template HTML content
const DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">

  <!-- Header with logo -->
  <div style="background: {{headerGradient}}; color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">🎉 Bienvenue !</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Votre compte a été activé</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Votre compte pour <strong>{{clubName}}</strong> a été activé avec succès ! Vous pouvez maintenant accéder à l'application CalyCompta.
    </p>

    <!-- Credentials Box -->
    <div style="background: #EFF6FF; border-left: 4px solid {{primaryColor}}; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1E40AF;">
        📧 Vos identifiants de connexion
      </p>
      <p style="margin: 0 0 10px 0; font-size: 14px;">
        <strong>Email :</strong> {{email}}
      </p>
      <p style="margin: 0; font-size: 14px;">
        <strong>Mot de passe temporaire :</strong> <code style="background: #DBEAFE; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; color: #1E40AF;">{{temporaryPassword}}</code>
      </p>
    </div>

    <!-- Instructions -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: 600; color: #92400E;">
        ⚠️ Important - Première connexion
      </p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #78350F;">
        <li style="margin-bottom: 8px;">Connectez-vous avec le mot de passe temporaire ci-dessus</li>
        <li style="margin-bottom: 8px;">Vous serez invité à créer un <strong>nouveau mot de passe</strong> sécurisé</li>
        <li style="margin-bottom: 8px;">Choisissez un mot de passe fort (minimum 8 caractères)</li>
        <li>Conservez vos identifiants en lieu sûr</li>
      </ol>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 35px 0;">
      <a href="{{appUrl}}" style="display: inline-block; background: {{buttonColor}}; color: {{buttonTextColor}}; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        🔐 Accéder à l'application
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Si vous rencontrez des difficultés pour vous connecter, n'hésitez pas à contacter l'administrateur de votre club.
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

const DEFAULT_PASSWORD_RESET_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">

  <!-- Header with logo -->
  <div style="background: {{headerGradient}}; color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">🔑 Réinitialisation de mot de passe</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Votre mot de passe a été réinitialisé</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Votre mot de passe pour <strong>{{clubName}}</strong> a été réinitialisé par un administrateur. Vous pouvez maintenant vous reconnecter avec le nouveau mot de passe temporaire.
    </p>

    <!-- Credentials Box -->
    <div style="background: #EFF6FF; border-left: 4px solid {{primaryColor}}; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1E40AF;">
        📧 Vos nouveaux identifiants
      </p>
      <p style="margin: 0 0 10px 0; font-size: 14px;">
        <strong>Email :</strong> {{email}}
      </p>
      <p style="margin: 0; font-size: 14px;">
        <strong>Nouveau mot de passe temporaire :</strong> <code style="background: #DBEAFE; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; color: #1E40AF;">{{temporaryPassword}}</code>
      </p>
    </div>

    <!-- Security Notice -->
    <div style="background: #FEE2E2; border-left: 4px solid #EF4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #991B1B;">
        🔒 Sécurité de votre compte
      </p>
      <p style="margin: 0; font-size: 14px; color: #7F1D1D; line-height: 1.5;">
        Pour des raisons de sécurité, nous vous recommandons de changer ce mot de passe temporaire dès votre première connexion. Choisissez un mot de passe fort et unique.
      </p>
    </div>

    <!-- Instructions -->
    <div style="background: #F0FDF4; border-left: 4px solid #10B981; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: 600; color: #065F46;">
        ℹ️ Comment vous reconnecter
      </p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #047857;">
        <li style="margin-bottom: 8px;">Cliquez sur le bouton ci-dessous pour accéder à l'application</li>
        <li style="margin-bottom: 8px;">Connectez-vous avec votre email et le mot de passe temporaire</li>
        <li style="margin-bottom: 8px;">Changez votre mot de passe dans <strong>Paramètres → Profil</strong></li>
        <li>Si vous n'avez pas demandé cette réinitialisation, contactez immédiatement un administrateur</li>
      </ol>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 35px 0;">
      <a href="{{appUrl}}" style="display: inline-block; background: {{buttonColor}}; color: {{buttonTextColor}}; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        🔐 Se connecter maintenant
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Si vous rencontrez des difficultés pour vous connecter ou si vous pensez que ce message est une erreur, contactez l'administrateur de votre club.
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

const templates = [
  {
    name: 'Compte Activé',
    description: 'Email envoyé automatiquement lorsqu\'un compte utilisateur est activé',
    emailType: 'account_activated',
    subject: '🎉 Votre compte {{clubName}} a été activé',
    htmlContent: DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE,
    variables: [
      { name: 'recipientName', type: 'string', required: true, description: 'Nom complet du destinataire', example: 'Jean Dupont' },
      { name: 'firstName', type: 'string', required: false, description: 'Prénom du destinataire', example: 'Jean' },
      { name: 'lastName', type: 'string', required: false, description: 'Nom de famille du destinataire', example: 'Dupont' },
      { name: 'email', type: 'string', required: true, description: 'Email du destinataire', example: 'jean.dupont@example.com' },
      { name: 'temporaryPassword', type: 'string', required: true, description: 'Mot de passe temporaire', example: 'CalyCompta2025-01' },
      { name: 'clubName', type: 'string', required: true, description: 'Nom du club', example: 'Calypso Diving Club' },
      { name: 'appUrl', type: 'string', required: true, description: 'URL de l\'application', example: 'https://calycompta.vercel.app' }
    ],
    styles: {
      primaryColor: '#3B82F6',
      secondaryColor: '#1E40AF',
      headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      buttonColor: '#3B82F6',
      buttonTextColor: '#FFFFFF',
      fontFamily: 'Arial, sans-serif'
    },
    isActive: true,
    isDefault: true,
    usageCount: 0
  },
  {
    name: 'Mot de Passe Réinitialisé',
    description: 'Email envoyé lorsqu\'un mot de passe utilisateur est réinitialisé',
    emailType: 'password_reset',
    subject: '🔑 Votre mot de passe {{clubName}} a été réinitialisé',
    htmlContent: DEFAULT_PASSWORD_RESET_TEMPLATE,
    variables: [
      { name: 'recipientName', type: 'string', required: true, description: 'Nom complet du destinataire', example: 'Jean Dupont' },
      { name: 'firstName', type: 'string', required: false, description: 'Prénom du destinataire', example: 'Jean' },
      { name: 'lastName', type: 'string', required: false, description: 'Nom de famille du destinataire', example: 'Dupont' },
      { name: 'email', type: 'string', required: true, description: 'Email du destinataire', example: 'jean.dupont@example.com' },
      { name: 'temporaryPassword', type: 'string', required: true, description: 'Nouveau mot de passe temporaire', example: 'CalyCompta2025-01' },
      { name: 'clubName', type: 'string', required: true, description: 'Nom du club', example: 'Calypso Diving Club' },
      { name: 'appUrl', type: 'string', required: true, description: 'URL de l\'application', example: 'https://calycompta.vercel.app' }
    ],
    styles: {
      primaryColor: '#3B82F6',
      secondaryColor: '#1E40AF',
      headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      buttonColor: '#3B82F6',
      buttonTextColor: '#FFFFFF',
      fontFamily: 'Arial, sans-serif'
    },
    isActive: true,
    isDefault: true,
    usageCount: 0
  }
];

async function createTemplates() {
  console.log('🚀 Creating user email templates...');
  console.log(`Club ID: ${CLUB_ID}`);
  console.log(`User ID: ${USER_ID}\n`);

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('❌ Firebase configuration is missing. Please check your .env file.');
    process.exit(1);
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const template of templates) {
    try {
      // Check if template already exists
      const templatesRef = collection(db, 'clubs', CLUB_ID, 'email_templates');
      const q = query(templatesRef, where('emailType', '==', template.emailType));
      const existing = await getDocs(q);

      if (!existing.empty) {
        console.log(`⚠️  Template "${template.name}" (${template.emailType}) already exists, skipping...`);
        skippedCount++;
        continue;
      }

      // Create template
      const templateData = {
        ...template,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID
      };

      const docRef = await addDoc(templatesRef, templateData);
      console.log(`✅ Created template "${template.name}" (${template.emailType}) with ID: ${docRef.id}`);
      createdCount++;
    } catch (error) {
      console.error(`❌ Error creating template "${template.name}":`, error);
    }
  }

  console.log('\n✨ Done!');
  console.log(`📊 Summary: ${createdCount} created, ${skippedCount} skipped`);
}

// Run the script
createTemplates()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

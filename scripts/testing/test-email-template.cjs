#!/usr/bin/env node

/**
 * Test Email Template Script
 *
 * Tests email templates locally by rendering them with sample data
 * and optionally sending test emails via MailerSend
 *
 * Usage:
 *   node scripts/test-email-template.cjs <templateId> [--send <email>]
 *
 * Examples:
 *   node scripts/test-email-template.cjs abc123
 *   node scripts/test-email-template.cjs abc123 --send test@example.com
 */

const admin = require('firebase-admin');
const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Sample data for different email types
const SAMPLE_DATA = {
  pending_demands: {
    recipientName: 'Jean Dupont',
    clubName: 'Calypso Diving Club',
    totalAmount: 245.50,
    urgentCount: 1,
    demandesCount: 3,
    appUrl: 'https://calycompta.vercel.app',
    demandes: [
      {
        id: 'abc123',
        date_depense: '15/10/2025',
        demandeur_nom: 'Jan Andriessens',
        description: 'Facture hébergement serveur OVH',
        montant: 125.00,
        daysWaiting: 5,
        isUrgent: false,
      },
      {
        id: 'def456',
        date_depense: '20/10/2025',
        demandeur_nom: 'Marie Dupont',
        description: 'Matériel plongée (palmes, masque)',
        montant: 60.50,
        daysWaiting: 3,
        isUrgent: false,
      },
      {
        id: 'ghi789',
        date_depense: '02/10/2025',
        demandeur_nom: 'Pierre Martin',
        description: 'Essence sortie plongée Zeeland',
        montant: 60.00,
        daysWaiting: 15,
        isUrgent: true,
      },
    ],
  },
  events: {
    recipientName: 'Admin',
    clubName: 'Calypso Diving Club',
    eventName: 'Sortie Zeeland',
    eventDate: '25/11/2025',
    eventLocation: 'Zeeland, Pays-Bas',
    participantCount: 12,
    participants: [
      { name: 'Jean Dupont', email: 'jean@example.com', paymentStatus: 'paid', licenseNumber: 'LIFRAS123' },
      { name: 'Marie Martin', email: 'marie@example.com', paymentStatus: 'pending', licenseNumber: 'FEBRAS456' },
      { name: 'Pierre Durand', email: 'pierre@example.com', paymentStatus: 'unpaid' },
    ],
    appUrl: 'https://calycompta.vercel.app',
  },
  transactions: {
    recipientName: 'Admin',
    clubName: 'Calypso Diving Club',
    periodStart: '01/11/2025',
    periodEnd: '07/11/2025',
    transactionCount: 25,
    totalRevenue: 1250.00,
    totalExpense: 480.00,
    netBalance: 770.00,
    uncategorizedCount: 3,
    transactions: [
      { date: '01/11/2025', description: 'Cotisation Jean Dupont', amount: 60.00, category: 'Cotisations' },
      { date: '02/11/2025', description: 'Essence sortie', amount: -45.00, category: 'Transport' },
      { date: '03/11/2025', description: 'Virement bancaire', amount: 120.00 },
    ],
    appUrl: 'https://calycompta.vercel.app',
  },
  members: {
    memberName: 'Jean Dupont',
    memberEmail: 'jean@example.com',
    memberRole: 'user',
    welcomeMessage: 'Bienvenue dans le club Calypso !',
    temporaryPassword: '123456',
    clubName: 'Calypso Diving Club',
    appUrl: 'https://calycompta.vercel.app',
  },
};

/**
 * Load template from Firestore
 */
async function loadTemplate(clubId, templateId) {
  try {
    const templateDoc = await db
      .collection('clubs')
      .doc(clubId)
      .collection('email_templates')
      .doc(templateId)
      .get();

    if (!templateDoc.exists) {
      throw new Error(`Template ${templateId} not found`);
    }

    return { id: templateDoc.id, ...templateDoc.data() };
  } catch (error) {
    console.error('❌ Error loading template:', error.message);
    throw error;
  }
}

/**
 * Render template with Handlebars
 */
function renderTemplate(template, data) {
  try {
    // Inject styles into data
    const dataWithStyles = {
      ...data,
      ...template.styles,
    };

    // Compile and render subject
    const subjectTemplate = Handlebars.compile(template.subject);
    const subject = subjectTemplate(dataWithStyles);

    // Compile and render HTML
    const htmlTemplate = Handlebars.compile(template.htmlContent);
    const html = htmlTemplate(dataWithStyles);

    return { subject, html };
  } catch (error) {
    console.error('❌ Error rendering template:', error.message);
    throw error;
  }
}

/**
 * Save rendered HTML to file
 */
function saveToFile(html, subject, templateId) {
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `template-${templateId}-${Date.now()}.html`;
  const filepath = path.join(outputDir, filename);

  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body>
${html}
</body>
</html>
  `;

  fs.writeFileSync(filepath, fullHtml, 'utf-8');
  console.log(`\n💾 Rendered HTML saved to: ${filepath}`);
  console.log(`   Open in browser: file://${filepath}`);
}

/**
 * Send test email via MailerSend
 */
async function sendTestEmail(recipientEmail, subject, html) {
  // TODO: Implement MailerSend API call
  console.log(`\n📧 Test email would be sent to: ${recipientEmail}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   (MailerSend integration not yet implemented in this script)`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Test Email Template Script
==========================

Usage:
  node scripts/test-email-template.cjs <templateId> [options]

Options:
  --club <clubId>      Specify club ID (default: calypso)
  --send <email>       Send test email to specified address
  --help               Show this help message

Examples:
  # Render template and save to HTML file
  node scripts/test-email-template.cjs abc123

  # Render for specific club
  node scripts/test-email-template.cjs abc123 --club otherclub

  # Render and send test email
  node scripts/test-email-template.cjs abc123 --send test@example.com
`);
    process.exit(0);
  }

  const templateId = args[0];
  let clubId = 'calypso';
  let sendTo = null;

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--club' && args[i + 1]) {
      clubId = args[i + 1];
      i++;
    } else if (args[i] === '--send' && args[i + 1]) {
      sendTo = args[i + 1];
      i++;
    }
  }

  console.log('🔍 Loading template...');
  console.log(`   Club ID: ${clubId}`);
  console.log(`   Template ID: ${templateId}`);

  const template = await loadTemplate(clubId, templateId);

  console.log(`\n✅ Template loaded: ${template.name}`);
  console.log(`   Type: ${template.emailType}`);
  console.log(`   Active: ${template.isActive ? 'Yes' : 'No'}`);
  console.log(`   Created: ${template.createdAt?.toDate?.().toLocaleDateString() || 'Unknown'}`);
  console.log(`   Usage: ${template.usageCount || 0} times`);

  // Get sample data for template type
  const sampleData = SAMPLE_DATA[template.emailType] || SAMPLE_DATA.pending_demands;

  console.log(`\n🎨 Rendering template with sample data...`);
  const { subject, html } = renderTemplate(template, sampleData);

  console.log(`\n📧 Rendered Email:`);
  console.log(`   Subject: ${subject}`);
  console.log(`   HTML length: ${html.length} characters`);

  // Save to file
  saveToFile(html, subject, templateId);

  // Send test email if requested
  if (sendTo) {
    await sendTestEmail(sendTo, subject, html);
  }

  console.log(`\n✅ Template test complete!`);

  // Check for potential issues
  console.log(`\n🔍 Template Validation:`);

  const missingVariables = [];
  template.variables.forEach((v) => {
    if (v.required && !sampleData.hasOwnProperty(v.name)) {
      missingVariables.push(v.name);
    }
  });

  if (missingVariables.length > 0) {
    console.log(`   ⚠️  Missing required variables in sample data:`);
    missingVariables.forEach((v) => console.log(`      - ${v}`));
  } else {
    console.log(`   ✅ All required variables present`);
  }

  // Check for unescaped HTML
  if (html.includes('<script>') || html.includes('javascript:')) {
    console.log(`   ⚠️  Potential security issue: Contains script tags`);
  } else {
    console.log(`   ✅ No obvious security issues`);
  }

  // Check email size
  const sizeKB = html.length / 1024;
  if (sizeKB > 100) {
    console.log(`   ⚠️  Large email size: ${sizeKB.toFixed(2)} KB (recommended: < 100 KB)`);
  } else {
    console.log(`   ✅ Email size OK: ${sizeKB.toFixed(2)} KB`);
  }

  process.exit(0);
}

// Run
main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

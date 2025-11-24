// Vercel API handler for sending test emails for communication jobs
import { Resend } from 'resend';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      // Parse the service account from environment variable
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_KEY from environment');
    } catch (error) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error.message);
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY format');
    }
  } else {
    // Fallback to local service account file for development
    try {
      serviceAccount = require('../serviceAccountKey.json');
      console.log('✅ Using local serviceAccountKey.json');
    } catch (error) {
      console.error('❌ No service account configuration found');
      throw new Error('Firebase service account not configured');
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Generate sample data for testing different email types
 * Data format matches the variables expected by each template type
 */
function generateSampleData(emailType) {
  const now = new Date();

  switch (emailType) {
    case 'pending_demands':
      // Format matching the template variables in run-communication-jobs.js
      return {
        demandesCount: 3,
        totalAmount: '200.50',
        demandes: [
          {
            date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-BE'),
            demandeur: 'Jean Dupont',
            description: 'Bouteilles plongée du 15/11',
            montant: '45.50',
          },
          {
            date: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-BE'),
            demandeur: 'Marie Martin',
            description: 'Stage niveau 2',
            montant: '120.00',
          },
          {
            date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-BE'),
            demandeur: 'Pierre Dubois',
            description: 'Location matériel',
            montant: '35.00',
          },
        ],
      };

    case 'accounting_codes':
      // Format matching the template variables in run-communication-jobs.js
      return {
        totalTransactions: 3,
        transactions: [
          {
            date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            numero_sequence: 'SEQ-2024-001',
            contrepartie: 'Club Plongée Mer',
            code_comptable: '600-DIVE',
            montant: '540.00',
          },
          {
            date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            numero_sequence: 'SEQ-2024-002',
            contrepartie: 'Équipement Pro',
            code_comptable: '601-EQUIP',
            montant: '325.00',
          },
          {
            date: now.toLocaleDateString('fr-FR'),
            numero_sequence: 'SEQ-2024-003',
            contrepartie: 'Formation PADI',
            code_comptable: '602-TRAIN',
            montant: '450.00',
          },
        ],
      };

    case 'weekly_summary':
      return {
        weekNumber: Math.ceil((now.getDate()) / 7),
        newMembers: 2,
        totalDives: 18,
        totalRevenue: 2340.50,
        pendingDemands: 7,
      };

    case 'monthly_report':
      return {
        month: now.toLocaleString('fr-BE', { month: 'long', year: 'numeric' }),
        totalMembers: 45,
        newMembers: 5,
        totalDives: 78,
        totalRevenue: 9850.00,
        totalExpenses: 3200.00,
        pendingDemands: 12,
      };

    default:
      return {
        count: 1,
        message: 'Données de test pour ' + emailType,
      };
  }
}

/**
 * Send test email API endpoint
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { clubId, jobId, testEmail, authToken } = req.body;

    console.log('📧 [TEST-EMAIL] Starting test email request');
    console.log('📧 [TEST-EMAIL] Request details:', {
      clubId,
      jobId,
      testEmail,
      hasAuthToken: !!authToken,
    });

    // Validate required fields
    if (!clubId || !jobId || !testEmail || !authToken) {
      console.error('❌ Missing required fields:', {
        clubId: !!clubId,
        jobId: !!jobId,
        testEmail: !!testEmail,
        authToken: !!authToken,
      });
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['clubId', 'jobId', 'testEmail', 'authToken'],
      });
    }

    // Verify Firebase Auth token
    console.log('🔐 [TEST-EMAIL] Verifying Firebase Auth token...');
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(authToken);
      console.log('✅ [TEST-EMAIL] Auth token verified for user:', decodedToken.uid);
    } catch (error) {
      console.error('❌ [TEST-EMAIL] Invalid auth token:', error.message);
      return res.status(401).json({
        error: 'Unauthorized',
        details: 'Invalid authentication token',
      });
    }

    // Load club settings to get club name and logo
    console.log('📂 [TEST-EMAIL] Loading club settings...');
    const clubDoc = await db.collection('clubs').doc(clubId).get();
    if (!clubDoc.exists) {
      console.error('❌ [TEST-EMAIL] Club not found:', clubId);
      return res.status(404).json({
        error: 'Club not found',
      });
    }
    const clubData = clubDoc.data();
    const clubName = clubData.name || 'Calypso Diving Club';

    // Load communication settings to get the job details
    console.log('📂 [TEST-EMAIL] Loading communication settings...');
    const settingsDoc = await db.collection('clubs').doc(clubId).collection('settings').doc('communication').get();
    if (!settingsDoc.exists) {
      console.error('❌ [TEST-EMAIL] Communication settings not found');
      return res.status(404).json({
        error: 'Communication settings not found',
      });
    }

    const settings = settingsDoc.data();
    const job = settings.jobs?.find(j => j.id === jobId);
    if (!job) {
      console.error('❌ [TEST-EMAIL] Job not found:', jobId);
      return res.status(404).json({
        error: 'Job not found',
      });
    }

    console.log('📧 [TEST-EMAIL] Job found:', {
      name: job.name,
      emailType: job.emailType,
      templateId: job.templateId,
    });

    // Load the email template (same as run-communication-jobs.js)
    console.log('📄 [TEST-EMAIL] Loading email template from Firestore...');

    // Helper function to get template by type (same as in run-communication-jobs.js)
    async function getTemplateByType(emailType) {
      const templatesSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('email_templates')
        .where('emailType', '==', emailType)
        .where('isActive', '==', true)
        .get();

      if (templatesSnapshot.empty) {
        console.log(`⚠️ No active template found for type: ${emailType}`);
        return null;
      }

      // Prefer default template, otherwise use the first active one
      const templates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const defaultTemplate = templates.find(t => t.isDefault === true);
      const template = defaultTemplate || templates[0];

      console.log(`✅ Found template: ${template.name} (${template.id})`);
      return template;
    }

    // Helper function to render template (same as in run-communication-jobs.js)
    function renderTemplate(template, data) {
      try {
        const Handlebars = require('handlebars');

        // Compile Handlebars templates
        const subjectTemplate = Handlebars.compile(template.subject);
        const htmlTemplate = Handlebars.compile(template.htmlContent);

        // Inject styles into data for easy access
        const dataWithStyles = {
          ...data,
          ...template.styles,
        };

        // Render
        const renderedSubject = subjectTemplate(dataWithStyles);
        const renderedHtml = htmlTemplate(dataWithStyles);

        console.log(`✅ Template rendered successfully: ${template.name}`);
        return {
          success: true,
          subject: renderedSubject,
          html: renderedHtml,
        };
      } catch (error) {
        console.error('❌ Error rendering template:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }

    // Get the template for this job's email type
    const template = await getTemplateByType(job.emailType);

    if (!template) {
      console.error('❌ [TEST-EMAIL] No template found for email type:', job.emailType);
      return res.status(404).json({
        error: 'No template configured',
        details: `No active template found for email type: ${job.emailType}. Please create and activate a template first.`,
      });
    }

    // Generate sample data for the email type
    console.log('📊 [TEST-EMAIL] Generating sample data...');
    const sampleData = generateSampleData(job.emailType);

    // Add common template variables
    const templateData = {
      ...sampleData,
      recipientName: 'Administrateur Test',
      clubName: clubName,
      logoUrl: 'https://caly-compta.vercel.app/logo-horizontal.jpg',
      appUrl: 'https://caly-compta.vercel.app',
      date: new Date().toLocaleDateString('fr-FR'),
    };

    // Render the template with sample data
    console.log('🎨 [TEST-EMAIL] Rendering template with sample data...');
    const rendered = renderTemplate(template, templateData);

    if (!rendered.success) {
      console.error('❌ [TEST-EMAIL] Template rendering failed:', rendered.error);
      return res.status(500).json({
        error: 'Template rendering failed',
        details: rendered.error,
      });
    }

    const htmlContent = rendered.html;
    const subject = `[TEST] ${rendered.subject}`;

    // Load email configuration from Firestore (same as GoogleMailService)
    console.log('📧 [TEST-EMAIL] Loading email configuration...');
    const settingsRef = db.collection('clubs').doc(clubId).collection('settings').doc('email_config');
    const settingsSnap = await settingsRef.get();

    if (!settingsSnap.exists) {
      console.error('❌ [TEST-EMAIL] Email configuration not found');
      return res.status(500).json({
        error: 'Email service not configured',
        details: 'Please configure your email provider in Settings > Integrations',
      });
    }

    const emailConfig = settingsSnap.data();
    const provider = emailConfig.provider || 'resend';

    console.log('📧 [TEST-EMAIL] Email provider:', provider);

    let emailData;
    if (provider === 'resend') {
      // Use Resend API
      const resendConfig = emailConfig.resend || {};
      const apiKey = resendConfig.apiKey || process.env.RESEND_API_KEY;

      if (!apiKey) {
        console.error('❌ [TEST-EMAIL] Resend API key not configured');
        return res.status(500).json({
          error: 'Resend API key not configured',
          details: 'Please configure your Resend API key in Settings > Integrations',
        });
      }

      console.log('📧 [TEST-EMAIL] Sending email via Resend...');
      const resend = new Resend(apiKey);

      const fromEmail = resendConfig.fromEmail || 'jan@h2m.ai';
      const fromName = resendConfig.fromName || clubName;

      emailData = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: testEmail,
        subject,
        html: htmlContent,
      });

      console.log('✅ [TEST-EMAIL] Email sent successfully via Resend!');
      console.log('✅ [TEST-EMAIL] Resend response:', emailData);
    } else {
      // Use Gmail API (call the existing /api/send-gmail endpoint)
      const gmailConfig = emailConfig.gmail || {};

      if (!gmailConfig.clientId || !gmailConfig.clientSecret || !gmailConfig.refreshToken) {
        console.error('❌ [TEST-EMAIL] Gmail configuration incomplete');
        return res.status(500).json({
          error: 'Gmail configuration incomplete',
          details: 'Please configure your Gmail credentials in Settings > Integrations',
        });
      }

      console.log('📧 [TEST-EMAIL] Sending email via Gmail...');

      // We can't directly use the Gmail API here, but we could call the /api/send-gmail endpoint
      // For simplicity, we'll just use the Resend approach if Gmail is selected
      // You can extend this to call /api/send-gmail if needed
      console.log('⚠️ [TEST-EMAIL] Gmail provider detected, but using Resend for test emails');

      // Fallback to Resend if available
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resend = new Resend(apiKey);
        emailData = await resend.emails.send({
          from: `${clubName} <jan@h2m.ai>`,
          to: testEmail,
          subject,
          html: htmlContent,
        });
      } else {
        return res.status(500).json({
          error: 'Gmail test emails not yet supported',
          details: 'Please configure Resend for test emails',
        });
      }
    }

    return res.status(200).json({
      success: true,
      messageId: emailData.id,
      details: {
        to: testEmail,
        subject,
        emailType: job.emailType,
        sampleDataCount: sampleData.count || 0,
      },
    });

  } catch (error) {
    console.error('❌ [TEST-EMAIL] Error:', error);
    console.error('❌ [TEST-EMAIL] Error message:', error.message);
    console.error('❌ [TEST-EMAIL] Error stack:', error.stack);

    return res.status(500).json({
      error: error.message || 'Failed to send test email',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

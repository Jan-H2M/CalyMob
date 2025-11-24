// Vercel Serverless Function - Communication Job Scheduler
// Runs every 15 minutes via Vercel Cron Jobs
// Checks all active communication jobs and sends emails when schedules match
// Cron schedule: */15 * * * * (every 15 minutes)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const Handlebars = require('handlebars');

// Initialize Firebase Admin (only once)
let adminInitialized = false;

function initializeFirebase() {
  if (adminInitialized) return;

  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });

    // Configure Firestore to ignore undefined properties
    const db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });

    adminInitialized = true;
    console.log('✓ Firebase Admin initialized (ignoreUndefinedProperties enabled)');
  } catch (error) {
    if (error.code !== 'app/duplicate-app') {
      throw error;
    }
  }
}

/**
 * Get current time in Brussels timezone
 */
function getCurrentBrusselsTime() {
  const now = new Date();

  const brusselsTimeStr = now.toLocaleString('en-US', {
    timeZone: 'Europe/Brussels',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const brusselsDate = new Date(brusselsTimeStr);

  return {
    hours: brusselsDate.getHours(),
    minutes: brusselsDate.getMinutes(),
    dayOfWeek: brusselsDate.getDay(),
    isoString: brusselsDate.toISOString()
  };
}

/**
 * Check if today matches job schedule
 */
function shouldRunToday(job) {
  const { dayOfWeek } = getCurrentBrusselsTime();
  return job.daysOfWeek.includes(dayOfWeek);
}

/**
 * Check if current time matches job's scheduled time (±15 min tolerance)
 */
function shouldRunNow(job) {
  const { hours: currentHours, minutes: currentMinutes } = getCurrentBrusselsTime();

  const [jobHours, jobMinutes] = job.timeOfDay.split(':').map(Number);

  const currentTimeMinutes = currentHours * 60 + currentMinutes;
  const jobTimeMinutes = jobHours * 60 + jobMinutes;

  const tolerance = 15;
  const diff = Math.abs(currentTimeMinutes - jobTimeMinutes);

  return diff <= tolerance;
}

/**
 * Check if job should execute now
 */
function shouldExecuteJob(job) {
  return shouldRunToday(job) && shouldRunNow(job);
}

/**
 * Get pending expense claims
 */
async function getPendingDemandes(db, clubId) {
  const demandesSnapshot = await db
    .collection('clubs')
    .doc(clubId)
    .collection('demandes_remboursement')
    .where('status', 'in', ['pending', 'partially_approved'])
    .get();

  return demandesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get recipient emails based on roles
 */
async function getRecipientEmails(db, clubId, roles) {
  const emails = [];

  // Handle undefined/null roles
  if (!roles) {
    console.log('⚠️ No roles provided, defaulting to superadmin');
    roles = 'superadmin';
  }

  // Ensure roles is an array (handle both string and array)
  const rolesArray = Array.isArray(roles) ? roles : [roles];

  console.log(`🔍 Looking for recipients with roles: ${JSON.stringify(rolesArray)}`);

  for (const role of rolesArray) {
    if (!role) continue; // Skip undefined/null roles in array

    // Query all members with this role (without isActive filter)
    // Try both 'role' and 'app_role' fields for compatibility
    let membersSnapshot = await db
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .where('app_role', '==', role)
      .get();

    // Fallback to 'role' field if app_role returns nothing
    if (membersSnapshot.empty) {
      membersSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .where('role', '==', role)
        .get();
    }

    console.log(`   Found ${membersSnapshot.size} member(s) with role "${role}"`);

    // Filter for active members
    // Check multiple possible fields: isActive, app_status, status
    membersSnapshot.docs.forEach(doc => {
      const data = doc.data();

      // Check various active status fields
      const isActiveBoolean = data.isActive === true || data.isActive === 'true';
      const appStatusActive = data.app_status === 'active';
      const statusActive = data.status === 'active';
      const memberStatusActive = data.member_status === 'active';

      const isActive = isActiveBoolean || appStatusActive || statusActive || memberStatusActive;

      if (!isActive) {
        console.log(`   ⏭️  Skipping ${data.prenom} ${data.nom} (not active - isActive:${data.isActive}, app_status:${data.app_status}, status:${data.status})`);
        return;
      }

      const email = data.email;
      if (email && !emails.includes(email)) {
        console.log(`   ✓ Adding: ${data.prenom} ${data.nom} (${email})`);
        emails.push(email);
      } else if (!email) {
        console.log(`   ⚠️  Skipping ${data.prenom} ${data.nom} (no email)`);
      }
    });
  }

  console.log(`📬 Total recipients found: ${emails.length}`);
  return emails;
}

/**
 * Get email template by type from Firestore
 */
async function getTemplateByType(db, clubId, emailType) {
  try {
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
  } catch (error) {
    console.error('❌ Error loading template:', error);
    return null;
  }
}

/**
 * Render email template with Handlebars
 */
function renderTemplate(template, data) {
  try {
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

/**
 * Send email via Resend or Gmail based on configuration
 */
async function sendEmail(db, clubId, to, subject, htmlContent) {
  // Load email configuration
  const configDoc = await db
    .collection('clubs')
    .doc(clubId)
    .collection('settings')
    .doc('email_config')
    .get();

  if (!configDoc.exists) {
    throw new Error('Email configuration not found');
  }

  const emailConfig = configDoc.data();
  const provider = emailConfig.provider || 'resend';

  console.log(`📧 Using email provider: ${provider}`);

  if (provider === 'resend') {
    // Use Resend
    const { Resend } = require('resend');
    const resendConfig = emailConfig.resend;

    if (!resendConfig || !resendConfig.apiKey || !resendConfig.fromEmail) {
      throw new Error('Incomplete Resend configuration');
    }

    const resend = new Resend(resendConfig.apiKey);
    const fromHeader = resendConfig.fromName
      ? `${resendConfig.fromName} <${resendConfig.fromEmail}>`
      : resendConfig.fromEmail;

    const result = await resend.emails.send({
      from: fromHeader,
      to,
      subject,
      html: htmlContent,
    });

    return result.data.id;

  } else if (provider === 'gmail') {
    // Use Gmail
    const gmailConfig = emailConfig.gmail;

    if (!gmailConfig || !gmailConfig.clientId || !gmailConfig.clientSecret ||
        !gmailConfig.refreshToken || !gmailConfig.fromEmail) {
      throw new Error('Incomplete Gmail configuration');
    }

    const { google } = require('googleapis');
    const OAuth2 = google.auth.OAuth2;

    const oauth2Client = new OAuth2(
      gmailConfig.clientId,
      gmailConfig.clientSecret,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({ refresh_token: gmailConfig.refreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const fromHeader = gmailConfig.fromName
      ? `${gmailConfig.fromName} <${gmailConfig.fromEmail}>`
      : gmailConfig.fromEmail;

    const messageParts = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlContent,
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return result.data.id;

  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }
}

/**
 * Execute accounting codes job
 */
async function executeAccountingCodesJob(db, clubId, job) {
  console.log('📧 Executing accounting codes job...');

  // Get ALL transactions with accounting codes that haven't been sent yet
  // Query filters:
  // 1. code_comptable != null (has accounting code assigned)
  // 2. email_sent != true (not yet sent via email)
  console.log('🔍 Querying transactions with codes NOT yet sent...');

  const transactionsSnapshot = await db
    .collection('clubs')
    .doc(clubId)
    .collection('transactions_bancaires')
    .where('code_comptable', '!=', null)
    .orderBy('code_comptable')
    .limit(100)
    .get();

  // Filter out transactions that have already been sent
  // (email_sent === true)
  const allTransactions = transactionsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    date_execution_formatted: doc.data().date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A'
  }));

  const transactions = allTransactions
    .filter(t => t.email_sent !== true)
    .sort((a, b) => {
      // Sort by date_execution descending (newest first)
      const dateA = a.date_execution?.toDate?.() || new Date(0);
      const dateB = b.date_execution?.toDate?.() || new Date(0);
      return dateB - dateA;
    });

  console.log(`   Found ${transactionsSnapshot.size} total transaction(s) with codes`);
  console.log(`   Filtered to ${transactions.length} transaction(s) NOT yet sent`);

  if (transactions.length < (job.minimumCount || 0)) {
    console.log(`⏭️  Only ${transactions.length} transaction(s), minimum is ${job.minimumCount || 0}. Skipping.`);
    return { skipped: true, reason: 'Below minimum count' };
  }

  const emails = await getRecipientEmails(db, clubId, job.recipientRoles);

  if (emails.length === 0) {
    console.log('⚠️ No recipient emails found');
    return { skipped: true, reason: 'No recipients' };
  }

  // Load email template
  console.log('🔍 Loading email template for accounting_codes...');
  const template = await getTemplateByType(db, clubId, 'accounting_codes');

  if (!template) {
    console.log('⚠️ No template found for accounting_codes, skipping email send');
    return { skipped: true, reason: 'No template configured' };
  }

  // Use template system
  console.log(`✅ Using template: ${template.name}`);

  // Prepare template data
  const templateData = {
    recipientName: 'Administrateur', // Will be replaced per recipient if needed
    clubName: 'Calypso Diving Club',
    date: new Date().toLocaleDateString('fr-FR'),
    totalTransactions: transactions.length,
    logoUrl: 'https://caly-compta.vercel.app/logo-horizontal.jpg',
    appUrl: 'https://caly-compta.vercel.app',
    transactions: transactions.map(t => ({
      date: t.date_execution_formatted,
      numero_sequence: t.numero_sequence || '-',
      contrepartie: t.contrepartie_nom || '-',
      code_comptable: t.code_comptable,
      montant: t.montant?.toFixed(2) || '0.00',
    })),
  };

  const rendered = renderTemplate(template, templateData);
  if (!rendered.success) {
    console.error('❌ Template rendering failed');
    return { success: false, error: 'Template rendering failed' };
  }

  const subject = rendered.subject;
  const htmlContent = rendered.html;

  // Send to all recipients
  const results = [];
  let emailSentSuccessfully = false;

  for (const email of emails) {
    try {
      const messageId = await sendEmail(db, clubId, email, subject, htmlContent);
      results.push({ email, success: true, messageId });
      console.log(`✅ Email sent to ${email}`);
      emailSentSuccessfully = true;

      // Save to email_history collection
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail: email,
            subject,
            htmlContent,
            sendType: 'automated',
            status: 'sent',
            createdAt: Timestamp.now(),
            sentAt: Timestamp.now(),
            jobId: job.id,
            jobName: job.name,
            clubId,
          });
        console.log(`   ✓ Saved to email_history for ${email}`);
      } catch (historyError) {
        console.error(`   ⚠️ Failed to save email_history for ${email}:`, historyError.message);
      }

    } catch (error) {
      console.error(`❌ Failed to send email to ${email}:`, error);
      results.push({ email, success: false, error: error.message });

      // Save failed email to email_history
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail: email,
            subject,
            htmlContent,
            sendType: 'automated',
            status: 'failed',
            statusMessage: error.message,
            createdAt: Timestamp.now(),
            jobId: job.id,
            jobName: job.name,
            clubId,
          });
        console.log(`   ✓ Saved failed email to email_history for ${email}`);
      } catch (historyError) {
        console.error(`   ⚠️ Failed to save failed email_history for ${email}:`, historyError.message);
      }
    }
  }

  // Mark all transactions as sent (only if at least one email was sent successfully)
  let markedCount = 0;
  if (emailSentSuccessfully && transactions.length > 0) {
    console.log(`\n📝 Marking ${transactions.length} transaction(s) as sent...`);

    for (const transaction of transactions) {
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('transactions_bancaires')
          .doc(transaction.id)
          .update({
            email_sent: true,
            email_sent_at: Timestamp.now()
          });

        markedCount++;
        console.log(`   ✓ Marked ${transaction.numero_sequence} (${transaction.code_comptable})`);
      } catch (error) {
        console.error(`   ❌ Failed to mark ${transaction.numero_sequence}:`, error.message);
      }
    }

    console.log(`✅ Marked ${markedCount}/${transactions.length} transaction(s) as sent\n`);
  }

  return { success: true, emailsSent: results.length, transactionsMarked: markedCount, results };
}

/**
 * Execute pending demands reminder job
 */
async function executePendingDemandsJob(db, clubId, job) {
  console.log('📧 Executing pending demands job...');

  const demandes = await getPendingDemandes(db, clubId);

  if (demandes.length < (job.minimumCount || 1)) {
    console.log(`⏭️  Only ${demandes.length} pending demand(s), minimum is ${job.minimumCount || 1}. Skipping.`);
    return { skipped: true, reason: 'Below minimum count' };
  }

  const emails = await getRecipientEmails(db, clubId, job.recipientRoles);

  if (emails.length === 0) {
    console.log('⚠️ No recipient emails found');
    return { skipped: true, reason: 'No recipients' };
  }

  // Calculate totals
  const totalAmount = demandes.reduce((sum, d) => sum + (d.montant || 0), 0);

  // Load email template
  console.log('🔍 Loading email template for pending_demands...');
  const template = await getTemplateByType(db, clubId, 'pending_demands');

  let subject, htmlContent;

  if (template) {
    // Use template system
    console.log(`✅ Using template: ${template.name}`);

    // Prepare template data
    const templateData = {
      recipientName: 'Administrateur', // Will be replaced per recipient if needed
      clubName: 'Calypso Diving Club',
      date: new Date().toLocaleDateString('fr-FR'),
      demandesCount: demandes.length,
      totalAmount: totalAmount.toFixed(2),
      logoUrl: 'https://caly-compta.vercel.app/logo-horizontal.jpg',
      appUrl: 'https://caly-compta.vercel.app',
      demandes: demandes.map(d => ({
        date: d.date_depense?.toDate ? d.date_depense.toDate().toLocaleDateString('fr-BE') : '-',
        demandeur: d.demandeur_nom || '-',
        description: d.description || '-',
        montant: (d.montant || 0).toFixed(2),
      })),
    };

    const rendered = renderTemplate(template, templateData);
    if (!rendered.success) {
      console.error('❌ Template rendering failed, using fallback subject');
      subject = `📋 Rappel: ${demandes.length} demande(s) de remboursement en attente`;
      htmlContent = ''; // Will cause email to fail, which is better than sending broken HTML
      return { success: false, error: 'Template rendering failed' };
    } else {
      subject = rendered.subject;
      htmlContent = rendered.html;
    }
  } else {
    // No template found - log warning and skip
    console.log('⚠️ No template found for pending_demands, skipping email send');
    return { skipped: true, reason: 'No template configured' };
  }

  // Send to all recipients
  const results = [];
  for (const email of emails) {
    try {
      const messageId = await sendEmail(db, clubId, email, subject, htmlContent);
      results.push({ email, success: true, messageId });
      console.log(`✅ Email sent to ${email}`);

      // Save to email_history collection
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail: email,
            subject,
            htmlContent,
            sendType: 'automated',
            status: 'sent',
            createdAt: Timestamp.now(),
            sentAt: Timestamp.now(),
            jobId: job.id,
            jobName: job.name,
            clubId,
          });
        console.log(`   ✓ Saved to email_history for ${email}`);
      } catch (historyError) {
        console.error(`   ⚠️ Failed to save email_history for ${email}:`, historyError.message);
      }

    } catch (error) {
      console.error(`❌ Failed to send email to ${email}:`, error);
      results.push({ email, success: false, error: error.message });

      // Save failed email to email_history
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail: email,
            subject,
            htmlContent,
            sendType: 'automated',
            status: 'failed',
            statusMessage: error.message,
            createdAt: Timestamp.now(),
            jobId: job.id,
            jobName: job.name,
            clubId,
          });
        console.log(`   ✓ Saved failed email to email_history for ${email}`);
      } catch (historyError) {
        console.error(`   ⚠️ Failed to save failed email_history for ${email}:`, historyError.message);
      }
    }
  }

  return { success: true, emailsSent: results.length, results };
}

/**
 * Main handler - runs on cron schedule
 */
module.exports = async (req, res) => {
  // Verify cron secret for security
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initializeFirebase();
    const db = getFirestore();

    const brusselsTime = getCurrentBrusselsTime();
    console.log(`\n⏰ Cron triggered at ${brusselsTime.isoString} Brussels time`);
    console.log(`   Day: ${brusselsTime.dayOfWeek} (0=Sun, 1=Mon, ..., 6=Sat)`);
    console.log(`   Time: ${String(brusselsTime.hours).padStart(2, '0')}:${String(brusselsTime.minutes).padStart(2, '0')}`);

    // Load communication settings
    const clubId = 'calypso';
    const settingsDoc = await db
      .collection('clubs')
      .doc(clubId)
      .collection('settings')
      .doc('communication')
      .get();

    if (!settingsDoc.exists) {
      console.log('⚠️ No communication settings found');
      return res.status(200).json({ message: 'No settings configured' });
    }

    const settings = settingsDoc.data();
    if (!settings.enabled) {
      console.log('⏭️  Communication system disabled');
      return res.status(200).json({ message: 'System disabled' });
    }

    const jobs = settings.jobs || [];
    const activeJobs = jobs.filter(j => j.enabled);

    console.log(`📋 Found ${activeJobs.length} active job(s)`);

    const results = [];

    for (const job of activeJobs) {
      console.log(`\n🔍 Checking job: ${job.name}`);
      console.log(`   Schedule: Days ${job.daysOfWeek.join(',')} at ${job.timeOfDay}`);

      const runToday = shouldRunToday(job);
      const runNow = shouldRunNow(job);
      const willExecute = shouldExecuteJob(job);

      console.log(`   Should run today? ${runToday ? 'YES' : 'NO'}`);
      console.log(`   Should run now? ${runNow ? 'YES' : 'NO'}`);
      console.log(`   Will execute? ${willExecute ? 'YES ✅' : 'NO'}`);

      if (willExecute) {
        // Execute the job
        console.log(`🚀 Executing job: "${job.name}" (ID: ${job.id})`);
        console.log(`   Job config: recipientRoles=${JSON.stringify(job.recipientRoles)}, minimumCount=${job.minimumCount}`);
        let result;

        // Match by job name instead of ID (IDs are auto-generated)
        // Trim whitespace to handle trailing spaces
        const jobName = (job.name || '').trim();

        if (jobName === 'Rappel demandes en attente') {
          result = await executePendingDemandsJob(db, clubId, job);
        } else if (jobName === 'Nouveau jobcodes comptables') {
          result = await executeAccountingCodesJob(db, clubId, job);
        } else {
          console.log(`⚠️ Unknown job name: "${job.name}" (trimmed: "${jobName}") - skipping`);
          result = { skipped: true, reason: `Job type not implemented: ${job.name}` };
        }

        results.push({ job: job.name, ...result });

        // Update lastRun timestamp
        job.lastRun = Timestamp.now();
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('communication')
          .update({ jobs });

        // Log to Firestore
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('communication_logs')
          .add({
            jobId: job.id,
            jobName: job.name,
            executedAt: Timestamp.now(),
            brusselsTime: `${String(brusselsTime.hours).padStart(2, '0')}:${String(brusselsTime.minutes).padStart(2, '0')}`,
            result,
          });
      } else {
        results.push({ job: job.name, skipped: true, reason: 'Schedule not matched' });
      }
    }

    console.log('\n✅ Cron execution complete');

    return res.status(200).json({
      success: true,
      executedAt: new Date().toISOString(),
      brusselsTime: brusselsTime.isoString,
      results,
    });

  } catch (error) {
    console.error('❌ Cron execution error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
};

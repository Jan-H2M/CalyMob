/**
 * Cloud Function: Send EPC QR payment email
 *
 * Callable function triggered from CalyMob when a user chooses "Pay now" during event registration.
 * Uses the email template system with type 'event_payment' from Firestore.
 *
 * Input: {
 *   clubId: string,
 *   operationId: string,
 *   participantId: string,
 *   memberEmail: string,
 *   memberFirstName: string,
 *   memberLastName: string,
 *   amount: number,
 *   operationTitle: string,
 *   operationNumber?: string,
 *   operationDate?: string (ISO format)
 * }
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const Handlebars = require('handlebars');

/**
 * Generate EPC QR code payload for SEPA Credit Transfer
 *
 * EPC QR Code Structure (12 lines):
 * 1. BCD (Service Tag - fixed)
 * 2. 002 (Version - using 002 for EEA without BIC requirement)
 * 3. 1 (Character encoding - 1=UTF-8)
 * 4. SCT (Identification Code - SEPA Credit Transfer)
 * 5. [BIC] (optional in version 002 for EEA)
 * 6. [Beneficiary Name] (max 70 chars)
 * 7. [IBAN] (max 34 chars)
 * 8. [EUR Amount] (format: EURX.XX)
 * 9. [Purpose Code] (4 chars, optional)
 * 10. [Structured Reference] (optional, ISO 11649)
 * 11. [Unstructured Text] (max 140 chars, payment description)
 * 12. [Beneficiary Info] (max 70 chars, optional)
 */
function generateEpcPayload(data) {
  const {
    beneficiaryName,
    iban,
    amount,
    bic = '',
    description = '',
  } = data;

  // Clean and format data
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  const cleanBic = bic.replace(/\s/g, '').toUpperCase();
  const cleanBeneficiary = beneficiaryName.trim().substring(0, 70);
  const formattedAmount = `EUR${amount.toFixed(2)}`;
  const cleanDescription = description.substring(0, 140);

  // Build the 12-line payload
  const lines = [
    'BCD',           // 1. Service Tag
    '002',           // 2. Version (002 = BIC optional in EEA)
    '1',             // 3. Character encoding (1 = UTF-8)
    'SCT',           // 4. Identification code
    cleanBic,        // 5. BIC (optional)
    cleanBeneficiary, // 6. Beneficiary name
    cleanIban,       // 7. IBAN
    formattedAmount, // 8. Amount
    '',              // 9. Purpose code (optional)
    '',              // 10. Structured reference (optional)
    cleanDescription, // 11. Unstructured text (payment description)
    '',              // 12. Beneficiary info (optional)
  ];

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Generate payment communication string
 *
 * Format: #{eventNumber} {eventName} {date} {participantName}
 * Example: #200006 Villers-2-Eglises 25/01/2026 Jean Dupont
 */
function generatePaymentCommunication(eventNumber, eventId, eventTitle, eventDate, firstName, lastName) {
  // Event number or first 6 chars of ID
  const number = eventNumber || eventId.substring(0, 6).toUpperCase();

  // Event name (max 40 chars)
  const name = eventTitle.substring(0, 40);

  // Date formatted DD/MM/YYYY
  let dateStr = '';
  if (eventDate) {
    const d = new Date(eventDate);
    if (!isNaN(d.getTime())) {
      dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    }
  }

  // Participant name (max 30 chars)
  const participantName = `${firstName || ''} ${lastName || ''}`.trim().substring(0, 30);

  // Build communication (max 140 chars for EPC spec)
  const communication = `#${number} ${name} ${dateStr} ${participantName}`.trim();
  return communication.substring(0, 140);
}

/**
 * Format IBAN for display (groups of 4)
 */
function formatIbanDisplay(iban) {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Generate QR code as base64 string (without data URL prefix)
 * Returns just the base64 content for use as email attachment
 */
async function generateQrCodeBase64(payload) {
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
    });
    // Remove the data URL prefix to get just the base64 content
    // Format: data:image/png;base64,XXXXX
    const base64Content = dataUrl.replace(/^data:image\/png;base64,/, '');
    return base64Content;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Format amount for display (Belgian format)
 */
function formatAmount(amount) {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDateDisplay(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Default template HTML (fallback if no template configured in Firestore)
 */
function getDefaultTemplateHtml() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">

  <!-- Header with gradient (Marine theme) -->
  <div style="background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}
      <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 180px; height: auto; margin-bottom: 20px;">
    {{else}}
      <h2 style="margin: 0 0 10px 0; font-size: 24px;">{{clubName}}</h2>
    {{/if}}
    <h1 style="margin: 0; font-size: 26px;">Paiement de votre inscription</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">{{eventTitle}}</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Vous êtes inscrit(e) à l'événement <strong>{{eventTitle}}</strong>{{#if eventDate}} du <strong>{{eventDate}}</strong>{{/if}}.
    </p>

    <p style="font-size: 16px; margin-bottom: 25px;">
      Pour faciliter votre paiement, scannez le QR code ci-dessous avec votre application bancaire :
    </p>

    <!-- QR Code Box -->
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: #F9FAFB; border: 2px solid #E5E7EB; border-radius: 12px; padding: 25px;">
        <img src="{{qrCodeImage}}" alt="QR Code de paiement EPC" style="width: 200px; height: 200px; display: block;">
        <p style="margin: 15px 0 0 0; font-size: 32px; font-weight: bold; color: #1E40AF;">{{amountFormatted}}</p>
      </div>
    </div>

    <!-- Payment Details Box -->
    <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1E40AF;">
        Ou effectuez un virement manuel :
      </p>
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280; width: 120px;">Bénéficiaire :</td>
          <td style="padding: 8px 0; font-weight: 500;">{{beneficiaryName}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">IBAN :</td>
          <td style="padding: 8px 0; font-family: 'Courier New', monospace; font-weight: 500;">{{ibanFormatted}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant :</td>
          <td style="padding: 8px 0; font-weight: 600; color: #1E40AF;">{{amountFormatted}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Communication :</td>
          <td style="padding: 8px 0; font-weight: 500; word-break: break-word;">{{paymentReference}}</td>
        </tr>
      </table>
    </div>

    <!-- Important Notice -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #92400E;">
        Important
      </p>
      <p style="margin: 0; font-size: 14px; color: #78350F; line-height: 1.5;">
        Veuillez utiliser la communication exacte ci-dessus pour que votre paiement soit correctement identifié.
      </p>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Si vous avez des questions concernant votre inscription ou le paiement, n'hésitez pas à contacter l'organisateur de l'événement.
    </p>

    <p style="font-size: 14px; margin: 0;">
      À bientôt,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      QR Code EPC · Virement SEPA
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send email via Resend API with optional attachments
 */
async function sendEmailViaResend(apiKey, from, to, subject, html, attachments = []) {
  const payload = {
    from,
    to,
    subject,
    html,
  };

  // Add attachments if provided (for CID embedded images)
  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to send email via Resend');
  }

  return response.json();
}

/**
 * Main Cloud Function: sendPaymentQrEmail
 *
 * Callable from CalyMob app
 */
const sendPaymentQrEmail = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    const db = admin.firestore();

    // Validate input
    const {
      clubId,
      operationId,
      participantId,
      memberEmail,
      memberFirstName,
      memberLastName,
      amount,
      operationTitle,
      operationNumber,
      operationDate,
    } = request.data;

    if (!clubId || !operationId || !memberEmail || !amount || !operationTitle) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Amount must be a positive number');
    }

    console.log(`📧 [sendPaymentQrEmail] Sending payment email for operation ${operationId} to ${memberEmail}`);

    try {
      // 1. Get bank settings
      const bankSettingsDoc = await db.collection('clubs').doc(clubId)
        .collection('settings').doc('bank').get();

      if (!bankSettingsDoc.exists) {
        throw new HttpsError('failed-precondition', 'Bank settings not configured. Please configure IBAN in CalyCompta.');
      }

      const bankSettings = bankSettingsDoc.data();
      const { iban, beneficiaryName, bic } = bankSettings;

      if (!iban || !beneficiaryName) {
        throw new HttpsError('failed-precondition', 'IBAN or beneficiary name not configured');
      }

      // 2. Get email config (Resend API)
      const emailConfigDoc = await db.collection('clubs').doc(clubId)
        .collection('settings').doc('email_config').get();

      if (!emailConfigDoc.exists) {
        throw new HttpsError('failed-precondition', 'Email configuration not found');
      }

      const emailConfig = emailConfigDoc.data();

      if (!emailConfig.resend?.apiKey) {
        throw new HttpsError('failed-precondition', 'Resend API key not configured');
      }

      // 3. Get general settings for club name and logo
      const generalSettingsDoc = await db.collection('clubs').doc(clubId)
        .collection('settings').doc('general').get();

      const generalSettings = generalSettingsDoc.exists ? generalSettingsDoc.data() : {};
      const clubName = generalSettings.clubName || 'Club';
      const logoUrl = generalSettings.logoUrl || '';

      // 4. Load email template with type 'event_payment' from Firestore
      console.log(`📄 [sendPaymentQrEmail] Looking for email template with emailType='event_payment'`);

      const templatesSnapshot = await db.collection('clubs').doc(clubId)
        .collection('email_templates')
        .where('emailType', '==', 'event_payment')
        .where('isActive', '==', true)
        .limit(1)
        .get();

      let templateHtml, templateSubject;

      if (templatesSnapshot.empty) {
        // Use default template (hardcoded fallback)
        console.log('⚠️ [sendPaymentQrEmail] No active event_payment template found, using default');
        templateHtml = getDefaultTemplateHtml();
        templateSubject = 'Paiement pour {{eventTitle}} - {{amountFormatted}}';
      } else {
        // Use template from Firestore
        const templateDoc = templatesSnapshot.docs[0].data();
        templateHtml = templateDoc.htmlContent;
        templateSubject = templateDoc.subject || 'Paiement pour {{eventTitle}}';
        console.log(`✅ [sendPaymentQrEmail] Using template: ${templatesSnapshot.docs[0].id}`);
      }

      // 5. Generate payment communication
      const paymentReference = generatePaymentCommunication(
        operationNumber,
        operationId,
        operationTitle,
        operationDate,
        memberFirstName,
        memberLastName
      );

      // 6. Generate EPC payload
      const epcPayload = generateEpcPayload({
        beneficiaryName,
        iban,
        bic,
        amount,
        description: paymentReference,
      });

      // 7. Generate QR code as base64
      const qrCodeBase64 = await generateQrCodeBase64(epcPayload);

      // 8. Prepare template variables
      // Use CID reference for the QR code image (will be embedded as attachment)
      const amountFormatted = formatAmount(amount);
      const ibanFormatted = formatIbanDisplay(iban);
      const eventDateFormatted = formatDateDisplay(operationDate);

      const templateData = {
        recipientName: memberFirstName || memberLastName || memberEmail.split('@')[0],
        firstName: memberFirstName || '',
        lastName: memberLastName || '',
        eventTitle: operationTitle,
        eventDate: eventDateFormatted,
        amount: amount,
        amountFormatted: amountFormatted,
        iban: iban,
        ibanFormatted: ibanFormatted,
        beneficiaryName: beneficiaryName,
        paymentReference: paymentReference,
        qrCodeImage: 'cid:qrcode',  // CID reference for embedded image
        clubName: clubName,
        logoUrl: logoUrl,
        appUrl: 'https://calycompta.vercel.app',
      };

      // 9. Render template with Handlebars
      const compiledHtml = Handlebars.compile(templateHtml);
      const compiledSubject = Handlebars.compile(templateSubject);

      const renderedHtml = compiledHtml(templateData);
      const renderedSubject = compiledSubject(templateData);

      // 10. Send email via Resend with QR code as CID embedded attachment
      const from = `${emailConfig.resend.fromName || clubName} <${emailConfig.resend.fromEmail}>`;

      // Prepare QR code attachment with Content-ID for inline display
      const attachments = [
        {
          filename: 'qrcode.png',
          content: qrCodeBase64,
          content_id: 'qrcode',
        },
      ];

      const result = await sendEmailViaResend(
        emailConfig.resend.apiKey,
        from,
        memberEmail,
        renderedSubject,
        renderedHtml,
        attachments
      );

      console.log(`✅ [sendPaymentQrEmail] Email sent successfully to ${memberEmail}, id: ${result.id}`);

      // 11. Log to email_history collection
      try {
        await db.collection('clubs').doc(clubId).collection('email_history').add({
          type: 'event_payment',
          to: memberEmail,
          subject: renderedSubject,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          operationId,
          participantId,
          amount,
          resendId: result.id,
          status: 'sent',
        });
      } catch (logError) {
        console.warn('Warning: Failed to log email to history:', logError);
        // Don't throw - email was sent successfully
      }

      return {
        success: true,
        message: 'Payment email sent successfully',
        emailId: result.id,
      };

    } catch (error) {
      console.error('❌ [sendPaymentQrEmail] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', error.message || 'Failed to send payment email');
    }
  }
);

module.exports = { sendPaymentQrEmail };

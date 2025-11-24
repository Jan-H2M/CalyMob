// Vercel API handler for sending Gmail emails
import { google } from 'googleapis';

/**
 * Get Gmail client using OAuth2 refresh token
 * @param {string} clientId - OAuth2 Client ID
 * @param {string} clientSecret - OAuth2 Client Secret
 * @param {string} refreshToken - OAuth2 Refresh Token
 * @returns {Promise} Gmail API client
 */
async function getGmailClient(clientId, clientSecret, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground' // Redirect URI (not used for refresh)
  );

  // Set refresh token
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      clientId,
      clientSecret,
      refreshToken,
      fromEmail,
      fromName,
      to,
      subject,
      htmlBody,
      textBody
    } = req.body;

    // Validate required fields
    if (!clientId || !clientSecret || !refreshToken || !to || !subject || !htmlBody) {
      console.error('❌ Missing fields:', {
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        refreshToken: !!refreshToken,
        to: !!to,
        subject: !!subject,
        htmlBody: !!htmlBody
      });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create email message with From header
    const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const message = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      htmlBody
    ].join('\n');

    // Encode message in base64url
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email via Gmail API
    const gmail = await getGmailClient(clientId, clientSecret, refreshToken);
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log('✅ Email sent successfully:', result.data.id);

    return res.status(200).json({
      success: true,
      messageId: result.data.id,
      message: 'Email envoyé avec succès',
    });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      errors: error.errors,
      response: error.response?.data
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de l\'envoi de l\'email',
      details: {
        code: error.code,
        status: error.status,
        errors: error.errors
      }
    });
  }
}

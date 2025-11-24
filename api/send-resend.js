// Vercel API handler for sending emails via Resend
import { Resend } from 'resend';

/**
 * Resend email API endpoint
 *
 * Much simpler than Gmail OAuth!
 * - No complex OAuth flow
 * - Just an API key
 * - Better deliverability
 * - Excellent developer experience
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, from, to, subject, html } = req.body;

    console.log('📧 [RESEND] Starting email send request');
    console.log('📧 [RESEND] Request details:', {
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none',
      from: from || 'default',
      to,
      subject,
      htmlLength: html?.length || 0
    });

    // Validate required fields
    if (!apiKey || !to || !subject || !html) {
      console.error('❌ Missing required fields:', {
        apiKey: !!apiKey,
        to: !!to,
        subject: !!subject,
        html: !!html
      });
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['apiKey', 'to', 'subject', 'html']
      });
    }

    // Initialize Resend with API key from request body
    console.log('📧 [RESEND] Initializing Resend client...');
    const resend = new Resend(apiKey);

    // Send email
    console.log('📧 [RESEND] Calling resend.emails.send()...');
    const data = await resend.emails.send({
      from: from || 'Calypso Diving Club <onboarding@resend.dev>', // Use resend test domain or your verified domain
      to,
      subject,
      html,
    });

    console.log('✅ [RESEND] Email sent successfully!');
    console.log('✅ [RESEND] Response from Resend:', JSON.stringify(data, null, 2));

    return res.status(200).json({
      success: true,
      messageId: data.id,
      message: 'Email envoyé avec succès via Resend',
    });
  } catch (error) {
    console.error('❌ [RESEND] Error sending email:', error);
    console.error('❌ [RESEND] Error message:', error.message);
    console.error('❌ [RESEND] Error name:', error.name);
    console.error('❌ [RESEND] Error stack:', error.stack);

    // Log full error object
    console.error('❌ [RESEND] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de l\'envoi de l\'email',
    });
  }
}

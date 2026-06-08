function htmlToText(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildReplyToHeader(replyTo, replyToName) {
  if (!replyTo) return null;
  return replyToName ? `${replyToName} <${replyTo}>` : replyTo;
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => [key, String(value).replace(/\r?\n/g, ' ')])
  );
}

function wrapBase64(value) {
  return String(value || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\r\n') || '';
}

function normalizeAttachmentContent(content) {
  const value = String(content || '');
  const dataUrlMatch = value.match(/^data:([^;]+);base64,(.*)$/);
  return dataUrlMatch ? dataUrlMatch[2] : value;
}

function compactMimeLines(lines) {
  return lines.filter((line) => line !== null && line !== undefined);
}

function inferContentType(attachment) {
  if (attachment.content_type) return attachment.content_type;
  if (attachment.contentType) return attachment.contentType;
  const filename = String(attachment.filename || attachment.name || '').toLowerCase();
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

function buildGmailMimeMessage({
  fromHeader,
  to,
  subject,
  html,
  text,
  replyToHeader,
  normalizedHeaders,
  attachments = [],
}) {
  const headerLines = Object.entries(normalizedHeaders || {})
    .map(([key, value]) => `${key}: ${value}`);

  if (!Array.isArray(attachments) || attachments.length === 0) {
    return compactMimeLines([
      `From: ${fromHeader}`,
      `To: ${to}`,
      replyToHeader ? `Reply-To: ${replyToHeader}` : null,
      ...headerLines,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      html,
    ]).join('\r\n');
  }

  const boundary = `calymob_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const bodyParts = [
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html || text || '',
  ];

  for (const attachment of attachments) {
    const filename = attachment.filename || attachment.name || 'attachment';
    const contentType = inferContentType(attachment);
    const contentId = attachment.content_id || attachment.contentId;
    const disposition = contentId ? 'inline' : 'attachment';
    bodyParts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      contentId ? `Content-ID: <${contentId}>` : null,
      `Content-Disposition: ${disposition}; filename="${filename}"`,
      '',
      wrapBase64(normalizeAttachmentContent(attachment.content)),
    );
  }

  bodyParts.push(`--${boundary}--`);

  return compactMimeLines([
    `From: ${fromHeader}`,
    `To: ${to}`,
    replyToHeader ? `Reply-To: ${replyToHeader}` : null,
    ...headerLines,
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    ...compactMimeLines(bodyParts),
  ]).join('\r\n');
}

function buildResendPayload({ emailConfig, to, subject, html, text, attachments, replyToHeader, normalizedHeaders }) {
  const resendConfig = emailConfig?.resend || {};
  if (!resendConfig.apiKey || !resendConfig.fromEmail) {
    throw new Error('Incomplete Resend configuration');
  }

  if (resendConfig.fromEmail === 'onboarding@resend.dev') {
    throw new Error(
      'Email non envoyé : le domaine expéditeur est encore onboarding@resend.dev (domaine de test Resend). '
      + 'Configurez un domaine vérifié dans Paramètres → Intégrations → Email.'
    );
  }

  const from = resendConfig.fromName
    ? `${resendConfig.fromName} <${resendConfig.fromEmail}>`
    : resendConfig.fromEmail;
  const payload = {
    from,
    to,
    subject,
    html,
    text: text || htmlToText(html),
  };

  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments;
  }
  if (replyToHeader) {
    payload.reply_to = replyToHeader;
  }
  if (Object.keys(normalizedHeaders).length > 0) {
    payload.headers = normalizedHeaders;
  }

  return { apiKey: resendConfig.apiKey, payload, fromEmail: resendConfig.fromEmail, fromName: resendConfig.fromName };
}

async function sendViaResend(emailConfig, input) {
  const { apiKey, payload } = buildResendPayload({ emailConfig, ...input });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Resend API failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (_) {
      // Keep the fallback message.
    }
    throw new Error(message);
  }

  const result = await response.json();
  return {
    provider: 'resend',
    messageId: result.id || result.data?.id || null,
    providerThreadId: result.thread_id || result.threadId || result.data?.thread_id || null,
    message: 'Email envoyé avec succès via Resend',
  };
}

async function sendViaGmail(emailConfig, input) {
  const gmailConfig = emailConfig?.gmail || {};
  if (!gmailConfig.clientId || !gmailConfig.clientSecret || !gmailConfig.refreshToken || !gmailConfig.fromEmail) {
    throw new Error('Incomplete Gmail configuration');
  }

  const { google } = await import('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    gmailConfig.clientId,
    gmailConfig.clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: gmailConfig.refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const fromHeader = gmailConfig.fromName
    ? `${gmailConfig.fromName} <${gmailConfig.fromEmail}>`
    : gmailConfig.fromEmail;
  const message = buildGmailMimeMessage({ fromHeader, ...input });

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return {
    provider: 'gmail',
    messageId: result.data.id,
    providerThreadId: result.data.threadId,
    message: 'Email envoyé avec succès via Gmail',
  };
}

async function sendEmailWithProvider(emailConfig, provider, input) {
  if (provider === 'gmail') {
    return sendViaGmail(emailConfig, input);
  }
  return sendViaResend(emailConfig, input);
}

async function sendEmailWithConfig(emailConfig, {
  to,
  subject,
  html,
  text,
  attachments = [],
  replyTo,
  replyToName,
  headers,
}, options = {}) {
  const replyToHeader = buildReplyToHeader(replyTo, replyToName);
  const normalizedHeaders = normalizeHeaders(headers);
  const primaryProvider = emailConfig?.provider || 'resend';
  const fallbackProvider = emailConfig?.deliveryFallback?.enabled === true
    && emailConfig.deliveryFallback.provider
    && emailConfig.deliveryFallback.provider !== primaryProvider
    ? emailConfig.deliveryFallback.provider
    : null;
  const attemptedProviders = [];
  const sender = options.sendEmailWithProvider || sendEmailWithProvider;
  const input = {
    to,
    subject,
    html,
    text,
    attachments,
    replyToHeader,
    normalizedHeaders,
  };

  try {
    const result = await sender(emailConfig, primaryProvider, input);
    attemptedProviders.push({ provider: primaryProvider, status: 'sent', messageId: result.messageId || null });
    return {
      ...result,
      fallbackUsed: false,
      attemptedProviders,
      primaryProvider,
      fallbackProvider: null,
    };
  } catch (primaryError) {
    attemptedProviders.push({ provider: primaryProvider, status: 'failed', error: primaryError.message || String(primaryError) });

    if (!fallbackProvider) {
      primaryError.attemptedProviders = attemptedProviders;
      throw primaryError;
    }

    try {
      const result = await sender(emailConfig, fallbackProvider, input);
      attemptedProviders.push({ provider: fallbackProvider, status: 'sent', messageId: result.messageId || null });
      return {
        ...result,
        message: `${result.message} (fallback après échec ${primaryProvider})`,
        fallbackUsed: true,
        primaryProvider,
        fallbackProvider,
        primaryError: primaryError.message || String(primaryError),
        attemptedProviders,
      };
    } catch (fallbackError) {
      attemptedProviders.push({ provider: fallbackProvider, status: 'failed', error: fallbackError.message || String(fallbackError) });
      fallbackError.message = `${primaryProvider}: ${primaryError.message || primaryError}; ${fallbackProvider}: ${fallbackError.message || fallbackError}`;
      fallbackError.attemptedProviders = attemptedProviders;
      throw fallbackError;
    }
  }
}

module.exports = {
  buildGmailMimeMessage,
  buildReplyToHeader,
  normalizeHeaders,
  sendEmailWithConfig,
  sendEmailWithProvider,
};

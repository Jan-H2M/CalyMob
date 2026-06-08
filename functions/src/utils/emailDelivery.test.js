const {
  buildGmailMimeMessage,
  buildReplyToHeader,
  normalizeHeaders,
  sendEmailWithConfig,
} = require('./emailDelivery');

describe('emailDelivery helper', () => {
  it('builds Reply-To headers and normalizes custom headers', () => {
    expect(buildReplyToHeader('reply@example.com', 'Calypso')).toBe('Calypso <reply@example.com>');
    expect(normalizeHeaders({
      'X-Test': 'ok\r\nbad',
      Empty: '',
      Count: 123,
    })).toEqual({ 'X-Test': 'ok bad' });
  });

  it('falls back to the configured secondary provider', async () => {
    const sendEmailWithProvider = jest.fn(async (_config, provider) => {
      if (provider === 'gmail') {
        throw new Error('Incomplete Gmail configuration');
      }
      return {
        provider,
        messageId: 'resend-1',
        message: 'sent',
      };
    });

    const result = await sendEmailWithConfig({
      provider: 'gmail',
      deliveryFallback: {
        enabled: true,
        provider: 'resend',
      },
      resend: {
        apiKey: 'rk_test',
        fromEmail: 'compta@caly.club',
      },
    }, {
      to: 'jan@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    }, { sendEmailWithProvider });

    expect(result.provider).toBe('resend');
    expect(result.fallbackUsed).toBe(true);
    expect(result.primaryProvider).toBe('gmail');
    expect(result.fallbackProvider).toBe('resend');
    expect(result.attemptedProviders).toEqual([
      { provider: 'gmail', status: 'failed', error: 'Incomplete Gmail configuration' },
      { provider: 'resend', status: 'sent', messageId: 'resend-1' },
    ]);
  });

  it('builds Gmail MIME with inline base64 attachments', () => {
    const message = buildGmailMimeMessage({
      fromHeader: 'CalyMob <events@caly.club>',
      to: 'member@example.com',
      subject: 'QR paiement',
      html: '<p>Scan <img src="cid:qrcode"></p>',
      replyToHeader: 'Reply <reply+abc@caly.club>',
      normalizedHeaders: { 'X-CalyMob-Test': 'yes' },
      attachments: [
        {
          filename: 'qrcode.png',
          content: 'data:image/png;base64,QUJD',
          content_id: 'qrcode',
        },
      ],
    });

    expect(message).toContain('Content-Type: multipart/related; boundary="');
    expect(message).toContain('Reply-To: Reply <reply+abc@caly.club>');
    expect(message).toContain('X-CalyMob-Test: yes');
    expect(message).toContain('Content-Type: image/png; name="qrcode.png"');
    expect(message).toContain('Content-ID: <qrcode>');
    expect(message).toContain('Content-Disposition: inline; filename="qrcode.png"');
    expect(message).toContain('\r\n\r\n<p>Scan <img src="cid:qrcode"></p>');
    expect(message).toContain('\r\nQUJD');
  });
});

jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
    },
  },
}));

const {
  buildEmailRouting,
  logEmailHistoryAndCommunication,
  renderCommunicationTemplate,
  resolveCommunicationTemplate,
} = require('./communicationTemplates');

function buildTemplateDb(docs) {
  const get = jest.fn(async () => ({
    docs: docs.map((data, index) => ({
      id: data.id || `template-${index + 1}`,
      data: () => data,
    })),
  }));

  const queryCollection = {
    where: jest.fn(() => queryCollection),
    get,
  };

  return {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => queryCollection),
      })),
    })),
    get,
    queryCollection,
  };
}

function buildLoggingDb() {
  const emailHistoryAdd = jest.fn(async () => ({ id: 'history-1' }));
  const communicationAdd = jest.fn(async () => ({ id: 'entry-1' }));
  const replyRouteSet = jest.fn(async () => undefined);

  const clubDocument = {
    collection: jest.fn((name) => {
      if (name === 'email_history') return { add: emailHistoryAdd };
      if (name === 'communication_entries') return { add: communicationAdd };
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  const clubsCollection = {
    doc: jest.fn(() => clubDocument),
  };

  return {
    collection: jest.fn((name) => {
      if (name === 'email_reply_routes') {
        return { doc: jest.fn(() => ({ set: replyRouteSet })) };
      }
      if (name !== 'clubs') throw new Error(`Unexpected root collection ${name}`);
      return clubsCollection;
    }),
    emailHistoryAdd,
    communicationAdd,
    replyRouteSet,
  };
}

describe('communicationTemplates Cloud Functions helper', () => {
  it('prefers a default active Firestore template', async () => {
    const db = buildTemplateDb([
      {
        id: 'template-a',
        emailType: 'expense_submitted',
        name: 'A',
        subject: 'A',
        htmlContent: '<p>A</p>',
        isActive: true,
      },
      {
        id: 'template-b',
        emailType: 'expense_submitted',
        name: 'B',
        subject: 'B',
        htmlContent: '<p>B</p>',
        isActive: true,
        isDefault: true,
      },
    ]);

    const result = await resolveCommunicationTemplate(db, 'club-1', 'expense_submitted');

    expect(result.source).toBe('default');
    expect(result.template.id).toBe('template-b');
  });

  it('uses a system seed when no active template exists', async () => {
    const db = buildTemplateDb([]);

    const result = await resolveCommunicationTemplate(db, 'club-1', 'expense_submitted');
    const rendered = renderCommunicationTemplate(result.template, {
      recipientName: 'Jan',
      description: 'Rochefontaine',
      montant: '110.00',
      dateDepense: '07/06/2026',
      clubName: 'Calypso',
      appUrl: 'https://caly.club',
    });

    expect(result.source).toBe('system_seed');
    expect(rendered.subject).toContain('Rochefontaine');
    expect(rendered.html).toContain('Jan');
  });

  it('renders the event payment reminder system seed', async () => {
    const db = buildTemplateDb([]);

    const result = await resolveCommunicationTemplate(db, 'club-1', 'event_payment_reminder');
    const rendered = renderCommunicationTemplate(result.template, {
      recipientName: 'Administrateur',
      clubName: 'Calypso',
      draftsCount: 1,
      drafts: [{
        title: 'Rochefontaine',
        date: '07/06/2026',
        qrCount: 4,
        surPlaceCount: 1,
        url: 'https://caly.club/operations?selectedId=op-1',
      }],
    });

    expect(result.source).toBe('system_seed');
    expect(rendered.subject).toContain('1');
    expect(rendered.html).toContain('Rochefontaine');
    expect(rendered.html).toContain('https://caly.club/operations?selectedId&#x3D;op-1');
  });

  it('logs email history and linked communication entry', async () => {
    const db = buildLoggingDb();
    const routing = buildEmailRouting({
      domain: { inboundDomain: 'caly.club' },
      inbound: { replyLocalPart: 'reply' },
    }, {
      clubId: 'club-1',
      entityType: 'expense_claim',
      entityId: 'expense-1',
      entityLabel: 'Rochefontaine',
      recipientEmail: 'jan@example.com',
      recipientName: 'Jan',
    });

    const historyId = await logEmailHistoryAndCommunication(db, 'club-1', {
      recipientEmail: 'jan@example.com',
      recipientName: 'Jan',
      recipientId: 'member-1',
      demandeId: 'expense-1',
      entityType: 'expense_claim',
      entityId: 'expense-1',
      entityLabel: 'Rochefontaine',
      emailType: 'expense_submitted',
      subject: 'Note de frais enregistrée',
      htmlContent: '<p>Bonjour Jan</p>',
      status: 'sent',
      messageId: 'resend-1',
      provider: 'resend',
      replyKey: routing.replyKey,
      replyToAddress: routing.replyToAddress,
      sendType: 'expense_notification',
    });

    expect(historyId).toBe('history-1');
    expect(routing.replyToAddress).toMatch(/^reply\+club-1\.expense_claim\.expense-1\.[a-f0-9]+@caly\.club$/);
    expect(db.emailHistoryAdd).toHaveBeenCalledWith(expect.objectContaining({
      clubId: 'club-1',
      recipientEmail: 'jan@example.com',
      status: 'sent',
      replyKey: routing.replyKey,
      replyToAddress: routing.replyToAddress,
    }));
    expect(db.communicationAdd).toHaveBeenCalledWith(expect.objectContaining({
      club_id: 'club-1',
      entity_type: 'expense_claim',
      entity_id: 'expense-1',
      source_history_id: 'history-1',
      provider_message_id: 'resend-1',
      reply_key: routing.replyKey,
      reply_to_address: routing.replyToAddress,
      body_preview: 'Bonjour Jan',
    }));
    expect(db.replyRouteSet).toHaveBeenCalledWith(expect.objectContaining({
      reply_key: routing.replyKey,
      club_id: 'club-1',
      entity_type: 'expense_claim',
      entity_id: 'expense-1',
      source_history_id: 'history-1',
      provider_message_id: 'resend-1',
      reply_to_address: routing.replyToAddress,
    }), { merge: true });
  });
});

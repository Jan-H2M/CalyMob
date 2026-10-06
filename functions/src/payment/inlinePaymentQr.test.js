jest.mock('../utils/emailDelivery', () => ({
  sendEmailWithConfig: jest.fn(),
}));

jest.mock('../utils/communicationTemplates', () => {
  const actual = jest.requireActual('../utils/communicationTemplates');
  return {
    ...actual,
    logEmailHistoryAndCommunication: jest.fn(async () => 'history-1'),
  };
});

const { sendEmailWithConfig } = require('../utils/emailDelivery');
const {
  logEmailHistoryAndCommunication,
} = require('../utils/communicationTemplates');
const { sendBoutiqueOrderEmail } = require('../boutique/createOrder');
const { sendCotisationPaymentEmail } = require('../cotisations/createPayment');

function snapshot(data) {
  return {
    exists: true,
    data: () => data,
  };
}

function buildClubRef() {
  const emptyTemplateQuery = {
    where: jest.fn(() => emptyTemplateQuery),
    get: jest.fn(async () => ({ docs: [] })),
  };
  const firestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => emptyTemplateQuery),
      })),
    })),
  };
  const settings = {
    email_config: {
      provider: 'resend',
      resend: {
        apiKey: 'test-key',
        fromEmail: 'noreply@example.test',
        fromName: 'Calypso',
      },
    },
    general: {
      clubName: 'Calypso Diving Club',
      logoUrl: '',
    },
  };

  return {
    firestore,
    collection: jest.fn((name) => {
      if (name !== 'settings') throw new Error(`Unexpected collection ${name}`);
      return {
        doc: jest.fn((id) => ({
          get: jest.fn(async () => snapshot(settings[id] || {})),
        })),
      };
    }),
  };
}

describe('inline payment QR email payloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendEmailWithConfig.mockResolvedValue({
      provider: 'resend',
      messageId: 'message-1',
      fallbackUsed: false,
      primaryProvider: 'resend',
    });
  });

  it('passes an inline CID image and matching attachment for Boutique payments', async () => {
    const orderRef = {
      id: 'order-1',
      update: jest.fn(async () => undefined),
    };

    await sendBoutiqueOrderEmail({
      clubRef: buildClubRef(),
      clubId: 'calypso',
      orderRef,
      order: {
        orderNumber: 'BTQ-2026-0100',
        buyer: { displayName: 'Jan', email: 'jan@example.test' },
        payment: {
          amount: 43,
          communication: '+++BTQ-2026-0100+++',
          qrCodeUrl: 'data:image/png;base64,qr-bytes',
        },
        items: [{ qty: 2, productSnapshot: { name: 'Bonnet Calypso' } }],
      },
    });

    expect(sendEmailWithConfig).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        html: expect.stringContaining('src="cid:qrcode"'),
        attachments: [{
          filename: 'boutique-qrcode.png',
          content: 'qr-bytes',
          content_id: 'qrcode',
        }],
      }),
    );
    expect(logEmailHistoryAndCommunication).toHaveBeenCalledTimes(1);
  });

  it('passes an inline CID image and matching attachment for membership payments', async () => {
    const paymentRef = {
      id: 'payment-1',
      update: jest.fn(async () => undefined),
    };

    await sendCotisationPaymentEmail({
      clubRef: buildClubRef(),
      clubId: 'calypso',
      member: { email: 'jan@example.test' },
      displayName: 'Jan',
      paymentRef,
      season: { label: '2026–2027', start_year: 2026 },
      period: 'jan_dec',
      tariff: { label: 'Membre première année' },
      amount: 150,
      communication: '+++COT-2026-JAN-AND-ID12345+++',
      bankSettings: {
        iban: 'BE26210016070629',
        beneficiary: 'Calypso Diving Club ASBL',
      },
      qrDataUrl: 'data:image/png;base64,qr-bytes',
    });

    expect(sendEmailWithConfig).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        html: expect.stringContaining('src="cid:qrcode"'),
        attachments: [{
          filename: 'cotisation-qrcode.png',
          content: 'qr-bytes',
          content_id: 'qrcode',
        }],
      }),
    );
    expect(logEmailHistoryAndCommunication).toHaveBeenCalledTimes(1);
  });
});

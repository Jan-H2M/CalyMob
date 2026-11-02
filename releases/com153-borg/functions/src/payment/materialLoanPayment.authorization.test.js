jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => 'server-time') },
  }),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,ZmljdGlvbmFs') }));
jest.mock('../utils/emailDelivery', () => ({
  sendEmailWithConfig: jest.fn(async () => ({ provider: 'test', messageId: 'fictional-message' })),
}));
jest.mock('../utils/communicationTemplates', () => ({
  buildEmailRouting: jest.fn(() => ({ headers: {} })),
  logEmailHistoryAndCommunication: jest.fn(async () => {}),
}));

const admin = require('firebase-admin');
const QRCode = require('qrcode');
const { sendEmailWithConfig } = require('../utils/emailDelivery');
const { logEmailHistoryAndCommunication } = require('../utils/communicationTemplates');
const { getMaterialLoanPaymentQr, sendMaterialLoanPaymentQrEmail } = require('./materialLoanPayment');

const clubId = 'fictional-club';
const prefix = `clubs/${clubId}`;
const callerPath = `${prefix}/members/operator`;

function fixture(caller) {
  const documents = new Map([
    [callerPath, caller],
    [`${prefix}/inventory_loans/loan`, {
      memberId: 'borrower', loanNumber: 'PRET-FICTIF', caution_amount: 100,
      caution_reference: 'FICTIF-NON-PAYABLE', statut: 'attente_caution',
    }],
    [`${prefix}/members/borrower`, { prenom: 'Fictional', email: 'borrower@example.invalid' }],
    [`${prefix}/settings/bank`, { beneficiaryName: 'Fictional club', iban: 'FICTIF-NON-PAYABLE' }],
    [`${prefix}/settings/general`, { clubName: 'Fictional club' }],
    [`${prefix}/settings/email_config`, {
      provider: 'resend', resend: { fromEmail: 'club@example.invalid', apiKey: 'fictional-test-value' },
    }],
  ]);
  const reads = [];
  const writes = jest.fn(async () => {});
  function collection(path) {
    return {
      add: data => writes(path, data),
      doc(id) {
        const fullPath = `${path}/${id}`;
        const ref = {
          collection: name => collection(`${fullPath}/${name}`),
          update: data => writes(fullPath, data),
          async get() {
            reads.push(fullPath);
            return { id, ref, exists: documents.get(fullPath) !== undefined, data: () => documents.get(fullPath) };
          },
        };
        return ref;
      },
    };
  }
  admin.firestore.mockReturnValue({ collection });
  return { reads, writes, documents };
}

const deniedMembers = [
  ['missing member', undefined],
  ['no roles', {}],
  ...['admin', 'superadmin', 'validateur', 'user', 'membre'].map(app_role => [app_role, { app_role }]),
  ['legacy appRole admin', { appRole: 'admin' }],
  ['legacy appRole superadmin', { appRole: 'superadmin' }],
  ...['Encadrant', 'encadrants', 'E', 'CA', 'comite', 'comité', 'Accueil', 'Boutique', 'membre']
    .map(role => [role, { clubStatuten: [role] }]),
  ['admin with CA and Encadrant', { app_role: 'admin', clubStatuten: ['CA', 'Encadrant'] }],
  ['malformed string badge', { clubStatuten: 'G' }],
  ['malformed object badge', { clubStatuten: { G: true } }],
  ['null badges', { clubStatuten: null }],
];

describe.each([
  ['borg QR', getMaterialLoanPaymentQr],
  ['borg mail', sendMaterialLoanPaymentQrEmail],
])('%s authorization', (_name, callable) => {
  beforeEach(() => jest.clearAllMocks());

  test.each(deniedMembers)('denies %s before loan/bank reads or side effects', async (_label, member) => {
    const { reads, writes } = fixture(member);
    await expect(callable({
      auth: { uid: 'operator', token: { app_role: 'superadmin', clubStatuten: ['G'] } },
      data: { clubId, loanId: 'loan', clubStatuten: ['G'], app_role: 'superadmin' },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(reads).toEqual([callerPath]);
    expect(writes).not.toHaveBeenCalled();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(sendEmailWithConfig).not.toHaveBeenCalled();
    expect(logEmailHistoryAndCommunication).not.toHaveBeenCalled();
  });

  test('requires authentication before reading any documents', async () => {
    const { reads, writes } = fixture({ clubStatuten: ['G'] });
    await expect(callable({ data: { clubId, loanId: 'loan' } }))
      .rejects.toMatchObject({ code: 'unauthenticated' });
    expect(reads).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
    expect(sendEmailWithConfig).not.toHaveBeenCalled();
  });

  test('requires Gonflage membership in the requested club', async () => {
    const { reads, writes } = fixture({ clubStatuten: ['G'] });
    await expect(callable({ auth: { uid: 'operator' }, data: { clubId: 'other-club', loanId: 'loan' } }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(reads).toEqual(['clubs/other-club/members/operator']);
    expect(writes).not.toHaveBeenCalled();
    expect(sendEmailWithConfig).not.toHaveBeenCalled();
  });

  test.each(['G', 'g', 'Gonflage', 'gOnFlAgE', ' G '])('allows the %s badge', async role => {
    const { reads, writes } = fixture({ clubStatuten: [role] });
    const result = await callable({ auth: { uid: 'operator' }, data: { clubId, loanId: 'loan' } });
    expect(result).toMatchObject({ success: true, loanNumber: 'PRET-FICTIF' });
    expect(reads[0]).toBe(callerPath);
    if (callable === getMaterialLoanPaymentQr) {
      expect(result).toMatchObject({ amount: 100, reference: 'FICTIF-NON-PAYABLE' });
      expect(writes).not.toHaveBeenCalled();
      expect(sendEmailWithConfig).not.toHaveBeenCalled();
    } else {
      expect(sendEmailWithConfig).toHaveBeenCalledTimes(1);
      expect(sendEmailWithConfig).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        to: 'borrower@example.invalid',
      }));
      expect(writes).toHaveBeenCalledWith(`${prefix}/inventory_loans/loan`, expect.objectContaining({
        caution_payment_status: 'email_sent',
      }));
    }
  });

  test('allows an admin who also has the Gonflage badge', async () => {
    fixture({ app_role: 'admin', clubStatuten: ['CA', 'G'] });
    await expect(callable({ auth: { uid: 'operator' }, data: { clubId, loanId: 'loan' } }))
      .resolves.toMatchObject({ success: true });
  });
});

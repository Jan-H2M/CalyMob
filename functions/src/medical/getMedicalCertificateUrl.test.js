jest.mock('firebase-admin', () => ({
  firestore: jest.fn(),
  storage: jest.fn(),
}));

const admin = require('firebase-admin');
const { getMedicalCertificateUrl } = require('./getMedicalCertificateUrl');

const prefix = 'clubs/test-club/members/owner/medical_certificates';
const filePath = `${prefix}/certificat_123.pdf`;
const certificatePath = `${prefix}/cert-1`;
const data = { clubId: 'test-club', memberId: 'owner', certificateId: 'cert-1' };
const owner = { uid: 'owner' };
const reviewer = { uid: 'reviewer' };

let records;
let read;
let sign;
let file;

beforeEach(() => {
  jest.clearAllMocks();
  records = new Map([[certificatePath, { document_path: filePath }]]);
  read = jest.fn(async (path) => ({
    exists: records.has(path),
    get: (field) => records.get(path)?.[field],
  }));
  const ref = (path = '') => ({
    id: path.split('/').at(-1),
    collection: (id) => ref(path ? `${path}/${id}` : id),
    doc: (id) => ref(`${path}/${id}`),
    get: () => read(path),
  });
  admin.firestore.mockReturnValue(ref());

  sign = jest.fn(async () => ['https://example.test/short-lived']);
  file = jest.fn(() => ({ getSignedUrl: sign }));
  admin.storage.mockReturnValue({ bucket: () => ({ file }) });
});

test('rejects unauthenticated and unrelated members before looking up the certificate', async () => {
  await expect(getMedicalCertificateUrl.run({ data })).rejects.toHaveProperty('code', 'unauthenticated');
  await expect(getMedicalCertificateUrl.run({ auth: reviewer, data }))
    .rejects.toHaveProperty('code', 'permission-denied');
  expect(read.mock.calls).toEqual([['clubs/test-club/members/reviewer']]);
  expect(sign).not.toHaveBeenCalled();
});

test.each([
  { clubId: 'other-club', app_role: 'admin' },
  { clubId: 'test-club', app_role: 'member', role: 'admin' },
  { clubId: 'test-club', app_role: 'superadmin' },
])('rejects a role that does not grant review rights in the requested club', async (token) => {
  await expect(getMedicalCertificateUrl.run({ auth: { ...reviewer, token }, data }))
    .rejects.toHaveProperty('code', 'permission-denied');
  expect(sign).not.toHaveBeenCalled();
});

test('owner receives a read-only signed URL with a 10-minute expiration', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1795518000000);
  try {
    await expect(getMedicalCertificateUrl.run({ auth: owner, data: { ...data, storagePath: 'ignored' } }))
      .resolves.toEqual({ url: 'https://example.test/short-lived' });
    expect(file).toHaveBeenCalledWith(filePath);
    expect(sign).toHaveBeenCalledWith({
      version: 'v4', action: 'read', expires: 1795518600000,
    });
  } finally {
    now.mockRestore();
  }
});

test('allows a reviewer authorized via the member document or a same-club claim', async () => {
  records.set('clubs/test-club/members/reviewer', { app_role: 'admin' });
  await expect(getMedicalCertificateUrl.run({ auth: reviewer, data })).resolves.toHaveProperty('url');
  records.delete('clubs/test-club/members/reviewer');
  await expect(getMedicalCertificateUrl.run({
    auth: { ...reviewer, token: { clubId: 'test-club', role: 'admin' } }, data,
  })).resolves.toHaveProperty('url');
});

test.each([
  [{ certificateId: 'a/b' }, 'invalid-argument'],
  [{ memberId: '../owner' }, 'invalid-argument'],
  [{ clubId: 'test-club/other' }, 'invalid-argument'],
  [{ certificateId: 'does-not-exist' }, 'not-found'],
])('rejects unsupported input or an absent certificate', async (values, code) => {
  await expect(getMedicalCertificateUrl.run({ auth: owner, data: { ...data, ...values } }))
    .rejects.toHaveProperty('code', code);
  expect(sign).not.toHaveBeenCalled();
});

test.each([
  undefined,
  'clubs/test-club/members/another-member/medical_certificates/cert.pdf',
  'clubs/test-club/members/owner/documents/cert.pdf',
  `${prefix}/../secret.pdf`,
  `gs://other-bucket/${filePath}`,
  `${prefix}/data%2Fsecret.pdf`,
])('never signs a missing or out-of-scope stored path', async (path) => {
  records.set(certificatePath, { document_path: path, document_url: 'https://example.test/legacy' });
  await expect(getMedicalCertificateUrl.run({ auth: owner, data }))
    .rejects.toHaveProperty('code', 'failed-precondition');
  expect(sign).not.toHaveBeenCalled();
});

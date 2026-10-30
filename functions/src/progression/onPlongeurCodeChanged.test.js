jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentUpdated: (_o, fn) => fn }));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' } }));
const admin = require('firebase-admin');
const { handlePlongeurCodeChanged } = require('./onPlongeurCodeChanged');

test.each([true, false])('official marker suppresses duplicate history only with matching server audit: %s', async valid => {
  const writes = [];
  const ref = path => ({ id: 'auto', collection: name => col(`${path}/${name}`),
    get: async () => ({ exists: valid, data: () => ({ source: 'calycompta_member_formation', memberId: 'synthetic', requested: { kind: 'brevet' }, before: { level: '2' }, after: { level: '3' } }) }),
    set: async data => writes.push(data) });
  const col = path => ({ doc: id => ref(`${path}/${id || 'auto'}`) });
  admin.firestore.mockReturnValue({ collection: col });
  await handlePlongeurCodeChanged({ params: { clubId: 'synthetic', memberId: 'synthetic' },
    data: { before: { data: () => ({ plongeur_code: '2' }) }, after: { data: () => ({ plongeur_code: '3', formation_official_operation: 'op1' }) } } });
  expect(writes.length).toBe(valid ? 0 : 1);
});

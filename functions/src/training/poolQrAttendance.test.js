const { mayScan } = require('./poolQrAttendance');
test.each(['Membre', 'MC', 'AM', '', 'G'])('ordinary/non-scanner function %s cannot create trusted attendance', role => {
  expect(mayScan({ member_status: 'active', app_role: 'user', clubStatuten: [role] })).toBe(false);
});
test.each(['Accueil', 'Encadrant', 'Encadrants et assistants', 'CA'])('active existing scanner function %s remains authorized', role => {
  expect(mayScan({ member_status: 'active', clubStatuten: [role] })).toBe(true);
});
test('inactive scanners/admins fail closed and legacy default is explicit', () => {
  expect(mayScan({ member_status: 'inactive', app_role: 'admin' })).toBe(false);
  expect(mayScan({ member_status: 'active', fonctionDefaut: 'Accueil' })).toBe(true);
  expect(mayScan({ member_status: 'active', clubStatuten: 'Accueil' })).toBe(false);
});

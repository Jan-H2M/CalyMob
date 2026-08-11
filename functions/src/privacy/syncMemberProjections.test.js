jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TIMESTAMP__' },
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_options, handler) => handler,
}));

const {
  buildMemberDirectoryProjection,
  buildOperationalStatusProjection,
} = require('./syncMemberProjections');

describe('member privacy projections', () => {
  test('directory only includes consented contact and photo fields', () => {
    const projected = buildMemberDirectoryProjection({
      prenom: 'Myriam',
      nom: 'Exemple',
      email: 'private@example.test',
      phone_number: '+3200000000',
      photo_url: 'https://example.test/private.jpg',
      share_email: false,
      share_phone: true,
      consent_internal_photo: false,
      plongeur_code: '2*',
      clubStatuten: ['encadrant'],
      iban: 'BE00 PRIVATE',
      certificat_medical_validite: 'private',
      address_street: 'private',
      fcm_token: 'private',
    });

    expect(projected.email).toBeNull();
    expect(projected.phone_number).toBe('+3200000000');
    expect(projected.photo_url).toBeNull();
    expect(projected).not.toHaveProperty('iban');
    expect(projected).not.toHaveProperty('certificat_medical_validite');
    expect(projected).not.toHaveProperty('address_street');
    expect(projected).not.toHaveProperty('fcm_token');
  });

  test('contact sharing is opt-in in the projection', () => {
    const projected = buildMemberDirectoryProjection({
      prenom: 'Jean',
      nom: 'Plongeur',
      email: 'jean@example.test',
      phone_number: '123',
      photo_url: 'photo',
    });
    expect(projected.share_email).toBe(false);
    expect(projected.share_phone).toBe(false);
    expect(projected.email).toBeNull();
    expect(projected.phone_number).toBeNull();
    expect(projected.photo_url).toBeNull();
  });

  test('operational projection contains status fields but no identity or finance data', () => {
    const projected = buildOperationalStatusProjection({
      cotisation_validite: 'membership-date',
      certificat_medical_validite: 'medical-date',
      assurance_validite: 'insurance-date',
      email: 'private@example.test',
      iban: 'BE00 PRIVATE',
    });
    expect(projected.cotisation_validite).toBe('membership-date');
    expect(projected.certificat_medical_validite).toBe('medical-date');
    expect(projected).not.toHaveProperty('email');
    expect(projected).not.toHaveProperty('iban');
  });

  test('canonical inactive status wins over stale active legacy fields', () => {
    const projected = buildOperationalStatusProjection({
      member_status: 'inactive',
      app_status: 'active',
      isActive: true,
      actif: true,
    });
    expect(projected.member_status).toBe('inactive');
  });
});

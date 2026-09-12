const { computeCustomizations } = require('./createOrder');

function product({ pricingMode = 'fixed' } = {}) {
  return {
    embroidery: {
      enabled: true,
      technique: 'embroidery',
      baseType: 'polo',
      clubLogo: {
        enabled: true,
        zones: ['chest_left', 'back'],
        surcharge: 2,
      },
      name: {
        enabled: true,
        zones: ['chest_right'],
        surcharge: 1,
        pricingMode,
        pricePerCharacter: 0.5,
        fixedPrice: 4,
        maxLength: 12,
      },
      certification: {
        enabled: true,
        zones: ['sleeve_left'],
        surcharge: 3,
        allowedValues: ['P1', 'P2'],
      },
    },
  };
}

describe('boutique customization contract', () => {
  test.each([
    ['missing', undefined],
    ['disabled', { clubLogo: { enabled: false } }],
    ['stale zone', { clubLogo: { enabled: true, zone: 'old_zone' } }],
  ])('canonicalizes a %s required club logo', (_label, raw) => {
    const result = computeCustomizations(product(), raw);

    expect(result.customizations.clubLogo).toEqual({
      enabled: true,
      zone: 'chest_left',
      surcharge: 2,
    });
    expect(result.surcharge).toBe(2);
  });

  test('fixed name price is identical for one and many letters', () => {
    const one = computeCustomizations(product(), {
      name: { text: 'A', zone: 'chest_right' },
    });
    const many = computeCustomizations(product(), {
      name: { text: 'ABCDEFGHIJK', zone: 'chest_right' },
    });

    expect(one.surcharge).toBe(7);
    expect(many.surcharge).toBe(7);
    expect(one.customizations.name).toMatchObject({
      pricingMode: 'fixed',
      fixedPrice: 4,
      surcharge: 5,
    });
  });

  test('legacy per-character name price remains length based', () => {
    const one = computeCustomizations(product({ pricingMode: 'per_character' }), {
      name: { text: 'A', zone: 'chest_right' },
    });
    const many = computeCustomizations(product({ pricingMode: 'per_character' }), {
      name: { text: 'ABCD', zone: 'chest_right' },
    });

    expect(one.surcharge).toBe(3.5);
    expect(many.surcharge).toBe(5);
    expect(many.customizations.name.pricingMode).toBe('per_character');
  });
});

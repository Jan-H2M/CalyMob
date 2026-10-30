const { buildBuyerFromMember, computeCustomizations } = require('./createOrder');

describe('boutique buyer identity contract', () => {
  test('uses only the authenticated member record for identity fields', () => {
    expect(buildBuyerFromMember({
      email: ' server@example.test ',
      prenom: 'Ada',
      nom: 'Lovelace',
      phoneNumber: ' +32 470 00 00 00 ',
    }, 'auth-uid', 'member-doc')).toEqual({
      userId: 'auth-uid',
      memberId: 'member-doc',
      displayName: 'Ada Lovelace',
      email: 'server@example.test',
      phone: '+32 470 00 00 00',
    });
  });

  test.each([
    [{ displayName: 'Ada' }, 'member.email'],
    [{ email: 'ada@example.test' }, 'member.displayName'],
  ])('rejects an incomplete canonical member profile', (member, missing) => {
    try {
      buildBuyerFromMember(member, 'auth-uid');
      throw new Error('expected canonical member validation to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        details: { missing },
      });
    }
  });
});

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
  test('MOB-052 reproduces and preserves buyer-selected thread colours without price changes', () => {
    const p=product();
    p.embroidery.name.allowedColors=['Rouge','Bleu'];
    p.embroidery.name.color='Rouge';
    p.embroidery.certification.allowedColors=['Blanc','Or'];
    const selected=computeCustomizations(p,{name:{text:'FICTIF',zone:'chest_right',color:'bleu'},
      certification:{value:'P2',zone:'sleeve_left',color:'Or'}});
    expect(selected.customizations.name.color).toBe('Bleu');
    expect(selected.customizations.certification.color).toBe('Or');
    expect(selected.surcharge).toBe(10);
    expect(computeCustomizations(p,{name:{text:'FICTIF',zone:'chest_right'}}).customizations.name.color).toBe('Rouge');
  });
  test.each(['Vert', {}, 23, '<img>', 'A'.repeat(41)])('rejects unconfigured buyer colour %p', color=>{
    const p=product();p.embroidery.name.allowedColors=['Rouge','Bleu'];
    expect(()=>computeCustomizations(p,{name:{text:'FICTIF',zone:'chest_right',color}}))
      .toThrow();
  });
  test('keeps fixed legacy colour and rejects palette injection when choice is disabled',()=>{
    const p=product();p.embroidery.name.color='Blanc';
    expect(computeCustomizations(p,{name:{text:'A',zone:'chest_right'}}).customizations.name.color).toBe('Blanc');
    expect(()=>computeCustomizations(p,{name:{text:'A',zone:'chest_right',color:'Vert'}})).toThrow();
  });
  test.each([null,'Rouge',[''],[42],Array(17).fill('Rouge')])('rejects malformed catalogue palette %p', allowedColors=>{
    const p=product();p.embroidery.name.allowedColors=allowedColors;
    expect(()=>computeCustomizations(p,{name:{text:'A',zone:'chest_right'}})).toThrow();
  });
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

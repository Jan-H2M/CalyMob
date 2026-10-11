'use strict';

const {
  buildPoolFormationDto,
  buildPoolFormationProjection,
  hasPoolFormationAccess,
} = require('./poolFormationProjection');

describe('pool formation projection', () => {
  const fullSnapshot = {
    member_id: 'student-1',
    target_level: '2*',
    current_code: '1*',
    exercises: {
      validated: [
        { code: 'P1.EXP', description: 'Examen piscine', niveau: 'P2' },
        { code: 'P2.RA', description: 'Remontée carrière', niveau: 'P2' },
      ],
      pending: [
        { code: 'P2.EXP', description: 'Technique piscine', niveau: 'P2' },
        { code: 'P2.EXT', description: 'Examen théorique', niveau: 'P2' },
      ],
      pending_claims: [],
      remaining: [
        { code: 'P2.POOL', description: 'Parcours piscine' },
        { code: 'P2.OR', description: 'Orientation carrière' },
      ],
    },
    dive_stats: { total: 81, max_depth_meters: 42 },
    mil_experience: {
      per_requirement: { total_milieu_naturel: { have: 81, need: 60 } },
    },
    goals: { note: 'Donnée pédagogique privée' },
  };

  test('contains only pool counts and no full-formation fields', () => {
    const projection = buildPoolFormationProjection(fullSnapshot);
    expect(projection).toEqual({
      schema_version: 1,
      member_id: 'student-1',
      piscine: {
        validated: 1,
        pending: 1,
        remaining: 1,
        total: 3,
        pct: 33,
      },
    });
    expect(projection).not.toHaveProperty('exercises');
    expect(projection).not.toHaveProperty('dive_stats');
    expect(projection).not.toHaveProperty('mil_experience');
    expect(projection).not.toHaveProperty('goals');
  });

  test('callable DTO adds only consented directory identity', () => {
    const dto = buildPoolFormationDto(fullSnapshot, {
      first_name: 'Alice',
      last_name: 'Martin',
      email: 'private@example.test',
      phone_number: '+32000000000',
      consent_internal_photo: false,
      photo_url: 'https://private.invalid/photo.jpg',
    });
    expect(dto.identity).toEqual({
      first_name: 'Alice',
      last_name: 'Martin',
      photo_url: null,
      consent_internal_photo: false,
    });
    expect(dto.identity).not.toHaveProperty('email');
    expect(dto.identity).not.toHaveProperty('phone_number');
  });

  test('access requires a formation role or admin', () => {
    expect(hasPoolFormationAccess({ clubStatuten: ['Encadrant Piscine'] })).toBe(true);
    expect(hasPoolFormationAccess({ clubStatuten: ['Encadrant'], plongeur_code: 'MC' })).toBe(true);
    expect(hasPoolFormationAccess({ app_role: 'admin', clubStatuten: [] })).toBe(true);
    expect(hasPoolFormationAccess({ clubStatuten: ['Membre'] })).toBe(false);
  });
});

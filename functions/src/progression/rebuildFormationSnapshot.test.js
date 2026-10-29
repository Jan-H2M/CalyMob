/**
 * WP-09 — tests unitaires du calcul du snapshot de formation.
 *
 * On teste les fonctions PURES (pas d'I/O Firestore, pas d'émulateur).
 * Cas exigés par le PRD : « mer 50 m compte 5 lignes », tolérance
 * (18 m → prof_20m), Zélande (déco exclue), membre sans aucune donnée.
 */

const {
  computeExperienceCounts,
  computeMilExperience,
  computeDiveStats,
  groupObservationsByCode,
  computeAttentionPoints,
  targetFromExplicit,
  dossierExercises,
  targetFromCurrentCode,
  milColumnForNiveau,
} = require('./rebuildFormationSnapshot');

test('personal outdoor completion affects only the current dossier, never exams or old pending queues', () => {
  const exercises = [{ id: 'ra', code: 'P3.RA', niveau: 'P3' }, { id: 'rt', code: 'P3.RT', niveau: 'P3' },
    { id: 'ext', code: 'P3.EXT', niveau: 'P3' }, { id: 'exp', code: 'P3.EXP', niveau: 'P3' }];
  const personal = exercises.map(ex => ({ exercise_id: ex.id, exercise_code: ex.code,
    status: 'personal_done', server_verified: true, validation_mode: 'personal_only', performed_date: '2026-01-05' }));
  const result = dossierExercises(exercises,
    { validated: [{ code: 'P2.RA' }], pending: [{ code: 'P3.RA' }] }, personal,
    [{ code: 'P3.RT', status: 'submitted' }]);
  expect(result.validated.map(row => row.code)).toEqual(['P3.RA', 'P3.RT']);
  expect(result.validated.every(row => row.personal)).toBe(true);
  expect(result.pending).toEqual([]);
  expect(result.pendingClaims).toEqual([]);
  expect(result.remaining.map(row => row.code)).toEqual(['P3.EXT', 'P3.EXP']);
  expect(result.totalRequired).toBe(4);
});
test('unchecked personal item cannot erase an historical result', () => {
  const result = dossierExercises([{ id: 'ra', code: 'P3.RA', niveau: 'P3' }],
    { validated: [{ code: 'P3.RA', validator: 'Legacy monitor' }], pending: [] },
    [{ exercise_id: 'ra', exercise_code: 'P3.RA', status: 'personal_not_done', server_verified: true, validation_mode: 'personal_only' }], []);
  expect(result.validated).toEqual([{ code: 'P3.RA', validator: 'Legacy monitor' }]);
});

const RULES = {
  cumulative: true,
  tolerance_pct: 10,
  zelande: { tolerance_mer_max_40m: true, exclude_deco: true, exclude_beyond_40m: true },
};
test('star aliases share the same target and explicit failed exams retain date/status', () => {
  expect(targetFromExplicit('3★')).toBe('P3');
  const result = dossierExercises([{ id: 'ext', code: 'P3.EXT', niveau: 'P3' }],
    { validated: [], pending: [], refused: [{ code: 'P3.EXT', status: 'refused', date: '2026-01-05' }] }, [], []);
  expect(result.remaining[0]).toMatchObject({ status: 'refused', date: '2026-01-05' });
});

function dive(overrides = {}) {
  return {
    source: 'sortie',
    depth_max_meters: null,
    water_type: 'fresh',
    counters: {},
    zone: null,
    date: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('computeExperienceCounts', () => {
  test('mer 50 m (mer ouverte) compte 5 lignes mer', () => {
    const entries = [dive({ depth_max_meters: 50, counters: { mer: true } })];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.mer).toBe(1);
    expect(c.mer_30m).toBe(1);
    expect(c.mer_40m).toBe(1);
    expect(c.mer_45m).toBe(1);
    expect(c.mer_50m).toBe(1);
    // total = 5 lignes « mer », + total_milieu_naturel.
    const merLines = c.mer + c.mer_30m + c.mer_40m + c.mer_45m + c.mer_50m;
    expect(merLines).toBe(5);
    // MIL §7.4.2: sea depth experience also satisfies general depths.
    expect(c.prof_20m).toBe(1);
    expect(c.prof_30m).toBe(1);
    expect(c.prof_40m).toBe(1);
    expect(c.total_milieu_naturel).toBe(1);
  });

  test('tolérance 10 % : 18 m en eau douce compte pour prof_20m', () => {
    const entries = [dive({ depth_max_meters: 18 })];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.prof_20m).toBe(1);
    expect(c.prof_30m).toBe(0);
    expect(c.mer).toBe(0);
  });

  test('Zélande : plongée déco non comptée dans les seuils mer', () => {
    const entries = [
      dive({ depth_max_meters: 35, zone: 'zelande', counters: { mer: true, deco: true } }),
    ];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.mer).toBe(1); // reste une plongée mer
    expect(c.mer_30m).toBe(0); // déco exclue
    expect(c.mer_40m).toBe(0);
  });

  test('Zélande : tolérance mer ≤ 40 m (27 m → mer_30m)', () => {
    const entries = [
      dive({ depth_max_meters: 27, zone: 'zelande', counters: { mer: true } }),
    ];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.mer_30m).toBe(1);
    expect(c.mer_40m).toBe(0);
    expect(c.mer_45m).toBe(0); // jamais en Zélande
  });

  test('Zélande : plongée > 40 m non comptée', () => {
    const entries = [
      dive({ depth_max_meters: 45, zone: 'zelande', counters: { mer: true } }),
    ];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.mer_30m).toBe(0);
    expect(c.mer_40m).toBe(0);
  });

  test('dp_mer_deco : DP + mer + déco hors Zélande', () => {
    const entries = [
      dive({ depth_max_meters: 42, counters: { mer: true, dp: true, deco: true } }),
    ];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.dp_mer_deco).toBe(1);
  });

  test('surveillance CIEL + marée comptées', () => {
    const entries = [
      dive({ depth_max_meters: 20, counters: { mer: true, maree: true, surveillance: true } }),
    ];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.mer_maree).toBe(1);
    expect(c.surveillance_ciel).toBe(1);
  });

  test('les entrées piscine sont ignorées', () => {
    const entries = [dive({ source: 'piscine', depth_max_meters: 5 })];
    const c = computeExperienceCounts(entries, RULES);
    expect(c.total_milieu_naturel).toBe(0);
  });
});

describe('computeMilExperience', () => {
  const milReq = {
    experience_table: {
      3: { total_milieu_naturel: 75, mer: 20, encadrement: 5 },
    },
    counting_rules: RULES,
  };

  test('have/need + data_missing pour encadrement', () => {
    const entries = [
      dive({ depth_max_meters: 30, counters: { mer: true } }),
      dive({ depth_max_meters: 30, counters: { mer: true } }),
    ];
    const mil = computeMilExperience(entries, milReq, '3');
    expect(mil.per_requirement.total_milieu_naturel).toEqual({ have: 2, need: 75 });
    expect(mil.per_requirement.mer).toEqual({ have: 2, need: 20 });
    expect(mil.per_requirement.encadrement).toEqual({ have: 0, need: 5, data_missing: true });
  });

  test('module_pct exclut les lignes data_missing', () => {
    const entries = [dive({ depth_max_meters: 30, counters: { mer: true } })];
    const mil = computeMilExperience(entries, milReq, '3');
    // sumHave = min(1,75)+min(1,20) = 2 ; sumNeed = 75+20 = 95 (encadrement exclu)
    expect(mil.module_pct).toBe(Math.round((2 / 95) * 100));
  });

  test('null si pas de MIL ou niveau sans colonne', () => {
    expect(computeMilExperience([], null, '3')).toBeNull();
    expect(computeMilExperience([], milReq, null)).toBeNull();
  });
});

describe('computeDiveStats', () => {
  test('zones + compteurs + thresholds_cum', () => {
    const entries = [
      dive({ depth_max_meters: 8 }),
      dive({ depth_max_meters: 15 }),
      dive({ depth_max_meters: 25, counters: { mer: true } }),
      dive({ depth_max_meters: 35, counters: { mer: true, nuit: true } }),
      dive({ source: 'piscine', depth_max_meters: 4 }),
    ];
    const s = computeDiveStats(entries, RULES);
    expect(s.total).toBe(4); // piscine exclue
    expect(s.zones['0_10']).toBe(1);
    expect(s.zones['10_20']).toBe(1);
    expect(s.zones['20_30']).toBe(1);
    expect(s.zones['30_plus']).toBe(1);
    expect(s.mer).toBe(2);
    expect(s.nuit).toBe(1);
    expect(s.max_depth_meters).toBe(35);
    expect(s.thresholds_cum.total_milieu_naturel).toBe(4);
  });
});

describe('observations → per_code + attention_points', () => {
  test('a_revoir en dernier = point d\'attention', () => {
    const obs = [
      { category: 'exercice_lifras', exerciceCode: 'P2.VM', result: 'en_progres', contextDate: '2026-01-01' },
      { category: 'exercice_lifras', exerciceCode: 'P2.VM', result: 'a_revoir', contextDate: '2026-02-01' },
    ];
    const grouped = groupObservationsByCode(obs);
    expect(grouped.perCode['P2.VM'].attempts).toBe(2);
    expect(grouped.perCode['P2.VM'].last_result).toBe('a_revoir');
    expect(computeAttentionPoints(grouped)).toContain('P2.VM');
  });

  test('≥ 2 en_progres sans acquis = point d\'attention', () => {
    const obs = [
      { category: 'exercice_lifras', exerciceCode: 'P2.RA', result: 'en_progres', contextDate: '2026-01-01' },
      { category: 'exercice_lifras', exerciceCode: 'P2.RA', result: 'en_progres', contextDate: '2026-02-01' },
    ];
    expect(computeAttentionPoints(groupObservationsByCode(obs))).toContain('P2.RA');
  });

  test('acquis → pas de point d\'attention', () => {
    const obs = [
      { category: 'exercice_lifras', exerciceCode: 'P2.OR', result: 'en_progres', contextDate: '2026-01-01' },
      { category: 'exercice_lifras', exerciceCode: 'P2.OR', result: 'acquis', contextDate: '2026-02-01' },
    ];
    expect(computeAttentionPoints(groupObservationsByCode(obs))).not.toContain('P2.OR');
  });

  // WP-12 — critères d'acceptation dédiés.
  test('WP-12 : 2 en_progres sur P2.VM → attention chez moniteur ET élève', () => {
    const obs = [
      { category: 'exercice_lifras', exerciceCode: 'P2.VM', result: 'en_progres', contextDate: '2026-01-01' },
      { category: 'exercice_lifras', exerciceCode: 'P2.VM', result: 'en_progres', contextDate: '2026-02-01' },
    ];
    const grouped = groupObservationsByCode(obs);
    expect(grouped.perCode['P2.VM'].attempts).toBe(2); // « ×2 pratiqué »
    expect(computeAttentionPoints(grouped)).toEqual(['P2.VM']);
  });

  test('WP-12 : un acquis ultérieur retire le point d\'attention', () => {
    const before = [
      { category: 'exercice_lifras', exerciceCode: 'P2.VM', result: 'a_revoir', contextDate: '2026-01-01' },
    ];
    expect(computeAttentionPoints(groupObservationsByCode(before))).toContain('P2.VM');
    const after = [
      ...before,
      { category: 'exercice_lifras', exerciceCode: 'P2.VM', result: 'acquis', contextDate: '2026-03-01' },
    ];
    expect(computeAttentionPoints(groupObservationsByCode(after))).not.toContain('P2.VM');
  });
});

describe('membre sans aucune donnée', () => {
  test('tout est vide / zéro, aucune exception', () => {
    const c = computeExperienceCounts([], RULES);
    expect(c.total_milieu_naturel).toBe(0);
    const s = computeDiveStats([], RULES);
    expect(s.total).toBe(0);
    const grouped = groupObservationsByCode([]);
    expect(computeAttentionPoints(grouped)).toEqual([]);
  });
});

describe('mapping brevet visé', () => {
  test('target explicite et niveau courant', () => {
    expect(targetFromExplicit('2*')).toBe('P2');
    expect(targetFromCurrentCode('1*')).toBe('P2');
    expect(milColumnForNiveau('P2')).toBe('2');
    expect(milColumnForNiveau('MN')).toBeNull();
  });
});

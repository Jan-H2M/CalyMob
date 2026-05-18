/**
 * Cloud Function: analyzeLogbookDictation
 *
 * Extracts a spoken/free-typed dive log entry into structured fields.
 * The model is intentionally constrained with the caller's own logbook
 * locations and club members so it prefers existing names and returns
 * "unknown" instead of inventing places or binomes.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const DEFAULT_MODEL = process.env.LOGBOOK_DICTATION_AI_MODEL || 'gpt-5.2';
const MAX_TEXT_LENGTH = 2000;

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise');
  return uid;
}

function validateInput(data) {
  const clubId = typeof data.clubId === 'string' ? data.clubId.trim() : '';
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  const defaultYear = Number(data.defaultYear);
  const currentDiveNumber = Number(data.currentDiveNumber);
  const lockedFields = Array.isArray(data.lockedFields)
    ? data.lockedFields.filter((v) => typeof v === 'string').slice(0, 40)
    : [];

  if (!clubId) throw new HttpsError('invalid-argument', 'clubId requis');
  if (!text) throw new HttpsError('invalid-argument', 'Texte requis');
  if (text.length > MAX_TEXT_LENGTH) {
    throw new HttpsError('invalid-argument', 'Dictée trop longue');
  }
  if (!Number.isInteger(defaultYear) || defaultYear < 1950 || defaultYear > 2100) {
    throw new HttpsError('invalid-argument', 'defaultYear invalide');
  }

  return {
    clubId,
    text,
    defaultYear,
    currentDiveNumber:
      Number.isInteger(currentDiveNumber) && currentDiveNumber > 0
        ? currentDiveNumber
        : null,
    lockedFields,
  };
}

async function getOpenAiKey(clubId) {
  try {
    const doc = await admin
      .firestore()
      .collection('clubs').doc(clubId)
      .collection('settings').doc('ai_api_keys').get();
    if (doc.exists) {
      const v = doc.data() || {};
      if (typeof v.openaiKey === 'string' && v.openaiKey.startsWith('sk-')) {
        return v.openaiKey;
      }
    }
  } catch (err) {
    console.warn('[analyzeLogbookDictation] key lookup failed:', err.message);
  }
  return process.env.OPENAI_API_KEY || process.env.LOGBOOK_DICTATION_OPENAI_API_KEY || null;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

async function loadContext(clubId, uid) {
  const db = admin.firestore();
  const [membersSnap, locationsSnap, carnetSnap] = await Promise.all([
    db.collection('clubs').doc(clubId).collection('members').limit(500).get(),
    db.collection('clubs').doc(clubId).collection('dive_locations').limit(500).get(),
    db
      .collection('clubs').doc(clubId)
      .collection('student_logbook_entries')
      .where('member_id', '==', uid)
      .limit(1000)
      .get(),
  ]);

  const members = [];
  membersSnap.forEach((doc) => {
    const d = doc.data() || {};
    const prenom = normalizeName(
      d.prenom || d.firstName || d.first_name || d.membre_prenom || d.member_first_name
    );
    const nom = normalizeName(
      d.nom || d.lastName || d.last_name || d.membre_nom || d.member_last_name
    );
    const displayName = normalizeName(`${prenom} ${nom}`);
    if (!displayName || doc.id === uid) return;
    members.push({
      id: doc.id,
      displayName,
      aliases: [displayName, `${nom} ${prenom}`.trim()].filter(Boolean),
    });
  });

  const locationsByName = new Map();
  function addLocation(id, data, source) {
    const name = normalizeName(data.name || data.nom || data.location_name || data.lieu);
    if (!name) return;
    const key = name.toLowerCase();
    if (locationsByName.has(key)) return;
    const waterType = String(data.water_type || data.waterType || '').toLowerCase();
    const counters = data.counters || {};
    locationsByName.set(key, {
      id: id || '',
      name,
      country: data.country || data.pays || null,
      isSea: waterType === 'sea' || waterType === 'mer' || counters.mer === true,
      source,
    });
  }

  locationsSnap.forEach((doc) => addLocation(doc.id, doc.data() || {}, 'club'));
  carnetSnap.forEach((doc) => addLocation('', doc.data() || {}, 'carnet'));

  return {
    members: members.slice(0, 250),
    locations: Array.from(locationsByName.values()).slice(0, 300),
  };
}

function schema() {
  const nullableString = { type: ['string', 'null'] };
  const nullableNumber = { type: ['number', 'null'] };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      confidence: { type: 'number' },
      language: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
      fields: {
        type: 'object',
        additionalProperties: false,
        properties: {
          diveNumber: nullableNumber,
          date: nullableString,
          entryTime: nullableString,
          exitTime: nullableString,
          location: {
            type: ['object', 'null'],
            additionalProperties: false,
            properties: {
              id: nullableString,
              name: { type: 'string' },
              country: nullableString,
              isSea: { type: 'boolean' },
              matchedExisting: { type: 'boolean' },
            },
            required: ['id', 'name', 'country', 'isSea', 'matchedExisting'],
          },
          depthMeters: nullableNumber,
          durationMinutes: nullableNumber,
          buddies: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                memberId: nullableString,
                displayName: { type: 'string' },
                matchedExisting: { type: 'boolean' },
              },
              required: ['memberId', 'displayName', 'matchedExisting'],
            },
          },
          tankVolumeL: nullableNumber,
          lestageKg: nullableNumber,
          counters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              exo: { type: ['boolean', 'null'] },
              nitrox: { type: ['boolean', 'null'] },
              deco: { type: ['boolean', 'null'] },
              dp: { type: ['boolean', 'null'] },
              sf: { type: ['boolean', 'null'] },
              nuit: { type: ['boolean', 'null'] },
              mer: { type: ['boolean', 'null'] },
            },
            required: ['exo', 'nitrox', 'deco', 'dp', 'sf', 'nuit', 'mer'],
          },
          fauna: { type: 'array', items: { type: 'string' } },
          notesParts: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'diveNumber',
          'date',
          'entryTime',
          'exitTime',
          'location',
          'depthMeters',
          'durationMinutes',
          'buddies',
          'tankVolumeL',
          'lestageKg',
          'counters',
          'fauna',
          'notesParts',
        ],
      },
    },
    required: ['confidence', 'language', 'warnings', 'fields'],
  };
}

function buildPrompt({ input, context }) {
  return [
    'Extract a scuba dive log entry from dictated text. Return JSON only.',
    '',
    'Hard rules:',
    '- Do not invent locations or people.',
    '- Prefer exact/canonical matches from the provided locations and members.',
    '- If a location/person is not clearly present, return null/empty instead of guessing.',
    '- Do not fill locked fields.',
    '- If the year is missing from a date, use defaultYear.',
    '- Interpret mixed French/Dutch/English diving dictation.',
    '- Notes/fauna must not consume words that belong to location, date, depth, duration, or buddies.',
    '',
    `defaultYear: ${input.defaultYear}`,
    `currentDiveNumber: ${input.currentDiveNumber || ''}`,
    `lockedFields: ${input.lockedFields.join(', ')}`,
    `dictation: ${input.text}`,
    '',
    'Known locations JSON:',
    JSON.stringify(context.locations),
    '',
    'Known members JSON:',
    JSON.stringify(context.members),
  ].join('\n');
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('');
}

function sanitizeResult(result, input) {
  const fields = result && typeof result.fields === 'object' ? result.fields : {};
  const mapLocked = (locked) => {
    switch (locked) {
      case 'dive_number':
        return 'diveNumber';
      case 'entry_time':
        return 'entryTime';
      case 'exit_time':
        return 'exitTime';
      case 'depth':
        return 'depthMeters';
      case 'duration':
        return 'durationMinutes';
      case 'tank':
        return 'tankVolumeL';
      case 'lestage':
        return 'lestageKg';
      case 'buddy':
        return 'buddies';
      default:
        return locked;
    }
  };
  for (const locked of input.lockedFields) {
    const key = mapLocked(locked);
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      if (key === 'buddies') fields.buddies = [];
      else if (key === 'location') fields.location = null;
      else fields[key] = null;
    }
  }
  return {
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
    language: typeof result.language === 'string' ? result.language : 'unknown',
    warnings: Array.isArray(result.warnings)
      ? result.warnings.filter((w) => typeof w === 'string').slice(0, 12)
      : [],
    fields,
    model: DEFAULT_MODEL,
  };
}

async function callOpenAi({ input, context }) {
  const apiKey = await getOpenAiKey(input.clubId);
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Clé OpenAI manquante (clubs/{clubId}/settings/ai_api_keys.openaiKey)'
    );
  }

  const body = {
    model: DEFAULT_MODEL,
    input: [{ role: 'user', content: [{ type: 'input_text', text: buildPrompt({ input, context }) }] }],
    text: {
      format: {
        type: 'json_schema',
        name: 'calymob_logbook_dictation',
        strict: true,
        schema: schema(),
      },
    },
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new HttpsError('internal', `Erreur IA (${response.status})`, text.slice(0, 1000));
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new HttpsError('internal', 'Réponse IA invalide', text.slice(0, 1000));
  }
  const outputText = extractOutputText(json);
  if (!outputText) throw new HttpsError('internal', 'Réponse IA vide');
  try {
    return JSON.parse(outputText);
  } catch (e) {
    throw new HttpsError('internal', 'JSON IA non parsable', outputText.slice(0, 1000));
  }
}

exports.analyzeLogbookDictation = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    const uid = requireAuth(request);
    const input = validateInput(request.data || {});
    const context = await loadContext(input.clubId, uid);
    const result = await callOpenAi({ input, context });
    return sanitizeResult(result, input);
  }
);

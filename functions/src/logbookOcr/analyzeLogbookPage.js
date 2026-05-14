/**
 * Cloud Function: analyzeLogbookPage
 *
 * Reads a paper dive logbook page image from Firebase Storage, sends it to an
 * AI vision extractor, validates/normalizes the result, stores an import job,
 * and returns reviewable row suggestions to CalyMob.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const MAX_IMAGE_BYTES = Number(process.env.LOGBOOK_OCR_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
const DEFAULT_MODEL = process.env.LOGBOOK_OCR_AI_MODEL || 'gpt-4.1-mini';

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentification requise');
  }
  return uid;
}

function validateInput(data, uid) {
  const clubId = typeof data.clubId === 'string' ? data.clubId.trim() : '';
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath.trim() : '';
  const defaultYear = Number(data.defaultYear);
  const localeHints = Array.isArray(data.localeHints)
    ? data.localeHints.filter((x) => typeof x === 'string').slice(0, 4)
    : ['fr', 'nl'];

  if (!clubId) throw new HttpsError('invalid-argument', 'clubId requis');
  if (!storagePath) throw new HttpsError('invalid-argument', 'storagePath requis');
  if (!Number.isInteger(defaultYear) || defaultYear < 1950 || defaultYear > 2100) {
    throw new HttpsError('invalid-argument', 'defaultYear invalide');
  }

  const expectedPrefix = `clubs/${clubId}/ocr_imports/${uid}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError('permission-denied', 'Chemin Storage non autorisé');
  }

  return { clubId, storagePath, defaultYear, localeHints };
}

function logbookSchema() {
  const field = (type) => ({
    type: 'object',
    additionalProperties: false,
    properties: {
      value: type,
      confidence: { type: 'number' },
      raw: { type: ['string', 'null'] },
      needsReview: { type: 'boolean' },
    },
    required: ['value', 'confidence', 'needsReview'],
  });

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: {
        type: 'object',
        additionalProperties: false,
        properties: {
          detectedFormat: { type: 'string' },
          language: { type: 'string' },
          overallConfidence: { type: 'number' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['detectedFormat', 'language', 'overallConfidence', 'warnings'],
      },
      rows: {
        type: 'array',
        maxItems: 25,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            rowId: { type: 'string' },
            confidence: { type: 'number' },
            warnings: { type: 'array', items: { type: 'string' } },
            fields: {
              type: 'object',
              additionalProperties: false,
              properties: {
                diveNumber: field({ type: ['number', 'null'] }),
                dateRaw: field({ type: ['string', 'null'] }),
                date: field({ type: ['string', 'null'] }),
                entryTime: field({ type: ['string', 'null'] }),
                exitTime: field({ type: ['string', 'null'] }),
                locationName: field({ type: ['string', 'null'] }),
                country: field({ type: ['string', 'null'] }),
                depthMaxMeters: field({ type: ['number', 'null'] }),
                durationMinutes: field({ type: ['number', 'null'] }),
                deco: field({ type: ['boolean', 'null'] }),
                night: field({ type: ['boolean', 'null'] }),
                sea: field({ type: ['boolean', 'null'] }),
                buddies: field({
                  anyOf: [
                    { type: 'array', items: { type: 'string' } },
                    { type: 'null' },
                  ],
                }),
                notes: field({ type: ['string', 'null'] }),
              },
              required: [
                'diveNumber',
                'dateRaw',
                'date',
                'entryTime',
                'exitTime',
                'locationName',
                'country',
                'depthMaxMeters',
                'durationMinutes',
                'deco',
                'night',
                'sea',
                'buddies',
                'notes',
              ],
            },
          },
          required: ['rowId', 'confidence', 'warnings', 'fields'],
        },
      },
    },
    required: ['page', 'rows'],
  };
}

/**
 * French marine fauna / event vocabulary that Calypso members commonly write
 * in their `notes` field. When the OCR is unsure about a smudged word, the
 * model should prefer one of these over a literal garbled read. List kept
 * conservative — only well-attested Mediterranean / North-Sea names.
 */
const MARINE_FAUNA_HINTS = [
  // Cephalopods / molluscs
  'poulpe', 'pieuvre', 'seiche', 'calamar', 'nudibranche', 'doris',
  'flabelline', 'aplysie',
  // Fish
  'rascasse', 'mérou', 'dorade', 'sar', 'sargue', 'serran', 'girelle',
  'labre', 'congre', 'murène', 'barracuda', 'bonite', 'thon', 'maquereau',
  'cabillaud', 'morue', 'lieu', 'turbot', 'bar', 'loup', 'sole', 'plie',
  'baudroie', 'lotte', 'vive', 'rouget',
  // Sharks / rays
  'raie', 'roussette', 'requin', 'pèlerin', 'aiguillat',
  // Crustaceans
  'homard', 'langouste', 'tourteau', 'araignée', 'crabe', 'galathée',
  'crevette', 'bernard-l’ermite', 'bernard l’ermite',
  // Echinoderms / other
  'étoile de mer', 'oursin', 'anémone', 'gorgone', 'corail', 'éponge',
  'ascidie', 'salpe', 'méduse',
  // Mammals
  'dauphin', 'phoque',
  // Events / observations (not fauna but often misread)
  'épave', 'wreck', 'tombant', 'sec', 'cavité', 'grotte', 'tunnel',
  'nuit', 'nocturne', 'baptême', 'examen',
];

function buildPrompt({ defaultYear, localeHints, locationNames }) {
  const lines = [
    'Tu analyses une photo d’un carnet papier de plongée manuscrit.',
    'Extrais chaque ligne de plongée visible et retourne uniquement du JSON.',
    'Mappe tous les formats vers le modèle CalyMob standard.',
    `Année par défaut si elle manque dans la date: ${defaultYear}.`,
    `Langues attendues: ${localeHints.join(', ')}.`,
    '',
    'Champs à reconnaître: N°, date, lieu, pays, profondeur max, durée, heure immersion, heure sortie, paliers/déco, nuit, mer, binômes/compagnons, notes/remarques/faune/flore.',
    'Ne devine pas silencieusement. Si un champ est incertain, mets needsReview=true et conserve le texte brut dans raw ou warnings.',
    'Les valeurs numériques doivent être des nombres, pas des chaînes.',
    'Les dates normalisées doivent être yyyy-mm-dd quand possible; dateRaw conserve l’écriture originale.',
    'Les heures doivent être HH:mm quand possible.',
    'Pays: utilise un code ISO court si très probable (BE, FR, NL, HR, EG, ES, PT, MT).',
    '',
    'INDICES DE VOCABULAIRE (à privilégier si une lecture est ambiguë) :',
    `- Faune / événements fréquents en notes : ${MARINE_FAUNA_HINTS.join(', ')}.`,
  ];
  if (Array.isArray(locationNames) && locationNames.length > 0) {
    // Cap to a reasonable size to keep the prompt cheap; the dive_locations
    // collection rarely exceeds ~50 entries per club anyway.
    const sample = locationNames.slice(0, 80);
    lines.push(
      `- Lieux de plongée connus du club : ${sample.join(', ')}.`
    );
  }
  lines.push(
    'Si un mot écrit ressemble fortement à un terme de la liste ci-dessus, choisis ce terme pour la sortie. Sinon, conserve la lecture brute et marque needsReview=true.'
  );
  return lines.join('\n');
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === 'string') return responseJson.output_text;
  const chunks = [];
  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('');
}

/**
 * Reads the OpenAI key from `clubs/{clubId}/settings/ai_api_keys.openaiKey`.
 * This is the same storage path that CalyCompta's `categorize-ai.js` uses
 * for Anthropic — keeps all AI keys in one place, lets admins rotate them
 * from the web UI without redeploying functions, and avoids leaking the
 * key into a process env var that gcloud would surface in deploy logs.
 * Falls back to env for emergency overrides only.
 */
async function getOpenAiKey(clubId) {
  const db = admin.firestore();
  try {
    const doc = await db
      .collection('clubs').doc(clubId)
      .collection('settings').doc('ai_api_keys').get();
    if (doc.exists) {
      const v = doc.data() || {};
      if (typeof v.openaiKey === 'string' && v.openaiKey.startsWith('sk-')) {
        return v.openaiKey;
      }
    }
  } catch (err) {
    console.warn('[analyzeLogbookPage] firestore key lookup failed:', err.message);
  }
  return process.env.OPENAI_API_KEY || process.env.LOGBOOK_OCR_OPENAI_API_KEY || null;
}

/**
 * Loads dive_location names for the club so they can be injected as
 * vocabulary hints into the prompt. Bounded list (typically 30-50 entries)
 * — keeps the prompt cheap while letting the model prefer canonical names
 * over garbled handwritten reads.
 */
async function getClubLocationNames(clubId) {
  try {
    const snap = await admin
      .firestore()
      .collection('clubs').doc(clubId)
      .collection('dive_locations').limit(200).get();
    const names = [];
    for (const d of snap.docs) {
      const v = d.data() || {};
      const n = (v.name || v.nom || '').trim();
      if (n) names.push(n);
    }
    return names;
  } catch (err) {
    console.warn('[analyzeLogbookPage] dive_locations lookup failed:', err.message);
    return [];
  }
}

async function callOpenAiVision({ clubId, imageBuffer, mimeType, defaultYear, localeHints }) {
  const apiKey = await getOpenAiKey(clubId);
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Clé OpenAI manquante (clubs/{clubId}/settings/ai_api_keys.openaiKey)'
    );
  }

  const locationNames = await getClubLocationNames(clubId);

  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  const body = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: buildPrompt({ defaultYear, localeHints, locationNames }) },
          { type: 'input_image', image_url: dataUrl, detail: 'high' },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'calymob_logbook_ocr',
        description: 'Structured extraction of paper dive logbook rows.',
        strict: false,
        schema: logbookSchema(),
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
  if (!outputText) {
    throw new HttpsError('internal', 'Réponse IA vide');
  }

  try {
    return JSON.parse(outputText);
  } catch (e) {
    throw new HttpsError('internal', 'JSON IA non parsable', outputText.slice(0, 1000));
  }
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeField(field, fallbackValue = null) {
  const f = field && typeof field === 'object' ? field : {};
  return {
    value: f.value === undefined ? fallbackValue : f.value,
    confidence: clampConfidence(f.confidence),
    raw: typeof f.raw === 'string' ? f.raw : null,
    needsReview: f.needsReview === true || clampConfidence(f.confidence) < 0.65,
  };
}

function normalizeDate(dateField, dateRawField, defaultYear) {
  const date = normalizeField(dateField);
  const raw = normalizeField(dateRawField);
  if (typeof date.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    return date;
  }
  const candidate = typeof raw.value === 'string' ? raw.value.trim() : '';
  const m = candidate.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!m) return { ...date, value: null, needsReview: true };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : defaultYear;
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { ...date, value: null, needsReview: true };
  }
  return {
    ...date,
    value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    needsReview: date.needsReview === true || !m[3],
  };
}

function normalizeTimeField(field) {
  const f = normalizeField(field);
  if (typeof f.value !== 'string') return { ...f, value: null };
  const m = f.value.trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
  if (!m) return { ...f, value: null, needsReview: true };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return { ...f, value: null, needsReview: true };
  return { ...f, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function normalizeRows(aiResult, defaultYear) {
  const rows = Array.isArray(aiResult.rows) ? aiResult.rows.slice(0, 25) : [];
  return rows.map((row, index) => {
    const fields = row.fields && typeof row.fields === 'object' ? row.fields : {};
    const normalized = {
      rowId: typeof row.rowId === 'string' && row.rowId ? row.rowId : `row-${index + 1}`,
      selected: true,
      confidence: clampConfidence(row.confidence),
      warnings: Array.isArray(row.warnings) ? row.warnings.filter((w) => typeof w === 'string') : [],
      fields: {
        diveNumber: normalizeField(fields.diveNumber),
        dateRaw: normalizeField(fields.dateRaw),
        date: normalizeDate(fields.date, fields.dateRaw, defaultYear),
        entryTime: normalizeTimeField(fields.entryTime),
        exitTime: normalizeTimeField(fields.exitTime),
        locationName: normalizeField(fields.locationName),
        country: normalizeField(fields.country),
        depthMaxMeters: normalizeField(fields.depthMaxMeters),
        durationMinutes: normalizeField(fields.durationMinutes),
        deco: normalizeField(fields.deco),
        night: normalizeField(fields.night),
        sea: normalizeField(fields.sea),
        buddies: normalizeField(fields.buddies, []),
        notes: normalizeField(fields.notes),
      },
    };

    const depth = Number(normalized.fields.depthMaxMeters.value);
    if (!Number.isFinite(depth) || depth < 0 || depth > 120) {
      normalized.fields.depthMaxMeters.value = null;
      normalized.fields.depthMaxMeters.needsReview = true;
    }
    const duration = Number(normalized.fields.durationMinutes.value);
    if (!Number.isFinite(duration) || duration < 0 || duration > 300) {
      normalized.fields.durationMinutes.value = null;
      normalized.fields.durationMinutes.needsReview = true;
    }
    if (!normalized.fields.locationName.value) {
      normalized.warnings.push('Lieu manquant');
      normalized.fields.locationName.needsReview = true;
    }
    if (!normalized.fields.date.value) {
      normalized.warnings.push('Date manquante');
      normalized.fields.date.needsReview = true;
    }

    return normalized;
  });
}

exports.analyzeLogbookPage = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 5,
  },
  async (request) => {
    const uid = requireAuth(request);
    const input = validateInput(request.data || {}, uid);

    const bucket = admin.storage().bucket();
    const file = bucket.file(input.storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('not-found', 'Image introuvable');
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    if (size > MAX_IMAGE_BYTES) {
      throw new HttpsError('invalid-argument', 'Image trop volumineuse');
    }
    const mimeType = metadata.contentType || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new HttpsError('invalid-argument', 'Format image non supporté');
    }

    const [imageBuffer] = await file.download();
    const aiResult = await callOpenAiVision({
      clubId: input.clubId,
      imageBuffer,
      mimeType,
      defaultYear: input.defaultYear,
      localeHints: input.localeHints,
    });

    const page = aiResult.page && typeof aiResult.page === 'object' ? aiResult.page : {};
    const rows = normalizeRows(aiResult, input.defaultYear);
    const importJobRef = admin.firestore()
      .collection('clubs')
      .doc(input.clubId)
      .collection('logbook_ocr_imports')
      .doc();

    const payload = {
      member_id: uid,
      status: 'review',
      storage_path: input.storagePath,
      default_year: input.defaultYear,
      parser_version: 'logbook-ocr-v1-openai-responses',
      detected_format: typeof page.detectedFormat === 'string' ? page.detectedFormat : 'unknown',
      language: typeof page.language === 'string' ? page.language : 'unknown',
      overall_confidence: clampConfidence(page.overallConfidence),
      warnings: Array.isArray(page.warnings) ? page.warnings.filter((w) => typeof w === 'string') : [],
      rows,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await importJobRef.set(payload);

    return {
      importJobId: importJobRef.id,
      detectedFormat: payload.detected_format,
      language: payload.language,
      overallConfidence: payload.overall_confidence,
      warnings: payload.warnings,
      rows,
    };
  },
);

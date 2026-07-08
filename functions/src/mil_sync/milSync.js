/**
 * WP-26 MS-A — Détection automatique des changements du MIL publié sur
 * mil.amb-lifras.be (copie bénévole, PWA une-page, contenu inline).
 *
 * Chaque semaine : GET la page → snapshot brut dans Storage
 * `mil_snapshots/{ISO}.html` → compare marqueur de version + hash SHA-256 au
 * run précédent → écrit `clubs/{clubId}/mil_sync/runs/items/{id}` → e-mail à
 * Jan si changement OU erreur (+ heartbeat trimestriel « rien à signaler »).
 *
 * NE JAMAIS appliquer automatiquement (D15) : cette CF ne fait que détecter et
 * notifier. L'approbation et l'écriture des référentiels se font à l'écran
 * (MS-C, à venir). Mode dégradé : toute erreur = e-mail, jamais de crash.
 *
 * MS-B (segmentation + diff par section) et MS-C/D (écran d'approbation +
 * impactanalyse) sont des lots ultérieurs.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const axios = require('axios');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

const REGION = 'europe-west1';
const CLUB_ID = 'calypso';
const MIL_URL = 'https://mil.amb-lifras.be/';
const DEFAULT_RECIPIENTS = ['jan@h2m.ai'];
const MIN_SIZE = 10 * 1024; // 10 KB : plus petit = anomalie
// La page réelle fait ~5 Mo (contenu + assets inline), pas ~92 Ko : borne large.
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB : plus grand = anomalie
const HEARTBEAT_DAYS = 90;

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Marqueur de version type « v2026-7 » (best effort — null si absent).
function extractVersion(html) {
  const m = String(html).match(/v20\d{2}[-.]\d+/i);
  return m ? m[0] : null;
}

async function loadEmailConfig(db, clubId) {
  try {
    const snap = await db.collection('clubs').doc(clubId)
      .collection('settings').doc('email_config').get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    return null;
  }
}

async function sendReport(db, clubId, recipients, subject, html) {
  const emailConfig = await loadEmailConfig(db, clubId);
  if (!emailConfig) {
    console.warn('[milSync] pas d\'email_config — rapport loggé seulement:', subject);
    return false;
  }
  try {
    await sendEmailWithConfig(emailConfig, {
      to: recipients.join(','),
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' '),
    });
    return true;
  } catch (e) {
    console.error('[milSync] envoi e-mail échoué:', e.message);
    return false;
  }
}

/**
 * Cœur de la synchro. Retourne un résumé du run.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{trigger?: string}} [opts]
 */
async function runMilSync(db, opts = {}) {
  const milSyncRef = db.collection('clubs').doc(CLUB_ID).collection('mil_sync');
  const runsRef = milSyncRef.doc('runs').collection('items');

  const configSnap = await milSyncRef.doc('config').get();
  const config = configSnap.exists ? configSnap.data() : {};
  const recipients = Array.isArray(config.recipients) && config.recipients.length
    ? config.recipients
    : DEFAULT_RECIPIENTS;

  const nowIso = new Date().toISOString();
  const runDoc = {
    date: FieldValue.serverTimestamp(),
    trigger: opts.trigger || 'schedule',
    version: null,
    hash: null,
    changed: false,
    error: null,
    size: 0,
    snapshot_path: null,
  };

  // ---- Fetch -------------------------------------------------------------
  let html;
  try {
    const res = await axios.get(MIL_URL, {
      timeout: 30000,
      responseType: 'text',
      headers: { 'User-Agent': 'CalypsoMilSync/1.0 (+https://caly.club; carnet de formation)' },
      transformResponse: (d) => d,
    });
    html = typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err) {
    runDoc.error = `fetch: ${err.message}`;
    await runsRef.add(runDoc);
    await sendReport(db, CLUB_ID, recipients,
      '[MIL sync] erreur de recuperation',
      `<p>Impossible de recuperer ${MIL_URL} le ${nowIso}.</p><p>Erreur : ${err.message}</p>`);
    return { ok: false, error: runDoc.error };
  }

  runDoc.size = Buffer.byteLength(html, 'utf8');
  runDoc.version = extractVersion(html);
  runDoc.hash = sha256(html);

  // ---- Garde-fous : taille anormale -> ne pas ecraser, alerter ----------
  if (runDoc.size < MIN_SIZE || runDoc.size > MAX_SIZE) {
    runDoc.error = `taille anormale: ${runDoc.size} octets`;
    await runsRef.add(runDoc);
    await sendReport(db, CLUB_ID, recipients,
      '[MIL sync] page de taille anormale',
      `<p>La page fait ${runDoc.size} octets (hors bornes ${MIN_SIZE}-${MAX_SIZE}). Snapshot NON ecrase, controle manuel requis.</p>`);
    return { ok: false, error: runDoc.error };
  }

  // ---- Snapshot Storage --------------------------------------------------
  try {
    const path = `mil_snapshots/${nowIso.replace(/[:.]/g, '-')}.html`;
    await admin.storage().bucket().file(path).save(html, {
      contentType: 'text/html; charset=utf-8',
      resumable: false,
    });
    runDoc.snapshot_path = path;
  } catch (err) {
    console.error('[milSync] snapshot Storage echoue:', err.message);
    runDoc.error = `storage: ${err.message}`;
  }

  // ---- Comparaison au run precedent -------------------------------------
  const prevSnap = await runsRef.orderBy('date', 'desc').limit(1).get();
  const prev = prevSnap.empty ? null : prevSnap.docs[0].data();
  runDoc.changed = prev
    ? (prev.hash !== runDoc.hash || (!!runDoc.version && !!prev.version && runDoc.version !== prev.version))
    : false; // premier run = reference, pas de changement

  await runsRef.add(runDoc);

  // ---- Notification ------------------------------------------------------
  if (runDoc.changed) {
    await sendReport(db, CLUB_ID, recipients,
      `[MIL sync] changement detecte (${runDoc.version || 'version ?'})`,
      `<p>Un changement du MIL a ete detecte le ${nowIso}.</p>
       <ul>
         <li>Version detectee : <b>${runDoc.version || '-'}</b> (precedente : ${prev && prev.version ? prev.version : '-'})</li>
         <li>Hash : ${runDoc.hash.slice(0, 16)} (precedent : ${(prev && prev.hash ? prev.hash : '').slice(0, 16)})</li>
         <li>Taille : ${runDoc.size} octets - Snapshot : ${runDoc.snapshot_path || '-'}</li>
       </ul>
       <p>Rien n'a ete applique automatiquement (D15). Le diff par section et l'ecran d'approbation arrivent (MS-B/C).</p>`);
  } else if (opts.trigger === 'manual') {
    // Run manuel : toujours envoyer un accusé (permet de tester la chaîne).
    await sendReport(db, CLUB_ID, recipients,
      '[MIL sync] run manuel - aucun changement',
      `<p>Run manuel du ${nowIso}. Aucun changement detecte.</p>
       <ul>
         <li>Version : ${runDoc.version || '-'}</li>
         <li>Taille : ${runDoc.size} octets - Snapshot : ${runDoc.snapshot_path || '-'}</li>
       </ul>`);
  } else {
    // Heartbeat trimestriel « rien a signaler ».
    const lastHeartbeat = config.last_heartbeat_at && config.last_heartbeat_at.toMillis
      ? config.last_heartbeat_at.toMillis() : 0;
    const days = (Date.now() - lastHeartbeat) / (24 * 60 * 60 * 1000);
    if (days >= HEARTBEAT_DAYS) {
      await sendReport(db, CLUB_ID, recipients,
        '[MIL sync] rien a signaler (heartbeat trimestriel)',
        `<p>La surveillance du MIL fonctionne. Aucun changement depuis le dernier rapport. Version : ${runDoc.version || '-'}.</p>`);
      await milSyncRef.doc('config').set(
        { last_heartbeat_at: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  return { ok: true, changed: runDoc.changed, version: runDoc.version, size: runDoc.size };
}

// ---- Scheduled (hebdomadaire) --------------------------------------------
const milSyncWeekly = onSchedule(
  {
    region: REGION,
    schedule: '0 6 * * 1', // lundi 06:00
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const configSnap = await db.collection('clubs').doc(CLUB_ID)
      .collection('mil_sync').doc('config').get();
    if (configSnap.exists && configSnap.data().enabled === false) {
      console.log('[milSyncWeekly] desactive (config.enabled=false)');
      return;
    }
    const res = await runMilSync(db, { trigger: 'schedule' });
    console.log('[milSyncWeekly]', JSON.stringify(res));
  }
);

// ---- Callable manuel (test / run a la demande, admin) --------------------
const runMilSyncNow = onCall(
  { region: REGION, timeoutSeconds: 120, memory: '256MiB' },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise');
    const db = admin.firestore();
    const memberSnap = await db.collection('clubs').doc(CLUB_ID)
      .collection('members').doc(uid).get();
    const role = memberSnap.exists ? memberSnap.data().app_role : null;
    if (role !== 'admin' && role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Reserve aux administrateurs');
    }
    return runMilSync(db, { trigger: 'manual' });
  }
);

module.exports = {
  milSyncWeekly,
  runMilSyncNow,
  // exportes pour tests
  sha256,
  extractVersion,
};

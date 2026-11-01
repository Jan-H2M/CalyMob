/** Server-authoritative CalyMob stock sessions. Never accepts financial edits or client roles. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { createHash } = require('node:crypto');
const { REGION, hasBoutiqueResponsibility } = require('./shared');
const { memberDisplayName } = require('../utils/memberName');

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MUTATIONS = new Set(['move', 'prepareJim', 'confirmJim', 'finishJim', 'reviewPlain', 'dispatch', 'arrive', 'deliver', 'revoke']);
const READS = new Set(['access', 'list', 'lookup', 'missions', 'mission', 'orders', 'orderSelection']);
const ALLOWED = new Set(['action', 'clubId', 'unitId', 'units', 'sourceLocation', 'destination', 'note', 'assigneeIds', 'missionId', 'recipientMemberId', 'confirmed', 'allowPartial', 'pickupPoint', 'pickupWindow', 'idempotencyKey', 'preview', 'expectedActorId', 'cursor', 'orderId']);
const MAX_UNITS = 50;
const MAX_PEERS = 250;
const fail = (code, message) => { throw new HttpsError(code, message); };
const id = (value) => typeof value === 'string' && ID.test(value);
const text = (value, max = 500) => typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value.trim() : '';
const unique = (values) => [...new Set(values)];
const ms = (value) => value?.toMillis?.() ?? value?.toDate?.()?.getTime() ?? (value instanceof Date ? value.getTime() : 0);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const active = (member) => member?.member_status === 'active' && member.has_app_access !== false && (!member.app_status || member.app_status === 'active') && member.isActive !== false && member.actif !== false;
const ready = (unit) => !unit.inventoryExcluded && ['returned_embroidered', 'not_required_reviewed'].includes(unit.finish) && unit.saleStatus === 'sale_ready';
const paid = (order) => order?.payment?.status === 'paid' && !order.payment.lastMatchError && order.paymentAdjustment?.type !== 'additional_payment_due' && order.additional_payment_due !== true && ['paid', 'preparing', 'ready', 'delivered'].includes(order.status);
// Keep the existing Calypso line customization semantics, including historic
// snapshot fallback. A plain stock base can still require customer embroidery.
function lineNeedsProduction(line) {
  const record = value => value && typeof value === 'object' ? value : null;
  const custom = record(line?.customizations) ?? record(line?.productSnapshot?.customizations);
  if (!custom) return false;
  const filled = value => typeof value === 'string' && value.trim().length > 0;
  return custom.clubLogo?.enabled === true || filled(custom.name?.text) || filled(custom.certification?.value);
}
const revision = (snap) => snap.updateTime ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : hash(snap.data());
const asUnit = (snap) => ({ ...snap.data(), id: snap.id, revision: revision(snap) });
const publicUnit = (unit) => Object.fromEntries(['id','revision','productName','variantLabel','location','destination','finish','saleStatus','customerOrderId','customerLineId','customerName','supplierBatchId','supplierOrderReference','requiresEmbroidery','pickupMissionId','transportMissionId'].map(k => [k, unit[k] ?? null]).concat([['workshopReady', Boolean(unit.workshopReadyAt)]]));

function validate(input, actor) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !ALLOWED.has(k)) || !id(input.clubId) || (!READS.has(input.action) && !MUTATIONS.has(input.action))) fail('invalid-argument', 'Demande Boutique invalide.');
  if (!id(actor?.uid)) fail('unauthenticated', 'Connectez-vous à CalyMob.');
  if (Object.hasOwn(actor, 'clubClaim') && actor.clubClaim !== input.clubId) fail('permission-denied', 'Le club ne correspond pas au compte connecté.');
  if (['lookup'].includes(input.action) && !id(input.unitId)) fail('invalid-argument', 'Pièce invalide.');
  if (input.cursor !== undefined && (!id(input.cursor) || !['missions', 'list', 'orders'].includes(input.action))) fail('invalid-argument', 'Page Boutique invalide.');
  if (input.orderId !== undefined && (!id(input.orderId) || input.action !== 'orderSelection')) fail('invalid-argument', 'Commande invalide.');
  if (input.action === 'orderSelection' && (!id(input.orderId) || typeof input.sourceLocation !== 'string' || !text(input.sourceLocation, 160))) fail('invalid-argument', 'Commande ou lieu invalide.');
  if (input.missionId !== undefined && !id(input.missionId)) fail('invalid-argument', 'Mission invalide.');
  if (!MUTATIONS.has(input.action)) return;
  if (!id(input.expectedActorId) || input.expectedActorId !== actor.uid) fail('permission-denied', 'Le compte a changé depuis l’ouverture de cette confirmation. Recommencez la session.');
  if (!id(input.idempotencyKey) || input.idempotencyKey.length < 16) fail('invalid-argument', 'Identifiant de confirmation obligatoire.');
  if (input.action !== 'revoke') {
    if (!Array.isArray(input.units) || !input.units.length || input.units.length > (input.action === 'move' ? 100 : MAX_UNITS) || input.units.some(u => !u || Object.keys(u).some(k => !['id', 'revision'].includes(k)) || !id(u.id) || typeof u.revision !== 'string' || !u.revision || u.revision.length > 150) || unique(input.units.map(u => u.id)).length !== input.units.length) fail('invalid-argument', `Sélectionnez de 1 à ${input.action === 'move' ? 100 : MAX_UNITS} pièces différentes.`);
  }
  for (const key of ['sourceLocation', 'destination', 'pickupWindow', 'note']) if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > (key === 'note' ? 500 : 160) || !text(input[key], key === 'note' ? 500 : 160))) fail('invalid-argument', 'Lieu ou note invalide.');
  for (const key of ['confirmed', 'allowPartial', 'pickupPoint', 'preview']) if (input[key] !== undefined && typeof input[key] !== 'boolean') fail('invalid-argument', 'Confirmation invalide.');
}

async function executePhysicalOperation(db, actor, input, clock = Date.now) {
  validate(input, actor);
  const club = db.collection('clubs').doc(input.clubId);
  const time = clock();
  const now = admin.firestore.Timestamp.fromMillis(time);
  return db.runTransaction(async tx => {
    const [memberSnap, flagsSnap] = await Promise.all([tx.get(club.collection('members').doc(actor.uid)), tx.get(club.collection('settings').doc('feature_flags'))]);
    const member = memberSnap.exists ? memberSnap.data() : null, flags = flagsSnap.data() || {};
    const enabled = active(member) && flags.boutiqueQrEnabled === true && (flags.boutiqueEnabled === true || flags.boutiqueMobileEnabled === true) && flags.boutiqueAccess !== 'masque';
    const manager = enabled && hasBoutiqueResponsibility(member);
    if (!enabled) {
      if (input.action === 'access') return { enabled: false, canManage: false, hasAssignments: false };
      fail('permission-denied', 'La gestion Boutique n’est pas disponible pour ce compte.');
    }
    const authorCache = new Map([[actor.uid, member]]);
    async function missionAuthorized(mission, allowClosed = false, inspection = false) {
      if (!mission) return false;
      if (manager && inspection) return true;
      if (mission.status === 'revoked' || (!allowClosed && mission.status === 'closed') || ms(mission.expiresAt) <= time) return false;
      if (manager) return true;
      if (!mission.assigneeIds?.includes(actor.uid)) return false;
      if (!authorCache.has(mission.createdBy)) { const snap = await tx.get(club.collection('members').doc(mission.createdBy)); authorCache.set(mission.createdBy, snap.data()); }
      const author = authorCache.get(mission.createdBy);
      return active(author) && hasBoutiqueResponsibility(author);
    }
    async function listMissions(onlyOne = false) {
      const base = manager
        ? club.collection('boutique_pickup_missions').where('status', 'in', ['transit', 'received']).orderBy('createdAt', 'desc')
        : club.collection('boutique_pickup_missions').where('assigneeIds', 'array-contains', actor.uid).where('status', 'in', ['transit', 'received']).where('expiresAt', '>', now).orderBy('expiresAt');
      let cursor = null;
      if (input.cursor) {
        cursor = await tx.get(club.collection('boutique_pickup_missions').doc(input.cursor));
        if (!cursor.exists) fail('invalid-argument', 'La liste a changé. Actualisez les missions.');
      }
      const missions = [], target = onlyOne ? 1 : 100;
      // Historic/expired jobs are excluded by the query. Also scan past jobs
      // whose delegating RB has since lost the role: they cannot hide a live job.
      while (true) {
        const snap = await tx.get((cursor ? base.startAfter(cursor) : base).limit(100));
        if (snap.empty) return { missions, hasMore: false, nextCursor: null };
        for (let i = 0; i < snap.docs.length; i++) {
          const doc = snap.docs[i]; cursor = doc;
          if (await missionAuthorized(doc.data(), false, manager)) missions.push({ ...doc.data(), id: doc.id });
          if (missions.length >= target) {
            const hasMore = i < snap.docs.length - 1 || snap.size === 100;
            return { missions, hasMore, nextCursor: hasMore ? cursor.id : null };
          }
        }
        if (snap.size < 100) return { missions, hasMore: false, nextCursor: null };
      }
    }
    const missionRef = input.missionId ? club.collection('boutique_pickup_missions').doc(input.missionId) : null;
    const missionSnap = missionRef ? await tx.get(missionRef) : null;
    const mission = missionSnap?.exists ? { ...missionSnap.data(), id: missionSnap.id } : null;
    if (input.action === 'access') {
      if (manager) return { enabled: true, canManage: true, hasAssignments: false };
      const { missions } = await listMissions(true);
      return { enabled: true, canManage: manager, hasAssignments: missions.length > 0 };
    }
    if (input.action === 'missions') {
      const result = await listMissions();
      return { missions: result.missions.map(m => ({ id: m.id, destination: m.destination, sourceLocation: m.sourceLocation, pickupWindow: m.pickupWindow, status: m.status, expiresAt: new Date(ms(m.expiresAt)).toISOString(), total: m.unitIds.length, arrived: m.arrivedUnitIds.length, delivered: m.deliveredUnitIds.length, assigneeNames: m.assigneeNames, allowPartial: m.allowPartial, pickupPoint: m.pickupPoint })), hasMore: result.hasMore, nextCursor: result.nextCursor };
    }
    if (['mission', 'arrive', 'deliver', 'revoke'].includes(input.action) && !mission) fail('not-found', 'Mission introuvable.');
    if (input.action === 'lookup') {
      if (!manager && (!mission || !await missionAuthorized(mission) || !mission.unitIds.includes(input.unitId))) fail('permission-denied', 'Cette pièce ne fait pas partie de votre mission.');
      const snap = await tx.get(club.collection('boutique_physical_stock_units').doc(input.unitId));
      if (!snap.exists) {
        if (/^qr1_[a-f0-9]{64}$/.test(input.unitId)) fail('failed-precondition', 'Fiche prête : confirmez la réception de cet article dans Calypso avant de le déplacer. Gardez cette fiche, son QR reste valable.');
        fail('not-found', 'Pièce introuvable dans ce club.');
      }
      const unit = asUnit(snap);
      if (unit.inventoryExcluded) fail('failed-precondition', 'Pièce retirée du stock par correction de comptage. Vérifiez son historique dans CalyCompta.');
      if (!manager && unit.transportMissionId !== mission.id && unit.pickupMissionId !== mission.id && unit.handover?.missionId !== mission.id) fail('permission-denied', 'Cette pièce a quitté votre mission.');
      return { unit: publicUnit(unit) };
    }
    if (input.action === 'list') {
      if (!manager) fail('permission-denied', 'Fonction Responsable boutique obligatoire.');
      const base = club.collection('boutique_physical_stock_units').where('saleStatus', 'in', ['not_ready', 'sale_ready']).orderBy(admin.firestore.FieldPath.documentId());
      const page = input.cursor ? base.startAfter(input.cursor) : base;
      const [units, members] = await Promise.all([tx.get(page.limit(201)), input.cursor ? Promise.resolve(null) : tx.get(club.collection('members').where('member_status', '==', 'active').limit(500))]);
      const docs = units.docs.slice(0, 200), hasMore = units.size > 200;
      // Preserve the unfiltered cursor: excluded rows must not hide later pages.
      return { units: docs.filter(s => !s.data().inventoryExcluded).map(s => publicUnit(asUnit(s))), hasMore, nextCursor: hasMore ? docs.at(-1).id : null, assignees: members ? members.docs.filter(s => active(s.data())).map(s => ({ id: s.id, name: memberDisplayName(s.data()), accueil: (s.data().clubStatuten || []).some(v => ['a','accueil'].includes(String(v).toLowerCase())) })) : [] };
    }
    // Selection only: RB-scoped reads, never an inventory/order mutation. Do not
    // derive a whole order from the management screen's truncated 200-unit list.
    if (['orders', 'orderSelection'].includes(input.action)) {
      if (!manager) fail('permission-denied', 'Fonction Responsable boutique obligatoire.');
      const orders = club.collection('orders');
      const selectableStatuses = ['awaiting_payment', 'paid', 'preparing', 'ready'];
      if (input.action === 'orders') {
        let query = orders.where('status', 'in', selectableStatuses).orderBy(admin.firestore.FieldPath.documentId());
        if (input.cursor) query = query.startAfter(input.cursor);
        const page = await tx.get(query.limit(30));
        return {
          orders: page.docs.map(s => ({ id: s.id, orderNumber: s.data().orderNumber || s.id, customerName: s.data().buyer?.displayName || 'Membre', physicalCount: (Array.isArray(s.data().items) ? s.data().items : []).filter(i => i.deliveryMode !== 'digital' && i.fulfillmentStatus !== 'delivered').reduce((n, i) => n + (Number.isInteger(i.qty) && i.qty > 0 ? i.qty : 0), 0) })),
          hasMore: page.size === 30, nextCursor: page.size === 30 ? page.docs.at(-1).id : null
        };
      }
      const snap = await tx.get(orders.doc(input.orderId));
      if (!snap.exists) fail('not-found', 'Commande introuvable dans ce club.');
      const order = snap.data();
      if (!selectableStatuses.includes(order.status) || !Array.isArray(order.items)) fail('failed-precondition', 'Cette commande n’est plus à préparer.');
      const lines = order.items.filter(i => i.deliveryMode !== 'digital' && i.fulfillmentStatus !== 'delivered');
      if (!lines.length || lines.some(i => !id(i.lineId) || !Number.isInteger(i.qty) || i.qty <= 0 || !Array.isArray(i.physicalStockUnitIds) || i.physicalStockUnitIds.length !== i.qty || unique(i.physicalStockUnitIds).length !== i.qty || i.physicalStockUnitIds.some(k => !id(k))) || unique(lines.map(i => i.lineId)).length !== lines.length) fail('failed-precondition', 'Commande incomplète : certaines pièces physiques ne sont pas encore attribuées. Scannez les pièces présentes individuellement.');
      const ids = lines.flatMap(i => i.physicalStockUnitIds);
      if (ids.length > MAX_PEERS || unique(ids).length !== ids.length) fail('failed-precondition', 'Pièces de commande incohérentes ou trop nombreuses.');
      const units = [];
      for (const line of lines) for (const unitId of line.physicalStockUnitIds) {
        const unitSnap = await tx.get(club.collection('boutique_physical_stock_units').doc(unitId));
        if (!unitSnap.exists) fail('failed-precondition', 'Une pièce de la commande est introuvable.');
        const unit = asUnit(unitSnap);
        if (unit.inventoryExcluded) fail('failed-precondition', 'Une pièce a été retirée du stock par correction. Vérifiez la commande dans CalyCompta.');
        if (unit.customerOrderId !== input.orderId || unit.customerLineId !== line.lineId || unit.destination !== 'customer_reserved') fail('failed-precondition', 'La réservation d’une pièce a changé. Actualisez la commande.');
        if (unit.saleStatus === 'sold') {
          if (unit.handover?.type !== 'member_qr' || !id(order.buyer?.userId) || unit.handover?.recipientMemberId !== order.buyer.userId || !id(unit.handover?.operationId) || !ms(unit.handover?.confirmedAt)) fail('failed-precondition', 'Une remise de cette commande est à vérifier.');
          continue;
        }
        if (!['not_ready', 'sale_ready'].includes(unit.saleStatus) || unit.location !== input.sourceLocation || unit.transportMissionId) fail('failed-precondition', 'Toutes les pièces restantes ne sont pas présentes au lieu de cette session. Scannez uniquement les pièces présentes individuellement.');
        units.push(publicUnit(unit));
      }
      if (!units.length || units.length > MAX_UNITS) fail('failed-precondition', 'Sélectionnez de 1 à 50 pièces restantes. Une commande plus grande doit être scannée par lots.');
      return { units };
    }
    if (input.action === 'mission' && !await missionAuthorized(mission, false, manager)) fail('permission-denied', 'Mission expirée ou retirée.');
    const requestId = MUTATIONS.has(input.action) ? hash([actor.uid, input.idempotencyKey]) : null;
    const receiptRef = requestId ? club.collection('boutique_stock_operations').doc(requestId) : null;
    const receiptSnap = receiptRef ? await tx.get(receiptRef) : null;
    if (!manager && !['mission','arrive','deliver'].includes(input.action)) fail('permission-denied', 'Fonction Responsable boutique obligatoire.');
    if (['arrive','deliver'].includes(input.action) && !await missionAuthorized(mission, receiptSnap?.exists === true)) fail('permission-denied', 'Cette mission n’est plus autorisée.');
    const requestHash = hash(canonical(Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'preview'))));
    if (receiptSnap?.exists) {
      const saved = receiptSnap.data();
      if (saved.requestHash !== requestHash || saved.actorId !== actor.uid) fail('already-exists', 'Cette confirmation a déjà été utilisée pour une autre action.');
      return { ...saved.result, replayed: true };
    }
    if (input.action === 'revoke') {
      if (!manager) fail('permission-denied', 'Fonction Responsable boutique obligatoire.');
      if (mission.status === 'revoked' || mission.status === 'closed') fail('failed-precondition', 'Cette mission est déjà terminée.');
      const owned = [];
      for (const unitId of mission.unitIds) { const snap = await tx.get(club.collection('boutique_physical_stock_units').doc(unitId)); if (snap.exists) owned.push(snap); }
      const result = { applied: input.preview !== true, revoked: true, missionId: mission.id };
      if (input.preview !== true) {
        for (const snap of owned) { const u = snap.data(), change = {}; if (u.transportMissionId === mission.id) change.transportMissionId = null; if (u.pickupMissionId === mission.id) change.pickupMissionId = null; if (Object.keys(change).length) tx.update(snap.ref, { ...change, updatedAt: now }); }
        tx.update(missionRef, { status: 'revoked', revokedAt: now, revokedBy: actor.uid }); tx.create(receiptRef, { actorId: actor.uid, action: input.action, requestHash, result, createdAt: now }); }
      return result;
    }
    const wanted = input.action === 'mission' ? mission.unitIds : input.units.map(u => u.id);
    if (wanted.length > (input.action === 'move' ? 100 : MAX_UNITS)) fail('failed-precondition', 'Le lot dépasse la limite autorisée.');
    const unitMap = new Map();
    for (const unitId of wanted) {
      const snap = await tx.get(club.collection('boutique_physical_stock_units').doc(unitId));
      if (!snap.exists) fail('not-found', 'Une pièce du lot est introuvable.');
      unitMap.set(unitId, asUnit(snap));
    }
    const selected = wanted.map(unitId => unitMap.get(unitId));
    if (selected.some(unit => unit.inventoryExcluded)) fail('failed-precondition', 'Une pièce a été retirée du stock par correction. Actualisez et vérifiez le lot.');
    if (input.action !== 'mission') for (const unit of selected) {
      if (unit.saleStatus === 'sold') fail('failed-precondition', 'Une pièce a déjà été remise. Actualisez le lot.');
      if (unit.revision !== input.units.find(u => u.id === unit.id).revision) fail('aborted', 'Une pièce a changé. Actualisez et vérifiez la sélection avant de confirmer.');
      if (['arrive','deliver'].includes(input.action) && !mission.unitIds.includes(unit.id)) fail('permission-denied', 'Une pièce ne fait pas partie de cette mission.');
      if (!['arrive','deliver'].includes(input.action) && (!text(input.sourceLocation, 160) || unit.location !== input.sourceLocation)) fail('failed-precondition', 'Toutes les pièces doivent être au lieu de cette session.');
    }
    const orderMap = new Map();
    for (const orderId of unique(selected.map(u => u.customerOrderId).filter(Boolean))) {
      if (!id(orderId)) fail('failed-precondition', 'Réservation client invalide.');
      const snap = await tx.get(club.collection('orders').doc(orderId));
      if (!snap.exists) fail('failed-precondition', 'Commande client introuvable.');
      const order = { ...snap.data(), id: snap.id };
      if (!Array.isArray(order.items)) fail('failed-precondition', 'Articles client invalides.');
      orderMap.set(orderId, order);
    }
    const peerIds = unique([...orderMap.values()].flatMap(o => o.items.flatMap(i => i.physicalStockUnitIds || [])));
    if (peerIds.length > MAX_PEERS || peerIds.some(v => !id(v))) fail('failed-precondition', 'Commande trop grande pour cette confirmation groupée.');
    for (const unitId of peerIds) if (!unitMap.has(unitId)) {
      const snap = await tx.get(club.collection('boutique_physical_stock_units').doc(unitId));
      if (!snap.exists) fail('failed-precondition', 'Une pièce réservée est introuvable.');
      unitMap.set(unitId, asUnit(snap));
    }
    for (const unit of selected.filter(u => u.customerOrderId)) {
      const line = orderMap.get(unit.customerOrderId)?.items.find(i => i.lineId === unit.customerLineId);
      if (!line || !(line.physicalStockUnitIds || []).includes(unit.id) || unit.destination !== 'customer_reserved') fail('failed-precondition', 'La réservation de cette pièce a changé.');
    }
    function needsProduction(unit) {
      const line = orderMap.get(unit.customerOrderId)?.items.find(i => i.lineId === unit.customerLineId);
      return unit.requiresEmbroidery !== false || lineNeedsProduction(line);
    }
    const readyForReservation = unit => ready(unit) && (!needsProduction(unit) || unit.finish === 'returned_embroidered');
    function availability(order, location) {
      const outstanding = order.items.filter(i => i.fulfillmentStatus !== 'delivered');
      const physical = outstanding.filter(i => i.deliveryMode !== 'digital');
      const valid = physical.length > 0 && physical.every(i => Number.isInteger(i.qty) && i.qty > 0 && Array.isArray(i.physicalStockUnitIds) && unique(i.physicalStockUnitIds).length === i.qty && i.deliveryMode === 'pool_pickup' && i.physicalStockUnitIds.every(k => { const u = unitMap.get(k); return u && u.customerOrderId === order.id && u.customerLineId === i.lineId && u.destination === 'customer_reserved'; }));
      const pending = physical.flatMap(i => (i.physicalStockUnitIds || []).map(k => unitMap.get(k)).filter(u => u?.saleStatus !== 'sold'));
      const eligible = new Set(physical.filter(i => i.deliveryMode === 'pool_pickup').flatMap(i => (i.physicalStockUnitIds || []).filter(k => { const u = unitMap.get(k); return u && u.customerOrderId === order.id && u.customerLineId === i.lineId && u.destination === 'customer_reserved'; })));
      const available = pending.filter(u => u && eligible.has(u.id) && readyForReservation(u) && u.location === location && !u.transportMissionId);
      const handoutEligible = physical.every(i => i.deliveryMode === 'pool_pickup');
      const missing = physical.reduce((sum, line) => sum + Math.max(0, (Number.isInteger(line.qty) ? line.qty : 0) - unique(line.physicalStockUnitIds || []).length), 0);
      return { handoutEligible, pending, pendingTotal: pending.length + missing, all: valid && pending.length > 0 && pending.every(u => available.includes(u)), available, remaining: pending.length + missing - available.length };
    }
    function packetsForMission() {
      const arrived = selected.filter(u => mission.arrivedUnitIds.includes(u.id) && !mission.deliveredUnitIds.includes(u.id) && u.saleStatus !== 'sold');
      return [...orderMap.values()].map(order => {
        const pieces = arrived.filter(u => u.customerOrderId === order.id), state = availability(order, mission.destination);
        return { allowPartial: mission.allowPartial === true, orderId: order.id, orderNumber: order.orderNumber || '', buyerId: order.buyer?.userId || '', buyerName: order.buyer?.displayName || pieces[0]?.customerName || 'Membre', units: pieces.map(publicUnit), ready: pieces.length > 0 && paid(order) && pieces.every(u => readyForReservation(u) && u.location === mission.destination && u.pickupMissionId === mission.id) && state.handoutEligible && (mission.allowPartial === true || (state.all && state.pending.every(u => pieces.some(p => p.id === u.id)))), partial: !state.all || pieces.length < state.pendingTotal, remaining: Math.max(0, state.pendingTotal - pieces.length), blockedReason: !paid(order) ? 'Paiement à vérifier dans Calypso.' : !state.handoutEligible ? 'Mode de livraison à vérifier dans Calypso.' : !state.all && !mission.allowPartial ? 'Commande incomplète : remise partielle non autorisée.' : state.all && pieces.length < state.pendingTotal && !mission.allowPartial ? 'Commande répartie entre plusieurs missions : demander au responsable de regrouper les pièces.' : 'Vérifier la présence et la préparation des pièces.' };
      }).filter(p => p.units.length > 0);
    }
    if (input.action === 'mission') return { mission: { id: mission.id, status: mission.status, destination: mission.destination, sourceLocation: mission.sourceLocation, pickupWindow: mission.pickupWindow, pickupPoint: mission.pickupPoint, allowPartial: mission.allowPartial, assigneeNames: mission.assigneeNames, expiresAt: new Date(ms(mission.expiresAt)).toISOString(), total: mission.unitIds.length, arrived: mission.arrivedUnitIds.length, delivered: mission.deliveredUnitIds.length }, units: selected.map(publicUnit), packets: packetsForMission() };
    const stagedUnits = new Map(), stagedOrders = new Map();
    const note = text(input.note);
    const event = (kind, extra = {}) => ({ kind, at: now, by: actor.uid, ...(note ? { note } : {}), ...extra });
    const updateUnit = (unit, change, events) => { const next = { ...unit, ...change, updatedAt: now, history: [...(unit.history || []), ...events] }; stagedUnits.set(unit.id, next); unitMap.set(unit.id, next); };
    let nextMission = mission ? { ...mission } : null;
    if (['move','confirmJim','dispatch'].includes(input.action) && !text(input.destination, 160)) fail('invalid-argument', 'Choisissez le lieu de destination.');
    if (['confirmJim','finishJim','reviewPlain'].includes(input.action) && note.length < 3) fail('invalid-argument', 'Notez le contrôle effectué pour ce lot.');
    if (input.action === 'move') for (const unit of selected) {
      if (unit.location === input.destination) fail('failed-precondition', 'Choisissez un autre emplacement.');
      if (unit.transportMissionId) fail('failed-precondition', 'Réceptionnez ou retirez d’abord la mission de transport.');
      updateUnit(unit, { location: input.destination, pickupMissionId: null, ...(['returned_embroidered','not_required_reviewed'].includes(unit.finish) ? { saleStatus: unit.destination === 'demo' || (needsProduction(unit) && unit.finish !== 'returned_embroidered') ? 'not_ready' : 'sale_ready' } : {}) }, [event('moved', { from: unit.location, to: input.destination })]);
    }
    if (input.action === 'prepareJim' || input.action === 'confirmJim') for (const unit of selected) {
      const required = input.action === 'prepareJim' ? 'unembroidered' : 'to_jim', finish = input.action === 'prepareJim' ? 'to_jim' : 'at_jim';
      if (unit.finish !== required || !needsProduction(unit) || unit.transportMissionId) fail('failed-precondition', 'Une pièce n’est pas à la bonne étape pour Jim.');
      const place = input.action === 'confirmJim' ? input.destination : unit.location;
      if (place === unit.location && input.action === 'confirmJim' && input.confirmed !== true) fail('failed-precondition', 'Confirmez explicitement que les pièces sont déjà chez Jim.');
      updateUnit(unit, { finish, location: place }, [...(place !== unit.location ? [event('moved', { from: unit.location, to: place })] : []), event('finish_changed', { from: unit.finish, to: finish })]);
    }
    if (input.action === 'finishJim') for (const unit of selected) {
      if (unit.finish !== 'at_jim' || unit.workshopReadyAt || unit.transportMissionId) fail('failed-precondition', 'Cette pièce doit être chez Jim et encore à contrôler.');
      updateUnit(unit, { workshopReadyAt: now, workshopReadyBy: actor.uid }, [event('workshop_ready', { to: unit.location })]);
    }
    if (input.action === 'reviewPlain') for (const unit of selected) {
      const line = orderMap.get(unit.customerOrderId)?.items.find(i => i.lineId === unit.customerLineId);
      const confirmsPlainStock = unit.requiresEmbroidery === undefined && Boolean(unit.stockPurchaseOrderId) && !lineNeedsProduction(line);
      if (unit.finish !== 'unembroidered' || (needsProduction(unit) && !confirmsPlainStock) || unit.transportMissionId) fail('failed-precondition', 'Cette pièce nécessite une autre étape de préparation.');
      updateUnit(unit, { finish: 'not_required_reviewed', saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready', ...(confirmsPlainStock ? { requiresEmbroidery: false } : {}) }, [
        ...(confirmsPlainStock ? [event('finish_requirement_confirmed', { to: 'Aucune broderie requise', note })] : []),
        event('finish_changed', { from: unit.finish, to: 'not_required_reviewed' }),
      ]);
    }
    if (input.action === 'dispatch') {
      if (!Array.isArray(input.assigneeIds) || input.assigneeIds.length < 1 || input.assigneeIds.length > 10 || input.assigneeIds.some(v => !id(v)) || unique(input.assigneeIds).length !== input.assigneeIds.length) fail('invalid-argument', 'Choisissez de 1 à 10 personnes différentes pour ce lot.');
      const assignees = [];
      for (const uid of input.assigneeIds) { const snap = await tx.get(club.collection('members').doc(uid)); if (!snap.exists || !active(snap.data())) fail('failed-precondition', 'Un exécutant n’a plus accès à CalyMob.'); assignees.push({ id: uid, name: memberDisplayName(snap.data()) }); }
      const onSite = input.destination === input.sourceLocation;
      if (onSite && (input.confirmed !== true || note.length < 3)) fail('failed-precondition', 'Confirmez la présence sur place et notez le contrôle.');
      if (input.pickupPoint === true && !text(input.pickupWindow, 160)) fail('invalid-argument', 'Indiquez un moment d’enlèvement clair pour les acheteurs.');
      nextMission = { id: requestId, status: onSite ? 'received' : 'transit', unitIds: wanted, arrivedUnitIds: onSite ? wanted : [], deliveredUnitIds: [], assigneeIds: input.assigneeIds, assigneeNames: assignees.map(a => a.name), createdBy: actor.uid, createdAt: now, updatedAt: now, expiresAt: admin.firestore.Timestamp.fromMillis(time + 7 * 86400000), sourceLocation: input.sourceLocation, destination: input.destination, pickupWindow: text(input.pickupWindow, 160), pickupPoint: input.pickupPoint === true, allowPartial: input.allowPartial === true };
      for (const unit of selected) {
        if (unit.transportMissionId || (!readyForReservation(unit) && !(unit.finish === 'at_jim' && unit.workshopReadyAt) && !(unit.destination === 'demo' && ['returned_embroidered','not_required_reviewed'].includes(unit.finish)))) fail('failed-precondition', 'Une pièce n’est pas terminée ou se trouve déjà en transport.');
        const location = onSite ? input.destination : `En transport → ${input.destination}`;
        const finished = onSite && unit.finish === 'at_jim' && unit.workshopReadyAt;
        updateUnit(unit, { location, ...(onSite ? {} : { saleStatus: 'not_ready' }), transportMissionId: onSite ? null : nextMission.id, pickupMissionId: onSite ? nextMission.id : null, ...(finished ? { finish: 'returned_embroidered', saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready' } : {}) }, [...(unit.location !== location ? [event('moved', { from: unit.location, to: location })] : []), event(onSite ? 'arrival_confirmed' : 'transport_assigned', { to: input.destination }), ...(finished ? [event('finish_changed', { from: unit.finish, to: 'returned_embroidered' })] : [])]);
      }
    }
    if (input.action === 'arrive') {
      for (const unit of selected) {
        if (mission.arrivedUnitIds.includes(unit.id) || unit.transportMissionId !== mission.id || unit.location !== `En transport → ${mission.destination}`) fail('failed-precondition', 'Une pièce n’est plus dans ce transport.');
        const finished = unit.finish === 'at_jim' && Boolean(unit.workshopReadyAt);
        if (!finished && (!['returned_embroidered','not_required_reviewed'].includes(unit.finish) || (needsProduction(unit) && unit.finish !== 'returned_embroidered'))) fail('failed-precondition', 'Une pièce n’est pas contrôlée pour la réception.');
        updateUnit(unit, { location: mission.destination, saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready', transportMissionId: null, pickupMissionId: mission.id, ...(finished ? { finish: 'returned_embroidered', saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready' } : {}) }, [event('moved', { from: unit.location, to: mission.destination }), event('arrival_confirmed', { to: mission.destination }), ...(finished ? [event('finish_changed', { from: unit.finish, to: 'returned_embroidered' })] : [])]);
      }
      nextMission.arrivedUnitIds = unique([...mission.arrivedUnitIds, ...wanted]);
      nextMission.status = nextMission.arrivedUnitIds.length === mission.unitIds.length ? 'received' : 'transit';
    }
    if (input.action === 'deliver') {
      if (!id(input.recipientMemberId) || (input.preview !== true && input.confirmed !== true)) fail('invalid-argument', 'Scannez le QR du membre et confirmez la remise physique.');
      const recipient = await tx.get(club.collection('members').doc(input.recipientMemberId));
      if (!recipient.exists) fail('not-found', 'Membre destinataire introuvable dans ce club.');
      for (const unit of selected) {
        const order = orderMap.get(unit.customerOrderId), state = order ? availability(order, mission.destination) : null;
        if (!order || !paid(order) || order.buyer?.userId !== input.recipientMemberId || !readyForReservation(unit) || unit.location !== mission.destination || unit.pickupMissionId !== mission.id || !mission.arrivedUnitIds.includes(unit.id) || !state.handoutEligible || (!mission.allowPartial && (!state.all || state.pending.some(u => !wanted.includes(u.id))))) fail('failed-precondition', 'Vérifiez le destinataire, le paiement et la disponibilité de ces pièces.');
        const proof = { type: 'member_qr', recipientMemberId: input.recipientMemberId, confirmedBy: actor.uid, confirmedByName: memberDisplayName(member), confirmedAt: now, location: mission.destination, missionId: mission.id, operationId: requestId };
        updateUnit(unit, { saleStatus: 'sold', handover: proof }, [event('sale_changed', { from: unit.saleStatus, to: 'sold' }), event('handover_confirmed', { to: input.recipientMemberId, note: 'QR du membre vérifié et remise physique confirmée.' })]);
      }
      nextMission.deliveredUnitIds = unique([...mission.deliveredUnitIds, ...wanted]);
      nextMission.status = nextMission.deliveredUnitIds.length === mission.unitIds.length ? 'closed' : mission.status;
    }
    // Recompute affected customer lines from physical truth without changing money.
    for (const order of orderMap.values()) {
      if (!paid(order)) continue;
      const items = order.items.map(line => {
        const ids = line.physicalStockUnitIds || [];
        if (!ids.some(k => stagedUnits.has(k))) return line;
        if (!Number.isInteger(line.qty) || ids.length > line.qty || unique(ids).length !== ids.length) fail('failed-precondition', 'Quantité physique client incohérente.');
        const peers = ids.map(k => unitMap.get(k));
        if (peers.some(u => !u || u.customerOrderId !== order.id || u.customerLineId !== line.lineId)) fail('failed-precondition', 'La réservation client est incohérente.');
        const delivered = peers.filter(u => u.saleStatus === 'sold');
        const allReady = ids.length === line.qty && peers.every(u => readyForReservation(u) || u.saleStatus === 'sold');
        return { ...line, fulfillmentStatus: delivered.length === line.qty ? 'delivered' : allReady ? 'ready' : 'preparing', productionStatus: allReady ? ((lineNeedsProduction(line) || peers.some(u => u.requiresEmbroidery !== false)) ? 'done' : 'not_required') : peers.some(u => u.finish === 'at_jim') ? 'in_progress' : line.productionStatus || 'queued', ...(delivered.length > 0 && delivered.some(u => u.handover?.type === 'member_qr') ? { deliveredQty: delivered.length, deliveredPhysicalUnitIds: delivered.map(u => u.id), handoverProofType: 'member_qr', ...(delivered.length === line.qty ? { deliveredAt: now, signatureStatus: 'qr_confirmed' } : {}) } : {}) };
      });
      if (JSON.stringify(items) !== JSON.stringify(order.items)) {
        const next = { ...order, items, status: items.every(i => i.fulfillmentStatus === 'delivered') ? 'delivered' : items.every(i => ['ready','delivered'].includes(i.fulfillmentStatus)) ? 'ready' : 'preparing', updatedAt: now };
        stagedOrders.set(order.id, next); orderMap.set(order.id, next);
      }
    }
    const notifications = [], held = [];
    if (nextMission?.pickupPoint && (input.action === 'arrive' || (input.action === 'dispatch' && nextMission.status === 'received'))) for (const order of orderMap.values()) {
      const state = availability(order, nextMission.destination);
      const available = state.available.filter(u => u.pickupMissionId === nextMission.id);
      const complete = state.all && available.length === state.pendingTotal;
      if (!paid(order) || !state.handoutEligible || !available.length || (!complete && !nextMission.allowPartial) || !id(order.buyer?.userId)) { held.push({ orderId: order.id, reason: !paid(order) ? 'payment' : state.all && available.length < state.pendingTotal ? 'regroup' : 'incomplete' }); continue; }
      const notificationId = hash(['boutique-ready-v1', input.clubId, order.id, order.buyer.userId, nextMission.destination, available.map(u => u.id).sort()]);
      const historyRef = club.collection('members').doc(order.buyer.userId).collection('notifications').doc(`boutique_${notificationId}`);
      const existing = await tx.get(historyRef);
      if (existing.exists) continue;
      notifications.push({ notificationId, historyRef, order, unitIds: available.map(u => u.id), partial: !complete, remaining: Math.max(0, state.pendingTotal - available.length) });
    }
    const result = { applied: input.preview !== true, action: input.action, count: wanted.length, missionId: nextMission?.id || null, missionClosed: nextMission?.status === 'closed', notificationCount: notifications.length, heldOrders: held, recipientName: input.action === 'deliver' ? orderMap.values().next().value?.buyer?.displayName || 'Membre' : null, destination: nextMission?.destination || input.destination || input.sourceLocation, expiresAt: nextMission ? new Date(ms(nextMission.expiresAt)).toISOString() : null };
    if (input.preview === true) return result;
    for (const unit of stagedUnits.values()) { const { id: unitId, revision: unused, ...data } = unit; tx.set(club.collection('boutique_physical_stock_units').doc(unitId), data); }
    for (const order of stagedOrders.values()) tx.update(club.collection('orders').doc(order.id), { items: order.items, status: order.status, updatedAt: now });
    if (nextMission) { const { id: missionId, ...data } = nextMission; tx.set(club.collection('boutique_pickup_missions').doc(missionId), { ...data, updatedAt: now }); }
    for (const entry of notifications) {
      const title = entry.partial ? 'Boutique · une partie de votre commande est prête' : 'Boutique · votre commande est prête';
      const labels = new Map();
      for (const unitId of entry.unitIds) { const u = unitMap.get(unitId), label = `${u.productName || 'Article'}${u.variantLabel ? ` · ${u.variantLabel}` : ''}`.slice(0, 120); labels.set(label, (labels.get(label) || 0) + 1); }
      const articles = [...labels].slice(0, 3).map(([label, count]) => `${label} ×${count}`).join(', ') + (labels.size > 3 ? ', …' : '');
      const body = `${entry.unitIds.length} article(s) (${articles}) de ${entry.order.orderNumber || 'votre commande'} à retirer : ${nextMission.destination}. ${nextMission.pickupWindow}${entry.partial ? ` · ${entry.remaining} pièce(s) encore en attente.` : ''}`;
      const data = { type: 'boutique_pickup_ready', clubId: input.clubId, recipientId: entry.order.buyer.userId, messageId: entry.notificationId, orderId: entry.order.id, missionId: nextMission.id };
      tx.create(entry.historyRef, { title, body, type: data.type, category: 'Boutique', data, created_at: now, read: false, read_at: null });
      tx.create(club.collection('boutique_pickup_notifications').doc(entry.notificationId), { status: 'pending', recipientId: entry.order.buyer.userId, orderId: entry.order.id, unitIds: entry.unitIds, missionId: nextMission.id, title, body, data, createdAt: now });
    }
    if (input.action === 'deliver') tx.create(club.collection('boutique_handover_receipts').doc(requestId), { type: 'member_qr', recipientMemberId: input.recipientMemberId, confirmedBy: actor.uid, confirmedByName: memberDisplayName(member), confirmedAt: now, location: mission.destination, missionId: mission.id, unitIds: wanted, orderIds: [...orderMap.keys()], note });
    tx.create(club.collection('audit_logs').doc(`boutique_${requestId}`), { action: `boutique.mobile.${input.action}`, userId: actor.uid, targetId: nextMission?.id || requestId, targetType: 'boutique_physical_session', clubId: input.clubId, timestamp: now, details: { unitIds: wanted, location: result.destination, notificationCount: notifications.length } });
    tx.create(receiptRef, { actorId: actor.uid, action: input.action, requestHash, result, createdAt: now });
    return result;
  });
}

exports.executePhysicalOperation = executePhysicalOperation;
exports.paidForPickup = paid;
exports.lineNeedsProduction = lineNeedsProduction;
exports.boutiquePhysicalOperations = onCall({ region: REGION, memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 }, async request => {
  const actor = { uid: request.auth?.uid, ...(request.auth?.token && Object.hasOwn(request.auth.token, 'clubId') ? { clubClaim: request.auth.token.clubId } : {}) };
  return executePhysicalOperation(admin.firestore(), actor, request.data);
});

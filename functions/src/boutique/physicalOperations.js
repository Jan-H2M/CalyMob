/** Server-authoritative CalyMob stock sessions. Never accepts financial edits or client roles. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { createHash } = require('node:crypto');
const { REGION, hasBoutiqueResponsibility } = require('./shared');
const { memberDisplayName } = require('../utils/memberName');

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MUTATIONS = new Set(['move', 'prepareJim', 'confirmJim', 'finishJim', 'reviewPlain', 'dispatch', 'arrive', 'deliver', 'revoke']);
const READS = new Set(['access', 'list', 'lookup', 'missions', 'mission']);
const ALLOWED = new Set(['action', 'clubId', 'unitId', 'units', 'sourceLocation', 'destination', 'note', 'assigneeIds', 'missionId', 'recipientMemberId', 'confirmed', 'allowPartial', 'pickupPoint', 'pickupWindow', 'idempotencyKey', 'preview']);
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
const ready = (unit) => ['returned_embroidered', 'not_required_reviewed'].includes(unit.finish) && unit.saleStatus === 'sale_ready';
const paid = (order) => order?.payment?.status === 'paid' && !order.payment.lastMatchError && order.paymentAdjustment?.type !== 'additional_payment_due' && order.additional_payment_due !== true && ['paid', 'preparing', 'ready', 'delivered'].includes(order.status);
const revision = (snap) => snap.updateTime ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : hash(snap.data());
const asUnit = (snap) => ({ ...snap.data(), id: snap.id, revision: revision(snap) });
const publicUnit = (unit) => Object.fromEntries(['id','revision','productName','variantLabel','location','destination','finish','saleStatus','customerOrderId','customerLineId','customerName','requiresEmbroidery','pickupMissionId','transportMissionId'].map(k => [k, unit[k] ?? null]).concat([['workshopReady', Boolean(unit.workshopReadyAt)]]));

function validate(input, actor) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !ALLOWED.has(k)) || !id(input.clubId) || (!READS.has(input.action) && !MUTATIONS.has(input.action))) fail('invalid-argument', 'Demande Boutique invalide.');
  if (!id(actor?.uid)) fail('unauthenticated', 'Connectez-vous à CalyMob.');
  if (Object.hasOwn(actor, 'clubClaim') && actor.clubClaim !== input.clubId) fail('permission-denied', 'Le club ne correspond pas au compte connecté.');
  if (['lookup'].includes(input.action) && !id(input.unitId)) fail('invalid-argument', 'Pièce invalide.');
  if (input.missionId !== undefined && !id(input.missionId)) fail('invalid-argument', 'Mission invalide.');
  if (!MUTATIONS.has(input.action)) return;
  if (!id(input.idempotencyKey) || input.idempotencyKey.length < 16) fail('invalid-argument', 'Identifiant de confirmation obligatoire.');
  if (input.action !== 'revoke') {
    if (!Array.isArray(input.units) || !input.units.length || input.units.length > MAX_UNITS || input.units.some(u => !u || Object.keys(u).some(k => !['id', 'revision'].includes(k)) || !id(u.id) || typeof u.revision !== 'string' || !u.revision || u.revision.length > 150) || unique(input.units.map(u => u.id)).length !== input.units.length) fail('invalid-argument', 'Sélectionnez de 1 à 50 pièces différentes.');
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
    async function listMissions() {
      const query = manager ? club.collection('boutique_pickup_missions').where('status', 'in', ['transit', 'received']).limit(100) : club.collection('boutique_pickup_missions').where('assigneeIds', 'array-contains', actor.uid).limit(100);
      const snap = await tx.get(query), missions = [];
      for (const doc of snap.docs) if (await missionAuthorized(doc.data(), false, manager)) missions.push({ ...doc.data(), id: doc.id });
      return { missions, hasMore: snap.size === 100 };
    }
    const missionRef = input.missionId ? club.collection('boutique_pickup_missions').doc(input.missionId) : null;
    const missionSnap = missionRef ? await tx.get(missionRef) : null;
    const mission = missionSnap?.exists ? { ...missionSnap.data(), id: missionSnap.id } : null;
    if (input.action === 'access') {
      const { missions } = await listMissions();
      return { enabled: true, canManage: manager, hasAssignments: missions.length > 0 };
    }
    if (input.action === 'missions') {
      const result = await listMissions();
      return { missions: result.missions.map(m => ({ id: m.id, destination: m.destination, sourceLocation: m.sourceLocation, pickupWindow: m.pickupWindow, status: m.status, expiresAt: new Date(ms(m.expiresAt)).toISOString(), total: m.unitIds.length, arrived: m.arrivedUnitIds.length, delivered: m.deliveredUnitIds.length, assigneeNames: m.assigneeNames, allowPartial: m.allowPartial, pickupPoint: m.pickupPoint })), hasMore: result.hasMore };
    }
    if (['mission', 'arrive', 'deliver', 'revoke'].includes(input.action) && !mission) fail('not-found', 'Mission introuvable.');
    if (input.action === 'lookup') {
      if (!manager && (!mission || !await missionAuthorized(mission) || !mission.unitIds.includes(input.unitId))) fail('permission-denied', 'Cette pièce ne fait pas partie de votre mission.');
      const snap = await tx.get(club.collection('boutique_physical_stock_units').doc(input.unitId));
      if (!snap.exists) fail('not-found', 'Pièce introuvable dans ce club.');
      const unit = asUnit(snap);
      if (!manager && unit.transportMissionId !== mission.id && unit.pickupMissionId !== mission.id && unit.handover?.missionId !== mission.id) fail('permission-denied', 'Cette pièce a quitté votre mission.');
      return { unit: publicUnit(unit) };
    }
    if (input.action === 'list') {
      if (!manager) fail('permission-denied', 'Fonction Responsable boutique obligatoire.');
      const [units, members] = await Promise.all([tx.get(club.collection('boutique_physical_stock_units').where('saleStatus', 'in', ['not_ready', 'sale_ready']).limit(200)), tx.get(club.collection('members').where('member_status', '==', 'active').limit(500))]);
      return { units: units.docs.map(s => publicUnit(asUnit(s))), hasMore: units.size === 200, assignees: members.docs.filter(s => active(s.data())).map(s => ({ id: s.id, name: memberDisplayName(s.data()), accueil: (s.data().clubStatuten || []).some(v => ['a','accueil'].includes(String(v).toLowerCase())) })) };
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
    if (wanted.length > MAX_UNITS) fail('failed-precondition', 'Le lot dépasse la limite de 50 pièces.');
    const unitMap = new Map();
    for (const unitId of wanted) {
      const snap = await tx.get(club.collection('boutique_physical_stock_units').doc(unitId));
      if (!snap.exists) fail('not-found', 'Une pièce du lot est introuvable.');
      unitMap.set(unitId, asUnit(snap));
    }
    const selected = wanted.map(unitId => unitMap.get(unitId));
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
    function availability(order, location) {
      const outstanding = order.items.filter(i => i.fulfillmentStatus !== 'delivered');
      const physical = outstanding.filter(i => i.deliveryMode !== 'digital');
      const valid = physical.length > 0 && physical.every(i => Number.isInteger(i.qty) && i.qty > 0 && Array.isArray(i.physicalStockUnitIds) && unique(i.physicalStockUnitIds).length === i.qty && i.deliveryMode === 'pool_pickup');
      const pending = physical.flatMap(i => (i.physicalStockUnitIds || []).map(k => unitMap.get(k)).filter(u => u?.saleStatus !== 'sold'));
      const eligible = new Set(physical.filter(i => i.deliveryMode === 'pool_pickup').flatMap(i => i.physicalStockUnitIds || []));
      const available = pending.filter(u => u && eligible.has(u.id) && ready(u) && u.location === location && !u.transportMissionId);
      const handoutEligible = physical.every(i => i.deliveryMode === 'pool_pickup');
      return { handoutEligible, pending, all: valid && pending.length > 0 && pending.every(u => available.includes(u)), available, remaining: pending.length - available.length };
    }
    function packetsForMission() {
      const arrived = selected.filter(u => mission.arrivedUnitIds.includes(u.id) && !mission.deliveredUnitIds.includes(u.id) && u.saleStatus !== 'sold');
      return [...orderMap.values()].map(order => {
        const pieces = arrived.filter(u => u.customerOrderId === order.id), state = availability(order, mission.destination);
        return { orderId: order.id, orderNumber: order.orderNumber || '', buyerId: order.buyer?.userId || '', buyerName: order.buyer?.displayName || pieces[0]?.customerName || 'Membre', units: pieces.map(publicUnit), ready: pieces.length > 0 && paid(order) && pieces.every(u => ready(u) && u.location === mission.destination && u.pickupMissionId === mission.id) && state.handoutEligible && (mission.allowPartial === true || (state.all && state.pending.every(u => pieces.some(p => p.id === u.id)))), partial: !state.all, remaining: state.remaining, blockedReason: !paid(order) ? 'Paiement à vérifier dans Calypso.' : !state.handoutEligible ? 'Mode de livraison à vérifier dans Calypso.' : !state.all && !mission.allowPartial ? 'Commande incomplète : remise partielle non autorisée.' : 'Vérifier la présence et la préparation des pièces.' };
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
      updateUnit(unit, { location: input.destination, pickupMissionId: null, ...(['returned_embroidered','not_required_reviewed'].includes(unit.finish) ? { saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready' } : {}) }, [event('moved', { from: unit.location, to: input.destination })]);
    }
    if (input.action === 'prepareJim' || input.action === 'confirmJim') for (const unit of selected) {
      const required = input.action === 'prepareJim' ? 'unembroidered' : 'to_jim', finish = input.action === 'prepareJim' ? 'to_jim' : 'at_jim';
      if (unit.finish !== required || unit.requiresEmbroidery === false || unit.transportMissionId) fail('failed-precondition', 'Une pièce n’est pas à la bonne étape pour Jim.');
      const place = input.action === 'confirmJim' ? input.destination : unit.location;
      if (place === unit.location && input.action === 'confirmJim' && input.confirmed !== true) fail('failed-precondition', 'Confirmez explicitement que les pièces sont déjà chez Jim.');
      updateUnit(unit, { finish, location: place }, [...(place !== unit.location ? [event('moved', { from: unit.location, to: place })] : []), event('finish_changed', { from: unit.finish, to: finish })]);
    }
    if (input.action === 'finishJim') for (const unit of selected) {
      if (unit.finish !== 'at_jim' || unit.workshopReadyAt || unit.transportMissionId) fail('failed-precondition', 'Cette pièce doit être chez Jim et encore à contrôler.');
      updateUnit(unit, { workshopReadyAt: now, workshopReadyBy: actor.uid }, [event('workshop_ready', { to: unit.location })]);
    }
    if (input.action === 'reviewPlain') for (const unit of selected) {
      if (unit.finish !== 'unembroidered' || unit.requiresEmbroidery !== false || unit.transportMissionId) fail('failed-precondition', 'Cette pièce nécessite une autre étape de préparation.');
      updateUnit(unit, { finish: 'not_required_reviewed', saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready' }, [event('finish_changed', { from: unit.finish, to: 'not_required_reviewed' })]);
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
        if (unit.transportMissionId || (!ready(unit) && !(unit.finish === 'at_jim' && unit.workshopReadyAt) && !(unit.destination === 'demo' && ['returned_embroidered','not_required_reviewed'].includes(unit.finish)))) fail('failed-precondition', 'Une pièce n’est pas terminée ou se trouve déjà en transport.');
        const location = onSite ? input.destination : `En transport → ${input.destination}`;
        const finished = onSite && unit.finish === 'at_jim' && unit.workshopReadyAt;
        updateUnit(unit, { location, ...(onSite ? {} : { saleStatus: 'not_ready' }), transportMissionId: onSite ? null : nextMission.id, pickupMissionId: onSite ? nextMission.id : null, ...(finished ? { finish: 'returned_embroidered', saleStatus: unit.destination === 'demo' ? 'not_ready' : 'sale_ready' } : {}) }, [...(unit.location !== location ? [event('moved', { from: unit.location, to: location })] : []), event(onSite ? 'arrival_confirmed' : 'transport_assigned', { to: input.destination }), ...(finished ? [event('finish_changed', { from: unit.finish, to: 'returned_embroidered' })] : [])]);
      }
    }
    if (input.action === 'arrive') {
      for (const unit of selected) {
        if (mission.arrivedUnitIds.includes(unit.id) || unit.transportMissionId !== mission.id || unit.location !== `En transport → ${mission.destination}`) fail('failed-precondition', 'Une pièce n’est plus dans ce transport.');
        const finished = unit.finish === 'at_jim' && Boolean(unit.workshopReadyAt);
        if (!finished && !['returned_embroidered','not_required_reviewed'].includes(unit.finish)) fail('failed-precondition', 'Une pièce n’est pas contrôlée pour la réception.');
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
        if (!order || !paid(order) || order.buyer?.userId !== input.recipientMemberId || !ready(unit) || unit.location !== mission.destination || unit.pickupMissionId !== mission.id || !mission.arrivedUnitIds.includes(unit.id) || !state.handoutEligible || (!mission.allowPartial && (!state.all || state.pending.some(u => !wanted.includes(u.id))))) fail('failed-precondition', 'Vérifiez le destinataire, le paiement et la disponibilité de ces pièces.');
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
        if (!Number.isInteger(line.qty) || ids.length !== line.qty || unique(ids).length !== line.qty) return line;
        const peers = ids.map(k => unitMap.get(k));
        if (peers.some(u => !u || u.customerOrderId !== order.id || u.customerLineId !== line.lineId)) fail('failed-precondition', 'La réservation client est incohérente.');
        const delivered = peers.filter(u => u.saleStatus === 'sold');
        const allReady = peers.every(u => ready(u) || u.saleStatus === 'sold');
        return { ...line, fulfillmentStatus: delivered.length === line.qty ? 'delivered' : allReady ? 'ready' : 'preparing', productionStatus: allReady ? (peers.some(u => u.requiresEmbroidery !== false) ? 'done' : 'not_required') : line.productionStatus || 'in_progress', ...(input.action === 'deliver' ? { deliveredQty: delivered.length, deliveredPhysicalUnitIds: delivered.map(u => u.id), handoverProofType: 'member_qr', ...(delivered.length === line.qty ? { deliveredAt: now, signatureStatus: 'qr_confirmed' } : {}) } : {}) };
      });
      if (JSON.stringify(items) !== JSON.stringify(order.items)) {
        const next = { ...order, items, status: items.every(i => i.fulfillmentStatus === 'delivered') ? 'delivered' : items.every(i => ['ready','delivered'].includes(i.fulfillmentStatus)) ? 'ready' : 'preparing', updatedAt: now };
        stagedOrders.set(order.id, next); orderMap.set(order.id, next);
      }
    }
    const notifications = [], held = [];
    if (nextMission?.pickupPoint && (input.action === 'arrive' || (input.action === 'dispatch' && nextMission.status === 'received'))) for (const order of orderMap.values()) {
      const state = availability(order, nextMission.destination);
      if (!paid(order) || !state.handoutEligible || !state.available.length || (!state.all && !nextMission.allowPartial) || !id(order.buyer?.userId)) { held.push({ orderId: order.id, reason: !paid(order) ? 'payment' : 'incomplete' }); continue; }
      const notificationId = hash(['boutique-ready-v1', input.clubId, order.id, order.buyer.userId, nextMission.destination, state.available.map(u => u.id).sort()]);
      const historyRef = club.collection('members').doc(order.buyer.userId).collection('notifications').doc(`boutique_${notificationId}`);
      const existing = await tx.get(historyRef);
      if (existing.exists) continue;
      notifications.push({ notificationId, historyRef, order, unitIds: state.available.map(u => u.id), partial: !state.all, remaining: state.remaining });
    }
    const result = { applied: input.preview !== true, action: input.action, count: wanted.length, missionId: nextMission?.id || null, notificationCount: notifications.length, heldOrders: held, recipientName: input.action === 'deliver' ? orderMap.values().next().value?.buyer?.displayName || 'Membre' : null, destination: nextMission?.destination || input.destination || input.sourceLocation, expiresAt: nextMission ? new Date(ms(nextMission.expiresAt)).toISOString() : null };
    if (input.preview === true) return result;
    for (const unit of stagedUnits.values()) { const { id: unitId, revision: unused, ...data } = unit; tx.set(club.collection('boutique_physical_stock_units').doc(unitId), data); }
    for (const order of stagedOrders.values()) tx.update(club.collection('orders').doc(order.id), { items: order.items, status: order.status, updatedAt: now });
    if (nextMission) { const { id: missionId, ...data } = nextMission; tx.set(club.collection('boutique_pickup_missions').doc(missionId), { ...data, updatedAt: now }); }
    for (const entry of notifications) {
      const title = entry.partial ? 'Boutique · une partie de votre commande est prête' : 'Boutique · votre commande est prête';
      const body = `${entry.unitIds.length} article(s) de ${entry.order.orderNumber || 'votre commande'} à retirer : ${nextMission.destination}. ${nextMission.pickupWindow}${entry.partial ? ` · ${entry.remaining} pièce(s) encore en attente.` : ''}`;
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
exports.boutiquePhysicalOperations = onCall({ region: REGION, memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 }, async request => {
  const actor = { uid: request.auth?.uid, ...(request.auth?.token && Object.hasOwn(request.auth.token, 'clubId') ? { clubClaim: request.auth.token.clubId } : {}) };
  return executePhysicalOperation(admin.firestore(), actor, request.data);
});

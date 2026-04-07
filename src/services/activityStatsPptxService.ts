/**
 * Activity Statistics PowerPoint Generation Service
 * Generates a PPTX report with event/activity charts (client-side)
 *
 * Data sources (verified):
 *   - operations:            clubs/{clubId}/operations
 *                            filter: type='evenement', event_category='plongee'|'sortie'
 *   - inscriptions:          clubs/{clubId}/operations/{id}/inscriptions  (subcollection)
 *                            used for: member name → participation ranking (slide 5)
 *   - transactions_bancaires: clubs/{clubId}/transactions_bancaires
 *                            filter: operation_id|evenement_id ∈ eventIds, montant > 0
 *                            used for: event ranking (slide 4) + revenue (slide 6)
 *                            → more reliable than inscriptions because members don't always
 *                              register through the app but they do pay by bank transfer
 *
 * Fields used:
 *   Operation:      titre, event_category, date_debut, lieu
 *   Inscription:    membre_nom, membre_prenom
 *   Transaction:    operation_id, evenement_id (legacy), montant
 */
import pptxgen from 'pptxgenjs';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

// ── Colors ────────────────────────────────────────────────────
const C = {
  bg: 'FFFFFF', bgAlt: 'F7F9FC',
  primary: '065A82', secondary: '1C7293', accent: '00B4D8',
  text: '1E293B', textMid: '475569', textLight: '94A3B8',
  grid: 'E2E8F0', headerBg: '065A82',
  plongee: '065A82', sortie: 'E07A5F', participants: '2A9D8F',
};

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

// ── Helpers ───────────────────────────────────────────────────
function addSlideHeader(pres: pptxgen, slide: pptxgen.Slide, title: string, subtitle?: string) {
  slide.background = { color: C.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
  slide.addText(title, {
    x: 0.5, y: 0.12, w: 8.5, h: 0.5, fontSize: 22, fontFace: 'Georgia',
    color: C.primary, bold: true, margin: 0,
  });
  slide.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.68, w: 9, h: 0.01, fill: { color: C.grid } });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.72, w: 8, h: 0.25, fontSize: 9, fontFace: 'Arial',
      color: C.textMid, margin: 0, italic: true,
    });
  }
}

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === 'object' && val !== null && 'toDate' in val) return (val as Timestamp).toDate();
  if (typeof val === 'string') { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
  return null;
}

/** Truncate a label for chart display */
function trunc(s: string, max = 28): string {
  const clean = s.trim();
  return clean.length > max ? clean.substring(0, max - 1) + '.' : clean;
}

function noDataText(slide: pptxgen.Slide, msg = 'Aucune donnee disponible pour cette annee.') {
  slide.addText(msg, {
    x: 1, y: 2.5, w: 8, h: 0.5, fontSize: 14, fontFace: 'Arial',
    color: C.textMid, align: 'center',
  });
}

// ── Main export ───────────────────────────────────────────────
export async function generateActivityStatsPptx(clubId: string, year: number): Promise<void> {
  logger.debug('Generating activity statistics PPTX for year', year);

  // ════════════════════════════════════════════════════════════
  // 1. FETCH OPERATIONS
  // ════════════════════════════════════════════════════════════
  const opsSnap = await getDocs(collection(db, 'clubs', clubId, 'operations'));
  const allOps = opsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Record<string, any>[];

  // Keep only: current year + evenement + plongee or sortie (no piscine)
  const events = allOps.filter(o => {
    const d = toDate(o.date_debut);
    return (
      d &&
      d.getFullYear() === year &&
      o.type === 'evenement' &&
      (o.event_category === 'plongee' || o.event_category === 'sortie')
    );
  });
  const eventIds = new Set(events.map(e => e.id));

  // ════════════════════════════════════════════════════════════
  // 2. FETCH INSCRIPTIONS (subcollection) — for member names only
  // ════════════════════════════════════════════════════════════
  const eventWithInscr = await Promise.all(
    events.map(async e => {
      const snap = await getDocs(
        collection(db, 'clubs', clubId, 'operations', e.id, 'inscriptions')
      );
      const inscriptions = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Record<string, any>[];
      return { event: e, inscriptions };
    })
  );

  // ════════════════════════════════════════════════════════════
  // 3. FETCH BANK TRANSACTIONS — primary participation metric
  //    More reliable than inscriptions: members pay by bank transfer
  //    even when they don't register through the app.
  //    A transaction linked to an event (operation_id | evenement_id)
  //    with montant > 0 represents a real participation payment.
  // ════════════════════════════════════════════════════════════
  const txSnap = await getDocs(collection(db, 'clubs', clubId, 'transactions_bancaires'));
  const allTx = txSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Record<string, any>[];

  // Only revenue transactions (montant > 0) linked to one of our events
  const linkedTx = allTx.filter(tx => {
    const linkedId = tx.operation_id || tx.evenement_id;
    return linkedId && eventIds.has(linkedId) && Number(tx.montant ?? 0) > 0;
  });

  // Group transactions by event
  const txByEvent: Record<string, { count: number; revenue: number }> = {};
  linkedTx.forEach(tx => {
    const eid = tx.operation_id || tx.evenement_id;
    if (!txByEvent[eid]) txByEvent[eid] = { count: 0, revenue: 0 };
    txByEvent[eid].count++;
    txByEvent[eid].revenue += Number(tx.montant) || 0;
  });

  // ════════════════════════════════════════════════════════════
  // 4. COMPUTE STATS
  // ════════════════════════════════════════════════════════════

  // Events by category
  const byCat = { plongee: 0, sortie: 0 };
  events.forEach(e => {
    if (e.event_category === 'plongee') byCat.plongee++;
    else if (e.event_category === 'sortie') byCat.sortie++;
  });

  // Monthly distribution
  const monthly: Record<number, { plongee: number; sortie: number }> = {};
  for (let m = 1; m <= 12; m++) monthly[m] = { plongee: 0, sortie: 0 };
  events.forEach(e => {
    const d = toDate(e.date_debut);
    if (!d) return;
    const m = d.getMonth() + 1;
    if (e.event_category === 'plongee') monthly[m].plongee++;
    else if (e.event_category === 'sortie') monthly[m].sortie++;
  });

  // Top 10 events by bank transaction count (most reliable participation signal)
  // Fall back to inscription count for events with no bank transactions yet
  const topEvents = events
    .map(e => {
      const txCount = txByEvent[e.id]?.count ?? 0;
      const inscrCount = eventWithInscr.find(d => d.event.id === e.id)?.inscriptions.length ?? 0;
      return {
        titre: String(e.titre || e.id),
        count: txCount > 0 ? txCount : inscrCount,
        source: txCount > 0 ? 'bank' : 'inscriptions',
      };
    })
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top 10 participants from inscriptions (only source with member names)
  const byMember: Record<string, { name: string; count: number }> = {};
  eventWithInscr.forEach(({ inscriptions }) => {
    inscriptions.forEach(i => {
      const name = `${i.membre_prenom || ''} ${i.membre_nom || ''}`.trim();
      if (!name) return;
      if (!byMember[name]) byMember[name] = { name, count: 0 };
      byMember[name].count++;
    });
  });
  const topMembers = Object.values(byMember).sort((a, b) => b.count - a.count).slice(0, 10);

  // Unique participants: prefer bank transaction count as proxy
  // (each revenue tx = 1 payment = typically 1 participant)
  const uniqueParticipantsByInscr = Object.keys(byMember).length;
  // Use inscription-based unique count (bank tx may have duplicates per person)
  const uniqueParticipants = uniqueParticipantsByInscr;

  // Total inscriptions (from inscriptions subcollection)
  const totalInscriptions = eventWithInscr.reduce((sum, { inscriptions }) => sum + inscriptions.length, 0);

  // Revenue: sum of all linked positive bank transactions
  const totalRevenue = linkedTx.reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);

  // Average bank payments per event (only events that have transactions)
  const eventsWithTx = Object.keys(txByEvent).length;
  const avgTxPerEvent = eventsWithTx > 0
    ? Math.round((linkedTx.length / eventsWithTx) * 10) / 10
    : 0;

  // Dive locations
  const byLieu: Record<string, number> = {};
  events
    .filter(e => e.event_category === 'plongee' && e.lieu)
    .forEach(e => { byLieu[e.lieu] = (byLieu[e.lieu] || 0) + 1; });

  // ════════════════════════════════════════════════════════════
  // 5. BUILD PRESENTATION
  // ════════════════════════════════════════════════════════════
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'CalyCompta';
  pres.title = `Rapport Activites ${year} - Calypso Diving Club`;

  // ── SLIDE 1: TITRE ──────────────────────────────────────────
  let slide = pres.addSlide();
  slide.background = { color: C.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
  slide.addText('CALYPSO DIVING CLUB', {
    x: 0.5, y: 1.0, w: 9, h: 0.5, fontSize: 16, fontFace: 'Arial',
    color: C.accent, align: 'center', charSpacing: 6,
  });
  slide.addText("Rapport d'Activites", {
    x: 0.5, y: 1.8, w: 9, h: 0.8, fontSize: 38, fontFace: 'Georgia',
    color: C.primary, bold: true, align: 'center',
  });
  slide.addText(`Annee ${year}`, {
    x: 0.5, y: 2.6, w: 9, h: 0.4, fontSize: 18, fontFace: 'Arial',
    color: C.textMid, align: 'center',
  });
  slide.addShape(pres.ShapeType.rect, { x: 4, y: 3.2, w: 2, h: 0.02, fill: { color: C.accent } });
  slide.addText(`Rapport genere le ${new Date().toLocaleDateString('fr-BE')}`, {
    x: 0.5, y: 3.5, w: 9, h: 0.3, fontSize: 9, fontFace: 'Arial',
    color: C.textLight, align: 'center', italic: true,
  });

  // ── SLIDE 2: VUE D'ENSEMBLE ──────────────────────────────────
  slide = pres.addSlide();
  addSlideHeader(pres, slide, "Vue d'ensemble",
    `${events.length} evenements (plongees & sorties) en ${year}`);

  const kpis = [
    { v: String(events.length),       l: 'Evenements',           c: C.primary },
    { v: String(byCat.plongee),       l: 'Plongees',             c: C.plongee },
    { v: String(byCat.sortie),        l: 'Sorties',              c: C.sortie },
    { v: String(uniqueParticipants),  l: 'Participants\nuniques', c: C.participants },
  ];
  kpis.forEach((k, i) => {
    const x = 0.5 + i * 2.3;
    slide.addShape(pres.ShapeType.rect, {
      x, y: 1.1, w: 2.05, h: 1.15,
      fill: { color: C.bgAlt }, line: { color: C.grid, width: 0.5 },
    });
    slide.addText(k.v, {
      x, y: 1.1, w: 2.05, h: 0.7, fontSize: 32, fontFace: 'Georgia',
      color: k.c, bold: true, align: 'center', valign: 'bottom', margin: 0,
    });
    slide.addText(k.l, {
      x, y: 1.8, w: 2.05, h: 0.4, fontSize: 9, fontFace: 'Arial',
      color: C.textMid, align: 'center', valign: 'top', margin: 0,
    });
  });

  if (byCat.plongee + byCat.sortie > 0) {
    slide.addChart(pres.ChartType.pie, [{
      name: 'Categorie',
      labels: [`Plongee (${byCat.plongee})`, `Sortie (${byCat.sortie})`],
      values: [byCat.plongee, byCat.sortie],
    }], {
      x: 1.5, y: 2.5, w: 7, h: 2.8,
      chartColors: [C.plongee, C.sortie],
      showPercent: true,
      dataLabelColor: 'FFFFFF', dataLabelFontSize: 13, dataLabelFontBold: true,
      showLegend: true, legendPos: 'b', legendFontSize: 11, legendColor: C.textMid,
    });
  }

  // ── SLIDE 3: CALENDRIER MENSUEL ──────────────────────────────
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Calendrier des Activites',
    `Distribution mensuelle — ${events.length} evenements`);

  slide.addChart(pres.ChartType.bar, [
    { name: 'Plongee', labels: MONTHS, values: Object.values(monthly).map(m => m.plongee) },
    { name: 'Sortie',  labels: MONTHS, values: Object.values(monthly).map(m => m.sortie) },
  ], {
    x: 0.3, y: 1.1, w: 9.2, h: 4.2,
    barDir: 'col', barGrouping: 'stacked',
    chartColors: [C.plongee, C.sortie],
    chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
    catAxisLabelColor: C.textMid, catAxisLabelFontSize: 10,
    valAxisLabelColor: C.textLight, valAxisLabelFontSize: 9,
    valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
    showValue: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 9,
    showLegend: true, legendPos: 'b', legendFontSize: 10, legendColor: C.textMid,
  });

  // ── SLIDE 4: TOP 10 EVENEMENTS ────────────────────────────────
  // Ranked by bank transaction count (= actual payments received per event)
  // Falls back to inscription count when no transactions are linked yet
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Top 10 Evenements',
    'Classes par nombre de participations (paiements bancaires)');

  if (topEvents.length > 0) {
    // Reverse: pptxgenjs renders horizontal bars bottom→top, index 0 = bottom
    const chartEvents = [...topEvents].reverse();
    slide.addChart(pres.ChartType.bar, [{
      name: 'Participants',
      labels: chartEvents.map(e => trunc(e.titre, 30)),
      values: chartEvents.map(e => e.count),
    }], {
      x: 0.2, y: 1.0, w: 9.4, h: 4.3,
      barDir: 'bar', barGrouping: 'clustered',
      chartColors: [C.secondary],
      chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
      catAxisLabelColor: C.text, catAxisLabelFontSize: 9,
      valAxisLabelColor: C.textLight, valAxisLabelFontSize: 8,
      valAxisMaxVal: Math.ceil((topEvents[0]?.count ?? 1) * 1.2),
      valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
      showValue: true, dataLabelPosition: 'outEnd',
      dataLabelColor: C.text, dataLabelFontSize: 10,
      showLegend: false,
    });
  } else {
    noDataText(slide);
  }

  // ── SLIDE 5: TOP 10 PARTICIPANTS ─────────────────────────────
  // Based on inscriptions (the only source with member names)
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Top 10 Participants',
    'Classes par nombre de participations (source: inscriptions)');

  if (topMembers.length > 0) {
    const chartMembers = [...topMembers].reverse();
    slide.addChart(pres.ChartType.bar, [{
      name: 'Participations',
      labels: chartMembers.map(m => trunc(m.name, 25)),
      values: chartMembers.map(m => m.count),
    }], {
      x: 0.2, y: 1.0, w: 9.4, h: 4.3,
      barDir: 'bar', barGrouping: 'clustered',
      chartColors: [C.participants],
      chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
      catAxisLabelColor: C.text, catAxisLabelFontSize: 9,
      valAxisLabelColor: C.textLight, valAxisLabelFontSize: 8,
      valAxisMaxVal: Math.ceil((topMembers[0]?.count ?? 1) * 1.2),
      valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
      showValue: true, dataLabelPosition: 'outEnd',
      dataLabelColor: C.text, dataLabelFontSize: 10,
      showLegend: false,
    });
  } else {
    noDataText(slide, 'Aucune inscription enregistree pour cette annee.');
  }

  // ── SLIDE 6: RESUME CHIFFRE ──────────────────────────────────
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Resume Chiffre');

  const hO  = { fill: { color: C.headerBg }, color: 'FFFFFF', bold: true,  fontSize: 10, fontFace: 'Arial', align: 'left'  as const, valign: 'middle' as const };
  const hR  = { ...hO,  align: 'right' as const };
  const c1  = { fill: { color: C.bg    }, color: C.text,    bold: false, fontSize: 10, fontFace: 'Arial', align: 'left'  as const, valign: 'middle' as const };
  const c1R = { ...c1,  align: 'right' as const, bold: true, color: C.primary };
  const c2  = { ...c1,  fill: { color: C.bgAlt } };
  const c2R = { ...c1R, fill: { color: C.bgAlt } };

  const tbl = [
    [{ text: 'Indicateur',                                    options: hO  }, { text: 'Valeur',                         options: hR  }],
    [{ text: 'Total evenements (plongee + sortie)',            options: c1  }, { text: String(events.length),           options: c1R }],
    [{ text: '  dont Plongees',                               options: c2  }, { text: String(byCat.plongee),           options: c2R }],
    [{ text: '  dont Sorties',                                options: c1  }, { text: String(byCat.sortie),            options: c1R }],
    [{ text: 'Participants uniques (source: inscriptions)',    options: c2  }, { text: String(uniqueParticipants),      options: c2R }],
    [{ text: 'Inscriptions enregistrees dans l\'app',         options: c1  }, { text: String(totalInscriptions),       options: c1R }],
    [{ text: 'Paiements bancaires lies (ventes)',             options: c2  }, { text: String(linkedTx.length),         options: c2R }],
    [{ text: 'Moy. paiements par evenement',                  options: c1  }, { text: String(avgTxPerEvent),           options: c1R }],
    [{ text: 'Sites de plongee visites',                      options: c2  }, { text: String(Object.keys(byLieu).length), options: c2R }],
    [{ text: 'Chiffre d\'affaires inscriptions (bank)',       options: c1  }, { text: `EUR ${totalRevenue.toFixed(2)}`, options: c1R }],
  ];
  slide.addTable(tbl, {
    x: 0.5, y: 1.0, w: 9,
    colW: [6.5, 2.5],
    border: { pt: 0.5, color: C.grid },
  });

  // ── SLIDE 7: MERCI ───────────────────────────────────────────
  slide = pres.addSlide();
  slide.background = { color: C.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
  slide.addText('CALYPSO DIVING CLUB', {
    x: 0.5, y: 1.5, w: 9, h: 0.5, fontSize: 16, fontFace: 'Arial',
    color: C.accent, align: 'center', charSpacing: 6,
  });
  slide.addText('Merci', {
    x: 0.5, y: 2.3, w: 9, h: 0.7, fontSize: 34, fontFace: 'Georgia',
    color: C.primary, bold: true, align: 'center',
  });
  slide.addShape(pres.ShapeType.rect, { x: 4, y: 3.2, w: 2, h: 0.02, fill: { color: C.accent } });
  slide.addText('Rapport genere par CalyCompta  -  caly.club', {
    x: 0.5, y: 3.5, w: 9, h: 0.3, fontSize: 9, fontFace: 'Arial',
    color: C.textLight, align: 'center', italic: true,
  });

  await pres.writeFile({ fileName: `Calypso_Rapport_Activites_${year}.pptx` });
  logger.debug('Activity statistics PPTX generated successfully');
}

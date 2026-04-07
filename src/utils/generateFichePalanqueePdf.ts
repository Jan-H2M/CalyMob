import { Operation, InscriptionEvenement, Membre, PalanqueeAssignments } from '@/types';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { Timestamp } from 'firebase/firestore';

/**
 * Génère une Fiche de Palanquée / Fiche de Sécurité (PDF)
 *
 * Conforme à l'article A322-72 du Code du Sport.
 *
 * Layout dynamique:
 *   - Page 1 : En-tête, participants, légende, puis autant de palanquées que l'espace le permet
 *   - Pages suivantes (si nécessaire) : 8 palanquées par page (4×2)
 *   - Petit groupe → tout tient sur 1 page, pas besoin d'imprimer la suite
 *   - Grand événement → le tableau participants grandit, les palanquées suivent sur les pages d'après
 *
 * Si des palanquées ont été composées via le drag & drop, elles sont pré-remplies dans le PDF.
 * Des palanquées vides supplémentaires sont ajoutées pour les modifications manuelles.
 */

// ---- Types ----

interface ParticipantData {
  nom: string;
  prenom: string;
  niveau: string;
  fonction: string;
  paye: boolean;
}

/** Données pré-remplies pour une ligne dans la grille palanquée */
interface PalanqueeRowData {
  nomPrenom: string;
  niveau: string;
  fonction: string;
}

interface FichePalanqueeOptions {
  operation: Operation;
  inscriptions: InscriptionEvenement[];
  allMembers: Membre[];
  clubInfo?: { nom?: string; logo_url?: string };
  palanqueeAssignments?: PalanqueeAssignments;
}

// ---- Constantes layout ----

const PW = 297;                       // Page width A4 paysage
const PH = 210;                       // Page height
const M = 8;                          // Marge
const FOOTER_H = 6;                   // Hauteur réservée footer
const USABLE_BOTTOM = PH - FOOTER_H;  // Y max utilisable
const PAL_COLS = 2;                   // 2 palanquées côte à côte
const PAL_GAP_X = 5;                  // Gap horizontal entre colonnes
const PAL_GAP_Y = 2;                  // Gap vertical entre lignes
const PAL_ROWS_BODY = 4;             // 4 plongeurs par palanquée
const TITLE_H = 4.5;                 // Hauteur barre titre palanquée
const HDR_H = 3.5;                   // Hauteur header colonnes
const ROW_H = 6.5;                   // Hauteur ligne corps (écriture à la main)
const PAL_H = TITLE_H + HDR_H + PAL_ROWS_BODY * ROW_H; // ~34mm par palanquée
const PAL_W = (PW - 2 * M - PAL_GAP_X) / PAL_COLS;     // ~142mm par palanquée

const NAVY: [number, number, number] = [0, 51, 102];
const LIGHT_BLUE: [number, number, number] = [230, 240, 250];

// Colonnes palanquée : proportions de PAL_W
const COL_RATIOS = [0.22, 0.06, 0.06, 0.07, 0.09, 0.09, 0.08, 0.13, 0.20];
const COL_HEADERS = ['Nom Prénom', 'Niv.', 'Fct', 'Gaz', 'H.Imm.', 'H.Sort.', 'Prof.R', 'Paliers', 'Obs.'];

// ---- Helpers ----

const parseDate = (value: Date | Timestamp | string | undefined | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if ((value as Timestamp)?.toDate) return (value as Timestamp).toDate();
  if (typeof value === 'string') { const d = new Date(value); return isNaN(d.getTime()) ? null : d; }
  return null;
};

const fmtDate = (v: Date | Timestamp | string | undefined | null): string => {
  const d = parseDate(v);
  return d ? new Intl.DateTimeFormat('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) : '___/___/______';
};

function getDivingLevel(member: Membre | undefined): string {
  if (!member) return '';
  if (member.plongeur_code) {
    const c = member.plongeur_code;
    return /^\d$/.test(c) ? `${c}*` : c;
  }
  const raw = member.plongeur_niveau || (member as any).niveau_plongeur || (member as any).niveau_plongee || '';
  if (!raw) return '';
  const m = raw.match(/(\d)\s*\*/);
  if (m) return `${m[1]}*`;
  if (/moniteur\s*club/i.test(raw)) return 'MC';
  if (/aide\s*moniteur/i.test(raw)) return 'AM';
  if (/moniteur\s*f/i.test(raw)) return 'MF';
  return raw;
}

const loadImageAsBase64 = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d')?.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = url;
  });

/**
 * Convertit les fonction codes en abréviations pour la fiche
 */
function fonctionAbbrev(f: string): string {
  if (f === 'encadrant') return 'E';
  if (f === 'ca') return 'CA';
  return 'M';
}

// ================================================================
// MAIN
// ================================================================

export async function generateFichePalanqueePdf(opts: FichePalanqueeOptions): Promise<void> {
  const { operation, inscriptions, allMembers, clubInfo, palanqueeAssignments } = opts;

  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ---- Données ----
  const participants: ParticipantData[] = inscriptions
    .filter(i => !i.is_guest || i.membre_nom)
    .map(ins => {
      const mem = allMembers.find(m => m.id === ins.membre_id);
      return {
        nom: ((mem ? getLastName(mem) : ins.membre_nom) || '').toUpperCase(),
        prenom: (mem ? getFirstName(mem) : ins.membre_prenom) || '',
        niveau: getDivingLevel(mem),
        fonction: ins.fonction || mem?.fonction_defaut || 'membre',
        paye: ins.paye,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const clubName = clubInfo?.nom || 'Club de Plongée';
  const eventDate = fmtDate(operation.date_debut);

  // ---- Préparer les données palanquées (pré-remplies + vides) ----
  const hasAssignments = palanqueeAssignments && palanqueeAssignments.palanquees.length > 0;

  // Build pre-filled palanquee data: array of arrays of row data
  const prefilledPalanquees: PalanqueeRowData[][] = [];
  if (hasAssignments) {
    for (const pal of palanqueeAssignments.palanquees) {
      const rows: PalanqueeRowData[] = pal.participants
        .sort((a, b) => a.ordre - b.ordre)
        .map(pp => {
          // Chercher l'inscription pour obtenir la fonction
          const ins = inscriptions.find(i => i.membre_id === pp.membre_id);
          const mem = allMembers.find(m => m.id === pp.membre_id);
          const fonction = ins?.fonction || mem?.fonction_defaut || 'membre';
          return {
            nomPrenom: `${pp.membre_nom} ${pp.membre_prenom}`,
            niveau: pp.niveau || '',
            fonction: fonctionAbbrev(fonction),
          };
        });
      if (rows.length > 0) {
        prefilledPalanquees.push(rows);
      }
    }
  }

  // Calculer le nombre total de palanquées
  const filledCount = prefilledPalanquees.length;
  // Nombre de palanquées vides supplémentaires
  const extraEmpty = hasAssignments
    ? Math.max(2, Math.ceil(filledCount * 0.5))  // Au moins 2 vides, ou 50% du nombre rempli
    : 0;
  // Total sans assignments : ancien calcul
  const minNeeded = Math.max(1, Math.ceil(participants.length / 4));
  const rawTotalEmpty = Math.max(4, minNeeded + (minNeeded <= 2 ? 3 : 2));
  const totalEmptyOnly = rawTotalEmpty % 2 === 0 ? rawTotalEmpty : rawTotalEmpty + 1;

  const totalPalanquees = hasAssignments
    ? filledCount + extraEmpty + (extraEmpty % 2 !== filledCount % 2 ? 1 : 0) // Arrondir pair
    : totalEmptyOnly;

  let currentY = M;

  // ================================================================
  // PAGE 1 : HEADER
  // ================================================================

  // Logo
  try {
    const b64 = await loadImageAsBase64(clubInfo?.logo_url || '/logo-horizontal.jpg');
    doc.addImage(b64, 'JPEG', PW - M - 17, M - 1, 17, 12);
  } catch { /* pas de logo */ }

  // Titre
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('FICHE DE SÉCURITÉ / PALANQUÉE', M, currentY + 5);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text(clubName, M, currentY + 10);
  currentY += 14;

  // Séparation
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5);
  doc.line(M, currentY, PW - M, currentY);
  currentY += 4;

  // Infos événement
  doc.setFontSize(8.5); doc.setTextColor(0, 0, 0);
  const infoLine = (label: string, value: string, lx: number) => {
    doc.setFont('helvetica', 'bold'); doc.text(label, lx, currentY);
    doc.setFont('helvetica', 'normal'); doc.text(value, lx + doc.getTextWidth(label) + 1.5, currentY);
  };
  const lieu = operation.lieu || operation.titre || '___________________';
  const dp = operation.organisateur_nom || '___________________';

  infoLine('Date:', eventDate, M);
  infoLine('Site:', lieu, M + 45);
  infoLine('DP:', dp, M + 140);
  infoLine('Nb plongeurs:', String(participants.length), PW - M - 45);
  currentY += 4.5;

  infoLine('Météo:', '_______________', M);
  infoLine('Visibilité:', '___________', M + 55);
  infoLine('Temp. eau:', '______°C', M + 105);
  infoLine('Sécu. surface:', '________________________', M + 155);
  currentY += 5;

  doc.setDrawColor(...NAVY); doc.setLineWidth(0.3);
  doc.line(M, currentY, PW - M, currentY);
  currentY += 3;

  // ================================================================
  // TABLEAU PARTICIPANTS (autoTable — seul endroit où on l'utilise)
  // ================================================================
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('PARTICIPANTS INSCRITS', M, currentY + 1);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    head: [['N°', 'Nom Prénom', 'Niveau', 'Fct', 'Payé']],
    body: participants.map((p, i) => [
      String(i + 1),
      `${p.nom} ${p.prenom}`,
      p.niveau || '-',
      fonctionAbbrev(p.fonction),
      p.paye ? 'OK' : 'NON',
    ]),
    theme: 'grid',
    headStyles: { fillColor: [...NAVY], textColor: 255, fontStyle: 'bold', fontSize: 7.5, cellPadding: 1.2 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 10, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
    },
    margin: { left: M, right: PW - M - 100 },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.textColor = data.cell.raw === 'NON' ? [220, 38, 38] : [22, 163, 74];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY;

  // ================================================================
  // LÉGENDE + SIGNATURE DP (à droite du tableau)
  // ================================================================
  const legX = M + 105;
  let legY = currentY + 1;

  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('LÉGENDE', legX, legY); legY += 4;

  doc.setTextColor(60, 60, 60);
  for (const [lbl, desc] of [
    ['Fct:', 'M = Membre, E = Encadrant, CA = Comité'],
    ['Niveau:', '1* à 4*, AM, MC, MF'],
    ['GP:', 'Guide de Palanquée'],
    ['SP:', 'Serre-file'],
  ]) {
    doc.setFont('helvetica', 'bold'); doc.text(lbl, legX, legY);
    doc.setFont('helvetica', 'normal'); doc.text(desc, legX + 14, legY);
    legY += 3.5;
  }

  legY += 2;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('Signature DP:', legX, legY);
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
  doc.rect(legX, legY + 1, 50, 15);

  // Y après le bloc header/participants/légende
  const contentEndY = Math.max(tableEndY, legY + 18) + 3;

  // ================================================================
  // PALANQUÉES SUR PAGE 1 (remplir l'espace restant)
  // ================================================================
  let palY = contentEndY;
  let palDrawn = 0;

  // Combien de lignes de palanquées rentrent sur cette page ?
  const remainingOnPage1 = USABLE_BOTTOM - palY;
  const rowsOnPage1 = Math.floor((remainingOnPage1 + PAL_GAP_Y) / (PAL_H + PAL_GAP_Y));
  const palsOnPage1 = Math.min(totalPalanquees, rowsOnPage1 * PAL_COLS);

  if (palsOnPage1 > 0) {
    // Séparation avant palanquées
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.3);
    doc.line(M, palY - 1, PW - M, palY - 1);
    palY += 1;

    for (let row = 0; row < rowsOnPage1 && palDrawn < totalPalanquees; row++) {
      for (let col = 0; col < PAL_COLS && palDrawn < totalPalanquees; col++) {
        const x = M + col * (PAL_W + PAL_GAP_X);
        const rowData = palDrawn < filledCount ? prefilledPalanquees[palDrawn] : undefined;
        drawPalanqueeManual(doc, palDrawn + 1, x, palY, PAL_W, rowData);
        palDrawn++;
      }
      palY += PAL_H + PAL_GAP_Y;
    }
  }

  drawFooter(doc, clubName);

  // ================================================================
  // PAGES SUIVANTES (si palanquées restantes) — 8 par page
  // ================================================================
  while (palDrawn < totalPalanquees) {
    doc.addPage();

    // Mini-header
    let y = M;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(`FICHE DE SÉCURITÉ — ${operation.titre || 'Sortie'} — ${eventDate}`, M, y + 4);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`${participants.length} plongeurs inscrits`, PW - M, y + 4, { align: 'right' });
    y += 7;
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.3);
    doc.line(M, y, PW - M, y);
    y += 2;

    // Combien de lignes sur cette page ?
    const availH = USABLE_BOTTOM - y;
    const rowsHere = Math.floor((availH + PAL_GAP_Y) / (PAL_H + PAL_GAP_Y));

    for (let row = 0; row < rowsHere && palDrawn < totalPalanquees; row++) {
      for (let col = 0; col < PAL_COLS && palDrawn < totalPalanquees; col++) {
        const x = M + col * (PAL_W + PAL_GAP_X);
        const rowData = palDrawn < filledCount ? prefilledPalanquees[palDrawn] : undefined;
        drawPalanqueeManual(doc, palDrawn + 1, x, y, PAL_W, rowData);
        palDrawn++;
      }
      y += PAL_H + PAL_GAP_Y;
    }

    drawFooter(doc, clubName);
  }

  // ================================================================
  // Numéros de page
  // ================================================================
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    (doc as any).setPage(i);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
    doc.text(`${i} / ${totalPages}`, PW - M, PH - 3, { align: 'right' });
  }

  // ================================================================
  // SAVE
  // ================================================================
  const safe = (operation.titre || 'Sortie').replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_');
  doc.save(`Fiche_Palanquee_${safe}_${fmtDate(operation.date_debut).replace(/\//g, '-')}.pdf`);
}

// ================================================================
// FOOTER
// ================================================================

function drawFooter(doc: any, clubName: string) {
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 150, 150);
  doc.text(`Fiche de Palanquée — ${clubName}`, PW / 2, PH - 3, { align: 'center' });
}

// ================================================================
// DESSIN MANUEL D'UNE GRILLE DE PALANQUÉE (pas d'autoTable = pas de débordement)
// Optionnel: rowData pour pré-remplir les lignes avec les participants assignés
// ================================================================

function drawPalanqueeManual(
  doc: any,
  num: number,
  x: number,
  y: number,
  w: number,
  rowData?: PalanqueeRowData[]
) {
  // Largeurs colonnes en mm
  const colW = COL_RATIOS.map(r => w * r);

  const isFilled = rowData && rowData.length > 0;

  // ---- Barre titre (fond navy, ou vert si pré-rempli) ----
  if (isFilled) {
    doc.setFillColor(16, 122, 87); // Vert foncé pour palanquées pré-remplies
  } else {
    doc.setFillColor(...NAVY);
  }
  doc.rect(x, y, w, TITLE_H, 'F');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(`PALANQUÉE ${num}`, x + 2, y + 3.2);
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
  doc.text('Prof: ______m', x + w - 65, y + 3.2);
  doc.text('Durée: ______min', x + w - 33, y + 3.2);

  let rowY = y + TITLE_H;

  // ---- Header colonnes (fond bleu clair) ----
  doc.setFillColor(...LIGHT_BLUE);
  doc.rect(x, rowY, w, HDR_H, 'F');

  // Bordure header
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.2);
  doc.rect(x, rowY, w, HDR_H);

  // Texte header + lignes verticales
  doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  let cx = x;
  for (let i = 0; i < COL_HEADERS.length; i++) {
    doc.text(COL_HEADERS[i], cx + 1, rowY + 2.5);
    if (i > 0) doc.line(cx, rowY, cx, rowY + HDR_H);
    cx += colW[i];
  }

  rowY += HDR_H;

  // ---- Corps : 4 lignes ----
  doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.15);

  for (let r = 0; r < PAL_ROWS_BODY; r++) {
    // Rect de la ligne complète
    doc.rect(x, rowY, w, ROW_H);

    const data = rowData?.[r];

    if (data) {
      // ---- Ligne pré-remplie ----
      // Nom Prénom (colonne 0)
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
      doc.text(data.nomPrenom.substring(0, 25), x + 1, rowY + ROW_H / 2 + 1);

      // Niveau (colonne 1)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 51, 102);
      doc.text(data.niveau, x + colW[0] + 1, rowY + ROW_H / 2 + 1);

      // Fonction (colonne 2)
      doc.text(data.fonction, x + colW[0] + colW[1] + 1, rowY + ROW_H / 2 + 1);

      // Gaz "Air" (colonne 3) - toujours pré-rempli
      const gazX = x + colW[0] + colW[1] + colW[2];
      doc.setTextColor(100, 100, 100); doc.setFont('helvetica', 'normal');
      doc.text('Air', gazX + 1.5, rowY + ROW_H / 2 + 1);
    } else {
      // ---- Ligne vide ----
      // Texte "Air" dans la colonne Gaz (colonne index 3)
      const gazX = x + colW[0] + colW[1] + colW[2];
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text('Air', gazX + 1.5, rowY + ROW_H / 2 + 1);
    }

    // Lignes verticales entre colonnes
    let vx = x;
    for (let i = 1; i < colW.length; i++) {
      vx += colW[i - 1];
      doc.line(vx, rowY, vx, rowY + ROW_H);
    }

    rowY += ROW_H;
  }
}

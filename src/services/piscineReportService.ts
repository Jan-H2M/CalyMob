/**
 * Service voor het genereren van een professioneel A4 landscape PDF-rapport
 * van een piscine-sessie in TV-guide timeline layout.
 */
import jsPDF from 'jspdf';
import { PiscineSession, PiscineLevel, SessionAssignment } from '@/types';

type RGB = [number, number, number];

// ─── Kleuren ───────────────────────────────────────────────
const C = {
  primary:      [30, 64, 175] as RGB,
  primaryLight: [219, 234, 254] as RGB,
  primaryBorder:[147, 197, 253] as RGB,
  teal:         [13, 148, 136] as RGB,
  tealLight:    [204, 251, 241] as RGB,
  tealBorder:   [153, 246, 228] as RGB,
  orange:       [234, 88, 12] as RGB,
  orangeLight:  [255, 237, 213] as RGB,
  orangeBorder: [253, 186, 116] as RGB,
  purple:       [124, 58, 237] as RGB,
  purpleLight:  [237, 233, 254] as RGB,
  purpleBorder: [196, 181, 253] as RGB,
  gray:         [107, 114, 128] as RGB,
  grayLight:    [243, 244, 246] as RGB,
  grayBorder:   [209, 213, 219] as RGB,
  grayDark:     [31, 41, 55] as RGB,
  white:        [255, 255, 255] as RGB,
  headerBg:     [248, 250, 252] as RGB,
  bgStripe:     [250, 250, 252] as RGB,
};

// ─── Helpers ───────────────────────────────────────────────
function formatDate(date: Date): string {
  const wd = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const mo = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${wd[date.getDay()]} ${date.getDate()} ${mo[date.getMonth()]} ${date.getFullYear()}`;
}

function memberNames(members: SessionAssignment[]): string {
  if (!members?.length) return '';
  return members.map(m => m.membre_prenom || '?').join(', ');
}

// ─── TV-Guide Timeline Configuration ────────────────────────
// Timeline: 19:30 (0 min) to 23:30 (240 min)
const TIMELINE_TOTAL = 240; // minutes

interface TimeBlock {
  startMin: number;
  endMin: number;
  slot?: string;
  heure?: string;
}

interface PdfTrack {
  label: string;
  color: RGB;
  bgColor: RGB;
  borderColor: RGB;
  blocks: TimeBlock[];
  getMembers: (s: PiscineSession, block: TimeBlock) => SessionAssignment[];
  getTheme?: (s: PiscineSession, block: TimeBlock) => string | undefined;
}

function buildTracks(session: PiscineSession): PdfTrack[] {
  const tracks: PdfTrack[] = [];

  // Accueil (single slot 20h00-21h15)
  tracks.push({
    label: 'Accueil',
    color: C.primary,
    bgColor: C.primaryLight,
    borderColor: C.primaryBorder,
    blocks: [
      { startMin: 30, endMin: 105, slot: '20h00' },
    ],
    getMembers: (s) => s.accueil || [],
  });

  // Baptêmes
  tracks.push({
    label: 'Baptêmes',
    color: C.teal,
    bgColor: C.tealLight,
    borderColor: C.tealBorder,
    blocks: [
      { startMin: 45, endMin: 105 },
    ],
    getMembers: (s) => s.baptemes || [],
  });

  // Gonflage
  tracks.push({
    label: 'Gonflage',
    color: C.gray,
    bgColor: C.grayLight,
    borderColor: C.grayBorder,
    blocks: [
      { startMin: 15, endMin: 45, slot: '19h45' },
      { startMin: 45, endMin: 105, slot: '20h15' },
      { startMin: 120, endMin: 180, slot: '21h30' },
    ],
    getMembers: (s, b) => s.gonflage?.[b.slot!] || [],
  });

  // Théorie
  tracks.push({
    label: 'Théorie',
    color: C.orange,
    bgColor: C.orangeLight,
    borderColor: C.orangeBorder,
    blocks: [
      { startMin: 0, endMin: 60, slot: '19h30' },
      { startMin: 135, endMin: 180, slot: '21h45' },
    ],
    getMembers: (s, b) => s.theorie?.[b.slot!]?.encadrants || [],
    getTheme: (s, b) => s.theorie?.[b.slot!]?.theme,
  });

  // Niveaux (1* = 1st hour only, 2*+ = 2nd hour only, extended to 22h30)
  const FIRST_HOUR_LEVELS = ['1*'];
  for (const level of PiscineLevel.all) {
    const isFirstHourOnly = FIRST_HOUR_LEVELS.includes(level);
    tracks.push({
      label: level,
      color: C.purple,
      bgColor: C.purpleLight,
      borderColor: C.purpleBorder,
      blocks: isFirstHourOnly
        ? [{ startMin: 45, endMin: 105, heure: '1ere_heure' }]
        : [{ startMin: 105, endMin: 180, heure: '2eme_heure' }],
      getMembers: (s, b) => {
        const data = s.niveaux[level];
        return data?.encadrants.filter(e => (e.heure || '1ere_heure') === b.heure) || [];
      },
      getTheme: (s, b) => {
        const data = s.niveaux[level];
        if (!data) return undefined;
        const heure = b?.heure || '1ere_heure';
        // Per-uur thema, met fallback naar oud 'theme' veld
        return data[`theme_${heure}`] || (!b?.heure ? data.theme : undefined);
      },
    });
  }

  return tracks;
}

// ─── Ruler marks ──────────────────────────────────────────
const RULER_MARKS = [
  { min: 0, label: '19:30', major: true },
  { min: 15, label: '19:45', major: false },
  { min: 30, label: '20:00', major: true },
  { min: 45, label: '20:15', major: false },
  { min: 60, label: '20:30', major: true },
  { min: 75, label: '20:45', major: false },
  { min: 90, label: '21:00', major: true },
  { min: 105, label: '21:15', major: false },
  { min: 120, label: '21:30', major: true },
  { min: 135, label: '21:45', major: false },
  { min: 150, label: '22:00', major: true },
  { min: 165, label: '22:15', major: false },
  { min: 180, label: '22:30', major: true },
  { min: 195, label: '22:45', major: false },
  { min: 210, label: '23:00', major: true },
  { min: 225, label: '23:15', major: false },
  { min: 240, label: '23:30', major: true },
];

// ─── Logo loader ───────────────────────────────────────────
interface LogoData {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

async function loadLogo(): Promise<LogoData | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    return await new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.9),
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight,
        });
      };
      img.onerror = () => resolve(null);
      img.src = '/logo-horizontal.jpg';
    });
  } catch {
    return null;
  }
}

// ─── Main export ───────────────────────────────────────────
export async function generateSessionReport(session: PiscineSession): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // ~297
  const H = doc.internal.pageSize.getHeight();  // ~210
  const mg = 10; // margin

  const logo = await loadLogo();

  // ─── Header band ─────────────────────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, W, 22, 'F');

  let logoEndX = mg;
  if (logo) {
    try {
      const logoH = 16;
      const logoW = logoH * logo.aspectRatio;
      const logoY = (22 - logoH) / 2;
      doc.addImage(logo.dataUrl, 'JPEG', mg, logoY, logoW, logoH);
      logoEndX = mg + logoW + 4;
    } catch { /* ignore */ }
  }

  const textX = logoEndX;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.white);
  doc.text('CALYPSO DIVING CLUB', textX, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(190, 210, 255);
  doc.text('Planning Piscine', textX, 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  doc.text(formatDate(session.date), W - mg, 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${session.horaireDebut} – ${session.horaireFin}  |  ${session.lieu}  |  ${session.statut}`, W - mg, 17, { align: 'right' });

  // ─── Stats bar ───────────────────────────────────────────
  const statsY = 26;
  const totalEnc = Object.values(session.niveaux).reduce((s, n) => s + n.encadrants.length, 0);
  const totalGon = Object.values(session.gonflage || {}).reduce((s, arr) => s + arr.length, 0);
  const stats = [
    { l: 'Accueil', v: session.accueil.length, c: C.primaryLight },
    { l: 'Baptêmes', v: session.baptemes.length, c: C.tealLight },
    { l: 'Encadrants', v: totalEnc, c: C.purpleLight },
    { l: 'Gonflage', v: totalGon, c: C.grayLight },
  ];
  const sW = (W - 2 * mg - 6) / 4;
  stats.forEach((s, i) => {
    const x = mg + i * (sW + 2);
    doc.setFillColor(...s.c);
    doc.roundedRect(x, statsY, sW, 10, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.grayDark);
    doc.text(String(s.v), x + 8, statsY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(s.l, x + 16, statsY + 7);
  });

  // ─── TV-Guide Timeline Grid ────────────────────────────────
  const gridY = 40;
  const labelW = 24;
  const timelineW = W - 2 * mg - labelW; // available width for timeline
  const rowH = 12;
  const rulerH = 7;

  const tracks = buildTracks(session);

  /** Convert minutes to x-position on the page */
  const minToX = (min: number) => mg + labelW + (min / TIMELINE_TOTAL) * timelineW;

  // ─── Time ruler ────────────────────────────────────────────
  doc.setFillColor(...C.headerBg);
  doc.rect(mg, gridY, W - 2 * mg, rulerH, 'F');
  doc.setDrawColor(210, 215, 225);
  doc.rect(mg, gridY, W - 2 * mg, rulerH, 'S');

  // "Heure" label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(...C.gray);
  doc.text('HEURE', mg + 2, gridY + 4.5);

  // Ruler ticks and labels
  for (const mark of RULER_MARKS) {
    const x = minToX(mark.min);
    doc.setDrawColor(mark.major ? 180 : 210, mark.major ? 185 : 215, mark.major ? 195 : 225);
    doc.line(x, gridY + rulerH - (mark.major ? 3 : 1.5), x, gridY + rulerH);

    if (mark.major) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...C.grayDark);
      doc.text(mark.label, x, gridY + 4, { align: 'center' });
    }
  }

  // ─── Draw track rows (skip empty tracks) ─────────────────
  let y = gridY + rulerH;

  // Filter out tracks that have no content (no members and no themes in any block)
  const visibleTracks = tracks.filter(track => {
    for (const block of track.blocks) {
      if (track.getMembers(session, block).length > 0) return true;
      if (track.getTheme?.(session, block)) return true;
    }
    return false;
  });

  for (let ti = 0; ti < visibleTracks.length; ti++) {
    const track = visibleTracks[ti];

    // Alternate row background
    if (ti % 2 === 1) {
      doc.setFillColor(...C.bgStripe);
      doc.rect(mg + labelW, y, timelineW, rowH, 'F');
    }

    // Row border
    doc.setDrawColor(230, 232, 237);
    doc.line(mg, y + rowH, W - mg, y + rowH);

    // Row label
    doc.setFillColor(...track.bgColor);
    doc.roundedRect(mg, y + 1, labelW - 1, rowH - 2, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...track.color);
    doc.text(track.label, mg + 2, y + rowH / 2 + 1);

    // Subtle vertical grid lines (major ticks)
    for (const mark of RULER_MARKS) {
      if (mark.major) {
        const gx = minToX(mark.min);
        doc.setDrawColor(240, 242, 245);
        doc.line(gx, y, gx, y + rowH);
      }
    }

    // Draw time blocks
    for (const block of track.blocks) {
      const bx = minToX(block.startMin);
      const bw = minToX(block.endMin) - bx;

      // Block background with rounded corners
      doc.setFillColor(...track.bgColor);
      doc.setDrawColor(...track.borderColor);
      doc.roundedRect(bx + 0.3, y + 0.5, bw - 0.6, rowH - 1, 1.2, 1.2, 'FD');

      const members = track.getMembers(session, block);
      const theme = track.getTheme?.(session, block);
      let textY = y + 3;

      // Theme text (if available)
      if (theme) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(4.5);
        doc.setTextColor(...track.color);
        const themeLines = doc.splitTextToSize(theme, bw - 3);
        doc.text(themeLines[0] || '', bx + 1.5, textY);
        textY += 2.5;
      }

      // Member names
      if (members.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...C.grayDark);
        const text = memberNames(members);
        const lines = doc.splitTextToSize(text, bw - 3);
        doc.text(lines.slice(0, 2).join('\n'), bx + 1.5, textY + 1.5);
      }
    }

    y += rowH;
  }

  // ─── Footer ──────────────────────────────────────────────
  doc.setDrawColor(...C.grayLight);
  doc.line(mg, H - 8, W - mg, H - 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.gray);
  doc.text(`Calypso Diving Club — Généré le ${new Date().toLocaleDateString('fr-BE')}`, mg, H - 4);

  // Legend
  const legendX = W - mg - 120;
  const legendItems = [
    { l: 'Accueil', c: C.primaryLight, b: C.primaryBorder },
    { l: 'Baptêmes', c: C.tealLight, b: C.tealBorder },
    { l: 'Gonflage', c: C.grayLight, b: C.grayBorder },
    { l: 'Théorie', c: C.orangeLight, b: C.orangeBorder },
    { l: 'Niveaux', c: C.purpleLight, b: C.purpleBorder },
  ];
  legendItems.forEach((item, i) => {
    const lx = legendX + i * 24;
    doc.setFillColor(...item.c);
    doc.setDrawColor(...item.b);
    doc.roundedRect(lx, H - 6.5, 3, 3, 0.5, 0.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.gray);
    doc.text(item.l, lx + 4, H - 4);
  });

  // ─── Download ────────────────────────────────────────────
  const dateStr = session.date.toISOString().slice(0, 10);
  doc.save(`Piscine_${dateStr}.pdf`);
}

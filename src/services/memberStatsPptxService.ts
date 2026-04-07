/**
 * Member Statistics PowerPoint Generation Service
 * Generates a rich PPTX report with charts using pptxgenjs (client-side)
 */
import pptxgen from 'pptxgenjs';
import { collection, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

// ============================================================
// TYPES
// ============================================================
interface MemberData {
  id: string;
  nom?: string;
  prenom?: string;
  sexe?: string;
  date_naissance?: Date | null;
  plongeur_niveau?: string;
  niveau_plongee?: string;
  member_status?: string;
  membership_category_code?: string;
  clubStatuten?: string[];
  is_diver?: boolean;
  has_lifras?: boolean;
  certificat_medical_validite?: Date | null;
  cotisation_validite?: Date | null;
  has_app_access?: boolean;
  app_installed?: boolean;
  localite?: string;
  code_postal?: string;
  nationalite?: string;
}

// ============================================================
// COLORS & CONFIG
// ============================================================
const C = {
  bg: 'FFFFFF', bgAlt: 'F7F9FC', primary: '065A82', secondary: '1C7293',
  accent: '00B4D8', text: '1E293B', textMid: '475569', textLight: '94A3B8',
  male: '1C7293', female: 'E07A5F', grid: 'E2E8F0', success: '059669',
  headerBg: '065A82',
};
const BLUES = ['0A1628','065A82','0E7C9A','1C7293','2FA4B8','00B4D8','48CAE4','90E0EF','ADE8F4','CAF0F8'];
const WARM = ['065A82','1C7293','E07A5F','F4A261','2A9D8F','E76F51','264653','287271','D4A373','CCD5AE'];

// ============================================================
// HELPERS
// ============================================================
function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === 'object' && val !== null && 'toDate' in val) return (val as Timestamp).toDate();
  if (typeof val === 'string') { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
  return null;
}

function calcAge(dob: Date | null, refDate: Date): number | null {
  if (!dob) return null;
  return Math.floor((refDate.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function normLevel(m: MemberData): string {
  const lvl = (m.plongeur_niveau || m.niveau_plongee || '').toLowerCase().trim();
  if (!lvl) return 'Non défini';
  if (lvl.includes('moniteur') && (lvl.includes('fédéral') || lvl.includes('federal'))) return 'Moniteur Fédéral';
  if (lvl.includes('moniteur') && lvl.includes('national')) return 'Moniteur National';
  if (lvl.includes('moniteur') && lvl.includes('club')) return 'Moniteur Club';
  if (lvl.includes('assistant moniteur')) return 'Assistant Moniteur';
  if (lvl.includes('initiateur')) return 'Initiateur';
  if (lvl.includes('4')) return 'Plongeur 4*';
  if (lvl.includes('3')) return 'Plongeur 3*';
  if (lvl.includes('2')) return 'Plongeur 2*';
  if (lvl.includes('1') || lvl.includes('dauphin') || lvl.includes('nelos')) return 'Plongeur 1*';
  if (lvl.includes('non breveté') || lvl.includes('baptême') || lvl.includes('initiation')) return 'Non Breveté';
  return m.plongeur_niveau || 'Non défini';
}

const mkShadow = (): pptxgen.ShadowProps => ({ type: 'outer', color: '000000', blur: 4, offset: 1, angle: 135, opacity: 0.08 });

function addSlideHeader(pres: pptxgen, slide: pptxgen.Slide, title: string) {
  slide.background = { color: C.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
  slide.addText(title, { x: 0.5, y: 0.12, w: 8.5, h: 0.5, fontSize: 22, fontFace: 'Georgia', color: C.primary, bold: true, margin: 0 });
  slide.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.68, w: 9, h: 0.01, fill: { color: C.grid } });
}

// ============================================================
// FETCH MEMBERS
// ============================================================
async function fetchAllMembers(clubId: string): Promise<MemberData[]> {
  const membresRef = collection(db, 'clubs', clubId, 'members');
  const q = query(membresRef, orderBy('nom'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      nom: d.nom,
      prenom: d.prenom,
      sexe: d.sexe,
      date_naissance: parseDate(d.date_naissance),
      plongeur_niveau: d.plongeur_niveau,
      niveau_plongee: d.niveau_plongee,
      member_status: d.member_status || 'active',
      membership_category_code: d.membership_category_code,
      clubStatuten: d.clubStatuten || [],
      is_diver: d.is_diver || false,
      has_lifras: d.has_lifras || false,
      certificat_medical_validite: parseDate(d.certificat_medical_validite),
      cotisation_validite: parseDate(d.cotisation_validite),
      has_app_access: d.has_app_access || false,
      app_installed: d.app_installed || false,
      localite: d.localite,
      code_postal: d.code_postal,
      nationalite: d.nationalite,
    };
  });
}

// ============================================================
// MAIN EXPORT FUNCTION
// ============================================================
export async function generateMemberStatsPptx(clubId: string, year: number): Promise<void> {
  logger.debug('Generating member statistics PPTX for year', year);

  const allMembers = await fetchAllMembers(clubId);
  const active = allMembers.filter(m => m.member_status === 'active' || !m.member_status);
  const inactive = allMembers.filter(m => m.member_status === 'inactive' || m.member_status === 'archived');
  const refDate = new Date(year, 11, 31);

  // Gender
  const gM = active.filter(m => m.sexe === 'M').length;
  const gF = active.filter(m => m.sexe === 'F').length;

  // Age groups
  const ageGroups: Record<string, number> = { '12-16': 0, '16-25': 0, '25-35': 0, '35-50': 0, '50+': 0 };
  const ageMale: Record<string, number> = { '12-16': 0, '16-25': 0, '25-35': 0, '35-50': 0, '50+': 0 };
  const ageFemale: Record<string, number> = { '12-16': 0, '16-25': 0, '25-35': 0, '35-50': 0, '50+': 0 };
  let ageSum = 0, ageCnt = 0, ageMin = 999, ageMax = 0;

  active.forEach(m => {
    const a = calcAge(m.date_naissance ?? null, refDate);
    if (a === null) return;
    ageCnt++; ageSum += a;
    if (a < ageMin) ageMin = a;
    if (a > ageMax) ageMax = a;
    const g = m.sexe === 'F' ? ageFemale : ageMale;
    if (a >= 12 && a < 16) { ageGroups['12-16']++; g['12-16']++; }
    else if (a >= 16 && a < 25) { ageGroups['16-25']++; g['16-25']++; }
    else if (a >= 25 && a < 35) { ageGroups['25-35']++; g['25-35']++; }
    else if (a >= 35 && a < 50) { ageGroups['35-50']++; g['35-50']++; }
    else if (a >= 50) { ageGroups['50+']++; g['50+']++; }
  });
  const avgAge = ageCnt > 0 ? Math.round(ageSum / ageCnt) : 0;

  // Diving levels
  const levelOrder = ['Moniteur National', 'Moniteur Fédéral', 'Moniteur Club', 'Assistant Moniteur', 'Initiateur', 'Plongeur 4*', 'Plongeur 3*', 'Plongeur 2*', 'Plongeur 1*', 'Non Breveté', 'Non défini'];
  const levelCounts: Record<string, number> = {};
  active.forEach(m => { const l = normLevel(m); levelCounts[l] = (levelCounts[l] || 0) + 1; });
  const sortedLevels = levelOrder.filter(l => levelCounts[l] > 0);
  const encLevels = ['Moniteur National', 'Moniteur Fédéral', 'Moniteur Club', 'Assistant Moniteur', 'Initiateur'];
  const encadrants = encLevels.reduce((s, l) => s + (levelCounts[l] || 0), 0);
  const plongeurCount = ['Plongeur 4*', 'Plongeur 3*', 'Plongeur 2*', 'Plongeur 1*'].reduce((s, l) => s + (levelCounts[l] || 0), 0);
  const nonBrevetCount = (levelCounts['Non Breveté'] || 0) + (levelCounts['Non défini'] || 0);

  // Cotisations
  const catLabels: Record<string, string> = { 'membre_1ere': '1ère affiliation', 'instructeur_oa': 'Instructeur OA', 'nageur': 'Nageur', 'membre_2e': '2ème affiliation', 'ancien_instructeur': 'Ancien Instr.' };
  const catCounts: Record<string, number> = {};
  active.forEach(m => { const c = catLabels[m.membership_category_code || ''] || m.membership_category_code || 'Non défini'; catCounts[c] = (catCounts[c] || 0) + 1; });
  const catEntries = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  // Roles
  const roleCounts: Record<string, number> = {};
  active.forEach(m => { (m.clubStatuten || []).forEach(s => { roleCounts[s] = (roleCounts[s] || 0) + 1; }); });
  const roleEntries = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);

  // Other stats
  const divers = active.filter(m => m.is_diver).length;
  const lifras = active.filter(m => m.has_lifras).length;
  const hasMedical = active.filter(m => m.certificat_medical_validite && m.certificat_medical_validite >= new Date(year, 0, 1)).length;
  const cotisValid = active.filter(m => m.cotisation_validite && m.cotisation_validite >= new Date(year, 0, 1)).length;
  const hasApp = active.filter(m => m.app_installed || m.has_app_access).length;

  // Communes
  const communeCounts: Record<string, number> = {};
  active.forEach(m => { if (m.localite) communeCounts[m.localite] = (communeCounts[m.localite] || 0) + 1; });
  const communeTop = Object.entries(communeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Nationalities
  const natCounts: Record<string, number> = {};
  active.forEach(m => { if (m.nationalite) natCounts[m.nationalite] = (natCounts[m.nationalite] || 0) + 1; });
  const natEntries = Object.entries(natCounts).sort((a, b) => b[1] - a[1]);

  // ============================================================
  // BUILD PRESENTATION
  // ============================================================
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'CalyCompta';
  pres.title = `Statistiques Membres ${year} — Calypso Diving Club`;

  // SLIDE 1: TITLE
  let slide = pres.addSlide();
  slide.background = { color: C.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
  slide.addText('CALYPSO DIVING CLUB', { x: 0.5, y: 1.0, w: 9, h: 0.5, fontSize: 16, fontFace: 'Arial', color: C.accent, align: 'center', charSpacing: 6 });
  slide.addText('Statistiques Membres', { x: 0.5, y: 1.8, w: 9, h: 0.8, fontSize: 38, fontFace: 'Georgia', color: C.primary, bold: true, align: 'center' });
  slide.addText(`Année ${year}`, { x: 0.5, y: 2.6, w: 9, h: 0.4, fontSize: 18, fontFace: 'Arial', color: C.textMid, align: 'center' });
  slide.addShape(pres.ShapeType.rect, { x: 4, y: 3.2, w: 2, h: 0.02, fill: { color: C.accent } });
  slide.addText(`Rapport généré le ${new Date().toLocaleDateString('fr-BE')}`, { x: 0.5, y: 3.5, w: 9, h: 0.3, fontSize: 9, fontFace: 'Arial', color: C.textLight, align: 'center', italic: true });

  // SLIDE 2: VUE D'ENSEMBLE
  slide = pres.addSlide();
  addSlideHeader(pres, slide, "Vue d'ensemble");

  const kpis = [
    { v: String(active.length), l: 'Membres Actifs', c: C.primary },
    { v: String(divers), l: 'Plongeurs', c: C.secondary },
    { v: String(lifras), l: 'Licenciés LIFRAS', c: C.accent },
    { v: String(encadrants), l: 'Encadrants', c: '2A9D8F' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.5 + i * 2.3;
    slide.addShape(pres.ShapeType.rect, { x, y: 0.85, w: 2.05, h: 1.15, fill: { color: C.bgAlt }, line: { color: C.grid, width: 0.5 } });
    slide.addText(k.v, { x, y: 0.85, w: 2.05, h: 0.7, fontSize: 32, fontFace: 'Georgia', color: k.c, bold: true, align: 'center', valign: 'bottom', margin: 0 });
    slide.addText(k.l, { x, y: 1.55, w: 2.05, h: 0.4, fontSize: 9, fontFace: 'Arial', color: C.textMid, align: 'center', valign: 'top', margin: 0 });
  });

  slide.addChart(pres.ChartType.pie, [{ name: 'Genre', labels: [`Hommes (${gM})`, `Femmes (${gF})`], values: [gM, gF] }], {
    x: 0.3, y: 2.2, w: 4.2, h: 3.0,
    chartColors: [C.male, C.female],
    showPercent: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 12, dataLabelFontBold: true,
    showLegend: true, legendPos: 'b', legendFontSize: 10, legendColor: C.textMid,
  });

  slide.addChart(pres.ChartType.doughnut, [{
    name: 'Profil', labels: [`Plongeurs brevetés (${plongeurCount})`, `Encadrants (${encadrants})`, `Non brevetés (${nonBrevetCount})`],
    values: [plongeurCount, encadrants, nonBrevetCount]
  }], {
    x: 5.1, y: 2.2, w: 4.5, h: 3.0,
    chartColors: [C.secondary, '2A9D8F', C.textLight],
    showPercent: true, dataLabelColor: C.text, dataLabelFontSize: 10,
    showLegend: true, legendPos: 'b', legendFontSize: 9, legendColor: C.textMid,
  });

  // SLIDE 3: PYRAMIDE DES ÂGES
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Pyramide des Âges');
  slide.addText(`Âge moyen: ${avgAge} ans  •  Plus jeune: ${ageMin} ans  •  Plus âgé: ${ageMax} ans`, { x: 0.5, y: 0.72, w: 8, h: 0.25, fontSize: 9, fontFace: 'Arial', color: C.textMid, margin: 0 });

  const ageLabels = Object.keys(ageGroups).map(k => k + ' ans');
  slide.addChart(pres.ChartType.bar, [
    { name: 'Hommes', labels: ageLabels, values: Object.values(ageMale) },
    { name: 'Femmes', labels: ageLabels, values: Object.values(ageFemale) },
  ], {
    x: 0.3, y: 1.1, w: 5.5, h: 4.0, barDir: 'col', barGrouping: 'stacked',
    chartColors: [C.male, C.female],
    chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
    catAxisLabelColor: C.textMid, catAxisLabelFontSize: 11,
    valAxisLabelColor: C.textLight, valAxisLabelFontSize: 9,
    valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
    showValue: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 10,
    showLegend: true, legendPos: 'b', legendFontSize: 10, legendColor: C.textMid,
  });

  slide.addChart(pres.ChartType.doughnut, [{
    name: 'Âge', labels: Object.keys(ageGroups).map(k => k + ' ans'), values: Object.values(ageGroups)
  }], {
    x: 5.8, y: 1.1, w: 4.0, h: 3.0,
    chartColors: BLUES.slice(1, 6),
    showPercent: true, dataLabelColor: C.text, dataLabelFontSize: 9,
    showLegend: true, legendPos: 'b', legendFontSize: 9, legendColor: C.textMid,
  });

  const pct50 = ageCnt > 0 ? Math.round(ageGroups['50+'] / ageCnt * 100) : 0;
  const pct25 = ageCnt > 0 ? Math.round((ageGroups['16-25'] + ageGroups['12-16']) / ageCnt * 100) : 0;
  slide.addShape(pres.ShapeType.rect, { x: 6.0, y: 4.2, w: 3.6, h: 0.9, fill: { color: 'E0F7FA' }, line: { color: C.accent, width: 1 } });
  slide.addText([
    { text: `${pct50}% des membres ont plus de 50 ans\n`, options: { bold: true, fontSize: 11, color: C.primary } },
    { text: `Seulement ${pct25}% ont moins de 25 ans`, options: { fontSize: 10, color: C.textMid } },
  ], { x: 6.2, y: 4.3, w: 3.2, h: 0.7, fontFace: 'Arial', valign: 'middle' });

  // SLIDE 4: BREVETS
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Brevets de Plongée');

  slide.addChart(pres.ChartType.bar, [{ name: 'Membres', labels: sortedLevels, values: sortedLevels.map(l => levelCounts[l]) }], {
    x: 0.2, y: 0.85, w: 5.8, h: 4.4, barDir: 'bar',
    chartColors: BLUES.slice(0, sortedLevels.length),
    chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
    catAxisLabelColor: C.text, catAxisLabelFontSize: 9,
    valAxisLabelColor: C.textLight, valAxisLabelFontSize: 8,
    valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: C.text, dataLabelFontSize: 10,
    showLegend: false,
  });

  const encLabels = encLevels.filter(l => levelCounts[l] > 0);
  slide.addText('Encadrement', { x: 6.2, y: 0.85, w: 3.5, h: 0.3, fontSize: 12, fontFace: 'Arial', color: C.text, bold: true, margin: 0 });
  slide.addChart(pres.ChartType.pie, [{
    name: 'Encadrement', labels: encLabels, values: encLabels.map(l => levelCounts[l])
  }], {
    x: 6.0, y: 1.2, w: 3.8, h: 2.8,
    chartColors: ['0A1628', '065A82', '1C7293', '2FA4B8', '00B4D8'],
    showPercent: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 10,
    showLegend: true, legendPos: 'b', legendFontSize: 8, legendColor: C.textMid,
  });

  slide.addShape(pres.ShapeType.rect, { x: 6.2, y: 4.2, w: 3.4, h: 0.9, fill: { color: 'E0F7FA' }, line: { color: C.accent, width: 1 } });
  const ratio = plongeurCount > 0 && encadrants > 0 ? (plongeurCount / encadrants).toFixed(1) : 'N/A';
  slide.addText([
    { text: `${encadrants} encadrants pour ${plongeurCount} plongeurs\n`, options: { bold: true, fontSize: 11, color: C.primary } },
    { text: `Ratio: 1 encadrant pour ${ratio} plongeurs`, options: { fontSize: 10, color: C.textMid } },
  ], { x: 6.4, y: 4.3, w: 3.0, h: 0.7, fontFace: 'Arial', valign: 'middle' });

  // SLIDE 5: COTISATIONS & FONCTIONS
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Cotisations & Fonctions');

  slide.addChart(pres.ChartType.doughnut, [{ name: 'Cotisations', labels: catEntries.map(e => e[0]), values: catEntries.map(e => e[1]) }], {
    x: 0.1, y: 0.85, w: 4.5, h: 3.5,
    chartColors: WARM.slice(0, catEntries.length),
    showPercent: true, dataLabelColor: C.text, dataLabelFontSize: 9,
    showLegend: true, legendPos: 'b', legendFontSize: 9, legendColor: C.textMid,
  });

  slide.addChart(pres.ChartType.bar, [{ name: 'Membres', labels: roleEntries.map(e => e[0]), values: roleEntries.map(e => e[1]) }], {
    x: 5.0, y: 0.85, w: 4.8, h: 3.5, barDir: 'col',
    chartColors: BLUES.slice(0, roleEntries.length),
    chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
    catAxisLabelColor: C.textMid, catAxisLabelFontSize: 9,
    valAxisLabelColor: C.textLight, valAxisLabelFontSize: 8,
    valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: C.text, dataLabelFontSize: 10,
    showLegend: false,
  });

  // Medical + Cotisation bars
  const medPct = active.length > 0 ? hasMedical / active.length : 0;
  const cotPct = active.length > 0 ? cotisValid / active.length : 0;
  slide.addText('Statut administratif', { x: 0.5, y: 4.5, w: 9, h: 0.25, fontSize: 11, fontFace: 'Arial', color: C.text, bold: true, margin: 0 });
  slide.addText('Médical', { x: 0.5, y: 4.8, w: 1.0, h: 0.3, fontSize: 9, fontFace: 'Arial', color: C.textMid, margin: 0 });
  slide.addShape(pres.ShapeType.rect, { x: 1.5, y: 4.8, w: 7.5 * medPct, h: 0.25, fill: { color: C.success } });
  slide.addShape(pres.ShapeType.rect, { x: 1.5 + 7.5 * medPct, y: 4.8, w: 7.5 * (1 - medPct), h: 0.25, fill: { color: C.grid } });
  slide.addText(`${hasMedical}/${active.length} (${Math.round(medPct * 100)}%)`, { x: 1.5, y: 4.8, w: 7.5, h: 0.25, fontSize: 8, fontFace: 'Arial', color: 'FFFFFF', bold: true, valign: 'middle' });
  slide.addText('Cotisation', { x: 0.5, y: 5.1, w: 1.0, h: 0.3, fontSize: 9, fontFace: 'Arial', color: C.textMid, margin: 0 });
  slide.addShape(pres.ShapeType.rect, { x: 1.5, y: 5.1, w: 7.5 * cotPct, h: 0.25, fill: { color: C.primary } });
  slide.addShape(pres.ShapeType.rect, { x: 1.5 + 7.5 * cotPct, y: 5.1, w: 7.5 * (1 - cotPct), h: 0.25, fill: { color: C.grid } });
  slide.addText(`${cotisValid}/${active.length} (${Math.round(cotPct * 100)}%)`, { x: 1.5, y: 5.1, w: 7.5, h: 0.25, fontSize: 8, fontFace: 'Arial', color: 'FFFFFF', bold: true, valign: 'middle' });

  // SLIDE 6: LOCALISATION
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Localisation des Membres');

  if (communeTop.length > 0) {
    slide.addChart(pres.ChartType.bar, [{ name: 'Membres', labels: communeTop.map(e => e[0]), values: communeTop.map(e => e[1]) }], {
      x: 0.2, y: 0.85, w: 5.8, h: 4.2, barDir: 'bar',
      chartColors: ['1C7293'],
      chartArea: { fill: { color: C.bgAlt }, roundedCorners: true },
      catAxisLabelColor: C.text, catAxisLabelFontSize: 9,
      valAxisLabelColor: C.textLight, valAxisLabelFontSize: 8,
      valGridLine: { color: C.grid, size: 0.5 }, catGridLine: { style: 'none' },
      showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: C.text, dataLabelFontSize: 10,
      showLegend: false,
    });
  }

  if (natEntries.length > 0) {
    slide.addText('Nationalités', { x: 6.2, y: 0.85, w: 3.5, h: 0.3, fontSize: 12, fontFace: 'Arial', color: C.text, bold: true, margin: 0 });
    slide.addChart(pres.ChartType.pie, [{ name: 'Nationalités', labels: natEntries.slice(0, 6).map(e => e[0]), values: natEntries.slice(0, 6).map(e => e[1]) }], {
      x: 6.0, y: 1.2, w: 3.8, h: 2.8,
      chartColors: WARM,
      showPercent: true, dataLabelColor: C.text, dataLabelFontSize: 9,
      showLegend: true, legendPos: 'b', legendFontSize: 8, legendColor: C.textMid,
    });
  }

  // SLIDE 7: RÉSUMÉ
  slide = pres.addSlide();
  addSlideHeader(pres, slide, 'Résumé Chiffré');

  const hO = { fill: { color: C.headerBg }, color: 'FFFFFF', bold: true, fontSize: 10, fontFace: 'Arial', align: 'left' as const, valign: 'middle' as const };
  const hR = { ...hO, align: 'right' as const };
  const c1 = { fill: { color: C.bg }, color: C.text, fontSize: 10, fontFace: 'Arial', align: 'left' as const, valign: 'middle' as const };
  const c1R = { ...c1, align: 'right' as const, bold: true, color: C.primary };
  const c2 = { ...c1, fill: { color: C.bgAlt } };
  const c2R = { ...c1R, fill: { color: C.bgAlt } };

  const tbl = [
    [{ text: 'Indicateur', options: hO }, { text: 'Valeur', options: hR }],
    [{ text: 'Total membres', options: c1 }, { text: String(allMembers.length), options: c1R }],
    [{ text: 'Membres actifs', options: c2 }, { text: String(active.length), options: c2R }],
    [{ text: 'Membres inactifs / archivés', options: c1 }, { text: String(inactive.length), options: c1R }],
    [{ text: 'Hommes / Femmes', options: c2 }, { text: `${gM} / ${gF} (${gM + gF > 0 ? Math.round(gM / (gM + gF) * 100) : 0}% / ${gM + gF > 0 ? Math.round(gF / (gM + gF) * 100) : 0}%)`, options: c2R }],
    [{ text: 'Âge moyen / min / max', options: c1 }, { text: `${avgAge} / ${ageMin} / ${ageMax} ans`, options: c1R }],
    [{ text: 'Plongeurs actifs', options: c2 }, { text: String(divers), options: c2R }],
    [{ text: 'Licenciés LIFRAS', options: c1 }, { text: String(lifras), options: c1R }],
    [{ text: 'Encadrants (MC + MF + AM + INI)', options: c2 }, { text: `${encadrants} (${active.length > 0 ? Math.round(encadrants / active.length * 100) : 0}%)`, options: c2R }],
    [{ text: 'Ratio encadrant / plongeur', options: c1 }, { text: `1 : ${ratio}`, options: c1R }],
    [{ text: 'Membres du CA', options: c2 }, { text: String(roleCounts['CA'] || 0), options: c2R }],
    [{ text: 'Certificats médicaux en ordre', options: c1 }, { text: `${hasMedical}/${active.length} (${Math.round(medPct * 100)}%)`, options: c1R }],
    [{ text: 'Cotisations valides', options: c2 }, { text: `${cotisValid}/${active.length} (${Math.round(cotPct * 100)}%)`, options: c2R }],
    [{ text: 'Utilisateurs App Mobile', options: c1 }, { text: `${hasApp} (${active.length > 0 ? Math.round(hasApp / active.length * 100) : 0}%)`, options: c1R }],
  ];
  slide.addTable(tbl, { x: 0.5, y: 0.85, w: 9, colW: [6, 3], border: { pt: 0.5, color: C.grid } });

  // SLIDE 8: CLOSING
  slide = pres.addSlide();
  slide.background = { color: C.bg };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
  slide.addText('CALYPSO DIVING CLUB', { x: 0.5, y: 1.5, w: 9, h: 0.5, fontSize: 16, fontFace: 'Arial', color: C.accent, align: 'center', charSpacing: 6 });
  slide.addText('Merci', { x: 0.5, y: 2.3, w: 9, h: 0.7, fontSize: 34, fontFace: 'Georgia', color: C.primary, bold: true, align: 'center' });
  slide.addShape(pres.ShapeType.rect, { x: 4, y: 3.2, w: 2, h: 0.02, fill: { color: C.accent } });
  slide.addText(`Rapport généré par CalyCompta  •  caly.club`, { x: 0.5, y: 3.5, w: 9, h: 0.3, fontSize: 9, fontFace: 'Arial', color: C.textLight, align: 'center', italic: true });

  // Download
  await pres.writeFile({ fileName: `Calypso_Statistiques_Membres_${year}.pptx` });
  logger.debug('Member statistics PPTX generated successfully');
}

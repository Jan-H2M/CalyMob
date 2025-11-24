import { jsPDF } from 'jspdf';
import { db } from '@/lib/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

/**
 * Structure des données pour la génération de PDF
 */
export interface ExpenseReportData {
  numeroReference: string;
  declarant: {
    nom: string;
    email: string;
  };
  dateCreation: Date;
  depenses: Array<{
    description: string;
    montant: number;
  }>;
  coordonneesBancaires?: {
    beneficiaire: string;
    iban: string;
    bic: string;
  };
  signature: {
    signePar: string;
    dateSignature: Date;
    texte: string;
  };
}

/**
 * Obtient le prochain numéro de référence pour une note de frais
 * Format: NF-CALYPSO-2025-00001
 * Utilise une transaction Firestore pour garantir l'unicité
 */
export async function getNextExpenseReportNumber(clubId: string): Promise<string> {
  const counterRef = doc(db, `clubs/${clubId}/counters/expense_reports`);

  try {
    const newCount = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      let currentCount = 0;
      if (counterDoc.exists()) {
        currentCount = counterDoc.data().current_count || 0;
      }

      const newCount = currentCount + 1;

      // Créer ou mettre à jour le compteur
      transaction.set(counterRef, {
        current_count: newCount,
        last_updated: serverTimestamp()
      }, { merge: true });

      return newCount;
    });

    // Format: NF-CALYPSO-2025-1
    const year = new Date().getFullYear();
    return `NF-CALYPSO-${year}-${newCount}`;

  } catch (error) {
    console.error('❌ Error getting expense report number:', error);
    // Réessayer avec un numéro basique au lieu du timestamp
    const year = new Date().getFullYear();
    const simpleNumber = Math.floor(Math.random() * 1000) + 1;
    console.warn('⚠️ Utilisation d\'un numéro aléatoire:', simpleNumber);
    return `NF-CALYPSO-${year}-${simpleNumber}`;
  }
}

/**
 * Helper pour charger une image depuis une URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Génère un PDF de note de frais avec logo Calypso, données et signature électronique
 * @returns Blob PDF prêt à être uploadé
 */
export async function generateExpenseReportPDF(data: ExpenseReportData): Promise<Blob> {
  const doc = new jsPDF();

  let yPos = 10;

  // === HEADER ===

  // Logo Calypso (en haut à gauche)
  try {
    const logoImg = await loadImage('/logo-horizontal.jpg');

    // Obtenir les dimensions réelles de l'image pour préserver le ratio
    const imgProps = doc.getImageProperties(logoImg);
    const imgRatio = imgProps.width / imgProps.height;

    // Définir la largeur souhaitée (en mm)
    const logoWidth = 50;
    // Calculer la hauteur proportionnelle pour préserver le ratio
    const logoHeight = logoWidth / imgRatio;

    console.log(`📐 Logo dimensions: ${imgProps.width}x${imgProps.height}, ratio: ${imgRatio.toFixed(2)}`);
    console.log(`📐 PDF logo: ${logoWidth}mm x ${logoHeight.toFixed(2)}mm`);

    doc.addImage(logoImg, 'JPEG', 15, yPos, logoWidth, logoHeight);
  } catch (error) {
    console.warn('Logo non chargé:', error);
  }

  // Titre et numéro de référence (en haut à droite)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTE DE FRAIS', 195, yPos + 5, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Nº ${data.numeroReference}`, 195, yPos + 12, { align: 'right' });
  doc.setTextColor(0, 0, 0); // Reset color

  yPos = 40;

  // === LIGNE DE SÉPARATION ===
  doc.setDrawColor(200, 200, 200);
  doc.line(15, yPos, 195, yPos);
  yPos += 8;

  // === SECTION: INFORMATIONS GÉNÉRALES ===
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('INFORMATIONS GÉNÉRALES', 15, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Demandeur: ${data.declarant.nom}`, 15, yPos);
  yPos += 6;
  doc.text(`Email: ${data.declarant.email}`, 15, yPos);
  yPos += 6;

  // Format date en texte français
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(data.dateCreation);
  doc.text(`Date: ${dateStr}`, 15, yPos);
  yPos += 12;

  // === LIGNE DE SÉPARATION ===
  doc.setDrawColor(200, 200, 200);
  doc.line(15, yPos, 195, yPos);
  yPos += 8;

  // === SECTION: DÉPENSES ===
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DÉPENSES', 15, yPos);
  yPos += 8;

  // Liste des dépenses
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  data.depenses.forEach(dep => {
    // Vérifier si on doit créer une nouvelle page
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }

    // Bullet point + description (max 120 chars pour éviter débordement)
    const description = dep.description.length > 120
      ? dep.description.substring(0, 117) + '...'
      : dep.description;
    doc.text(`• ${description}`, 20, yPos);

    // Montant aligné à droite
    doc.text(`${dep.montant.toFixed(2)} €`, 195, yPos, { align: 'right' });
    yPos += 6;
  });

  yPos += 6;

  // === TOTAL ===
  const total = data.depenses.reduce((sum, d) => sum + d.montant, 0);

  // Fond gris pour le total
  doc.setFillColor(240, 240, 240);
  doc.rect(15, yPos - 4, 180, 10, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL À REMBOURSER:', 20, yPos + 2);
  doc.text(`${total.toFixed(2)} €`, 195, yPos + 2, { align: 'right' });

  yPos += 12;

  // === LIGNE DE SÉPARATION ===
  doc.setDrawColor(200, 200, 200);
  doc.line(15, yPos, 195, yPos);
  yPos += 8;

  // === SECTION: COORDONNÉES BANCAIRES (si renseignées) ===
  if (data.coordonneesBancaires && data.coordonneesBancaires.iban) {

    // Vérifier si on doit créer une nouvelle page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('COORDONNÉES BANCAIRES', 15, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Bénéficiaire: ${data.coordonneesBancaires.beneficiaire}`, 15, yPos);
    yPos += 6;

    doc.text(`IBAN: ${data.coordonneesBancaires.iban}`, 15, yPos);
    yPos += 6;

    yPos += 6;

    // === LIGNE DE SÉPARATION ===
    doc.setDrawColor(200, 200, 200);
    doc.line(15, yPos, 195, yPos);
    yPos += 8;
  }

  // === SECTION: SIGNATURE ÉLECTRONIQUE ===

  // Vérifier si on doit créer une nouvelle page
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGNATURE ÉLECTRONIQUE', 15, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Signé par: ${data.signature.signePar}`, 15, yPos);
  yPos += 6;

  const signatureDate = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(data.signature.dateSignature);
  doc.text(`Date: ${signatureDate}`, 15, yPos);
  yPos += 8;

  // === FOOTER ===
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} sur ${pageCount}`,
      105,
      290,
      { align: 'center' }
    );
    doc.text(
      'Calypso Diving Club - Note de frais générée automatiquement',
      105,
      285,
      { align: 'center' }
    );
  }

  // Retourner le PDF comme Blob
  return doc.output('blob');
}

/**
 * Service d'export
 */
export const expenseReportService = {
  getNextExpenseReportNumber,
  generateExpenseReportPDF
};

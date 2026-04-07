import { logger } from '@/utils/logger';
// jsPDF is loaded dynamically to reduce initial bundle size (~300KB)
import { User } from '@/types/user.types';
import { Timestamp } from 'firebase/firestore';
import { isActive as checkIsActive, getRole } from '@/utils/fieldMapper';

interface MemberForPdf {
  firstName: string;
  lastName: string;
  medicalValid: boolean;
  cotisationValid: boolean;
  hasIssue: boolean;
  isActiveMember: boolean;
  medicalEditionExpiry: Date | null; // certificat_medical_date + 365 days
}

// Parse date from various formats
const parseDate = (value: Date | Timestamp | string | undefined | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if ((value as Timestamp)?.toDate) return (value as Timestamp).toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

// Check if a date is valid (not expired)
const isDateValid = (value: Date | Timestamp | string | undefined | null): boolean => {
  const date = parseDate(value);
  if (!date) return false;
  return date >= new Date();
};

// Get color status for medical edition expiry date
// Returns: 'red' (expired), 'orange' (expires within 1 month), 'grey' (OK)
const getMedicalEditionStatus = (expiryDate: Date | null): 'red' | 'orange' | 'grey' | 'none' => {
  if (!expiryDate) return 'none';
  const now = new Date();
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

  if (expiryDate < now) return 'red';         // Expired
  if (expiryDate < oneMonthFromNow) return 'orange'; // Expires within 1 month
  return 'grey';                                // OK, more than 1 month left
};

// Format date as DD/MM
const formatDateShort = (date: Date | null): string => {
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

// Truncate text if too long
const truncate = (text: string, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 2) + '..';
};

// Load image as base64
const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = url;
  });
};

// Helper to draw page header (logo, title, legend, column headers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drawPageHeader(doc: any, pageWidth: number, margin: number, numColumns: number, columnWidth: number, columnGap: number, title: string) {
  // Logo
  try {
    const logoBase64 = await loadImageAsBase64('/logo-horizontal.jpg');
    const logoHeight = 14;
    const logoWidth = logoHeight * 1.41;
    doc.addImage(logoBase64, 'JPEG', pageWidth - margin - logoWidth, margin - 2, logoWidth, logoHeight);
  } catch (e) {
    logger.warn('Could not load logo:', e);
  }

  // Title
  const today = new Date().toLocaleDateString('fr-BE');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`${title} - Calypso DC - ${today}`, margin, margin + 5);

  // Legend
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `M = Medical | C = Cotisation | E = Edition+1an | O = OK | X = Manquant/Expire | Rouge = expire | Orange = <1 mois`,
    margin, margin + 9
  );

  // Column headers
  const headerY = margin + 14;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);

  for (let col = 0; col < numColumns; col++) {
    const colX = margin + col * (columnWidth + columnGap);
    doc.text('Nom Prenom', colX + 2, headerY);
    doc.text('M', colX + columnWidth - 24, headerY);
    doc.text('C', colX + columnWidth - 19, headerY);
    doc.text('E', colX + columnWidth - 14, headerY);
    doc.rect(colX + columnWidth - 6, headerY - 3, 3, 3);
  }

  // Header line
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, headerY + 2, pageWidth - margin, headerY + 2);

  return headerY;
}

// Helper to draw members on a page
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawMembers(doc: any, members: MemberForPdf[], margin: number, pageWidth: number, pageHeight: number, numColumns: number, columnWidth: number, columnGap: number, headerY: number, lineHeight: number, isInactivePage: boolean) {
  const startY = headerY + 6;
  const maxY = pageHeight - margin - 5;
  const maxRows = Math.floor((maxY - startY) / lineHeight);

  doc.setFontSize(8);

  members.forEach((member, index) => {
    const col = Math.floor(index / maxRows);
    const row = index % maxRows;

    if (col >= numColumns) return;

    const colX = margin + col * (columnWidth + columnGap);
    const y = startY + row * lineHeight;
    const isInactive = isInactivePage;

    // Background
    if (isInactive) {
      doc.setFillColor(235, 235, 235);
      doc.rect(colX, y - 3.2, columnWidth, lineHeight, 'F');
    } else if (member.hasIssue) {
      doc.setFillColor(255, 220, 220);
      doc.rect(colX, y - 3.2, columnWidth, lineHeight, 'F');
    }

    // Name
    const maxTotalLength = 24;
    const firstName = member.firstName;
    const lastNameUpper = member.lastName.toUpperCase();
    const spaceForLastName = maxTotalLength - firstName.length - 1;
    const lastName = spaceForLastName > 3 ? truncate(lastNameUpper, spaceForLastName) : truncate(lastNameUpper, 3);
    const fullName = `${lastName} ${firstName}`;

    if (isInactive) {
      doc.setTextColor(140, 140, 140);
    } else if (member.hasIssue) {
      doc.setTextColor(150, 0, 0);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    doc.setFont('helvetica', 'normal');
    doc.text(fullName, colX + 2, y);

    // Medical validity status (M)
    doc.setFont('helvetica', 'bold');
    if (member.medicalValid) {
      doc.setTextColor(isInactive ? 160 : 0, 128, 0);
      doc.text('O', colX + columnWidth - 24, y);
    } else {
      doc.setTextColor(200, isInactive ? 120 : 0, isInactive ? 120 : 0);
      doc.text('X', colX + columnWidth - 24, y);
    }

    // Cotisation status (C)
    if (member.cotisationValid) {
      doc.setTextColor(isInactive ? 160 : 0, 128, 0);
      doc.text('O', colX + columnWidth - 19, y);
    } else {
      doc.setTextColor(200, isInactive ? 120 : 0, isInactive ? 120 : 0);
      doc.text('X', colX + columnWidth - 19, y);
    }

    // Medical edition expiry date (E) - color coded
    const editionStatus = getMedicalEditionStatus(member.medicalEditionExpiry);
    const editionText = formatDateShort(member.medicalEditionExpiry);
    doc.setFontSize(6);
    if (editionStatus === 'red') {
      doc.setTextColor(200, 0, 0);
    } else if (editionStatus === 'orange') {
      doc.setTextColor(230, 140, 0);
    } else if (editionStatus === 'grey') {
      doc.setTextColor(140, 140, 140);
    } else {
      doc.setTextColor(180, 180, 180);
    }
    doc.setFont('helvetica', 'normal');
    doc.text(editionText || '-', colX + columnWidth - 15, y);
    doc.setFontSize(8);

    // Checkbox
    doc.setDrawColor(isInactive ? 180 : 0, isInactive ? 180 : 0, isInactive ? 180 : 0);
    doc.setLineWidth(0.3);
    doc.rect(colX + columnWidth - 6, y - 3, 3, 3);
  });

  // Column separators
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  for (let col = 1; col < numColumns; col++) {
    const x = margin + col * (columnWidth + columnGap) - columnGap / 2;
    doc.line(x, headerY - 2, x, pageHeight - margin);
  }

  // Totals at bottom
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `${isInactivePage ? 'Inactifs' : 'Actifs'}: ${members.length} membres`,
    margin, pageHeight - 3
  );

  // Warning if some members couldn't fit
  if (members.length > maxRows * numColumns) {
    doc.setTextColor(200, 0, 0);
    doc.text(
      `⚠ ${members.length - maxRows * numColumns} membres non affichés (limite de page atteinte)`,
      margin + 120, pageHeight - 3
    );
  }
}

export async function generatePresencePdf(users: User[]): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  // Exclude only superadmin test accounts
  const excludedRoles = ['superadmin'];

  const allMembers: MemberForPdf[] = users
    .filter(u => !excludedRoles.includes(getRole(u)))
    .filter((u, index, arr) => {
      const uid = u.uid || u.id;
      if (!uid) return true;
      return arr.findIndex(x => (x.uid || x.id) === uid) === index;
    })
    .map(u => {
      const medicalValid = isDateValid(u.certificat_medical_validite);
      const cotisationValid = isDateValid(u.cotisation_validite);

      // Calculate medical edition expiry: certificat_medical_date + 365 days
      const editionDate = parseDate(u.certificat_medical_date);
      let medicalEditionExpiry: Date | null = null;
      if (editionDate) {
        medicalEditionExpiry = new Date(editionDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      }

      return {
        firstName: u.firstName || u.displayName?.split(' ')[0] || '',
        lastName: u.lastName || u.nom || u.displayName?.split(' ').slice(1).join(' ') || '',
        medicalValid,
        cotisationValid,
        hasIssue: !medicalValid || !cotisationValid,
        isActiveMember: checkIsActive(u),
        medicalEditionExpiry,
      };
    });

  // Sort alphabetically
  const activeMembers = allMembers
    .filter(m => m.isActiveMember)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));
  const inactiveMembers = allMembers
    .filter(m => !m.isActiveMember)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));

  // Create PDF in landscape A4
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 8;
  const numColumns = 4;
  const columnGap = 3;
  const columnWidth = (pageWidth - 2 * margin - (numColumns - 1) * columnGap) / numColumns;
  const lineHeight = 4.8;

  // === PAGE 1: Active members ===
  const headerY1 = await drawPageHeader(doc, pageWidth, margin, numColumns, columnWidth, columnGap, 'Liste de Presences (Actifs)');
  drawMembers(doc, activeMembers, margin, pageWidth, pageHeight, numColumns, columnWidth, columnGap, headerY1, lineHeight, false);

  // === PAGE 2: Inactive members (achterkant) ===
  if (inactiveMembers.length > 0) {
    doc.addPage();
    const headerY2 = await drawPageHeader(doc, pageWidth, margin, numColumns, columnWidth, columnGap, 'Liste de Presences (Inactifs)');
    drawMembers(doc, inactiveMembers, margin, pageWidth, pageHeight, numColumns, columnWidth, columnGap, headerY2, lineHeight, true);
  }

  const today = new Date().toLocaleDateString('fr-BE');
  doc.save(`Liste_Presences_${today.replace(/\//g, '-')}.pdf`);
}

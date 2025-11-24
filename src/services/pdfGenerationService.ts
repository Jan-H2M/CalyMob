import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Loan, InventoryItem, Member, StockProduct, Sale, Order } from '@/types/inventory';
import { Timestamp } from 'firebase/firestore';

/**
 * Service de génération de documents PDF pour le module Inventaire
 *
 * Génère:
 * - Contrat de prêt signé
 * - Reçu de vente
 * - Bon de commande fournisseur
 * - Rapport d'inventaire
 */
export class PDFGenerationService {

  /**
   * Génère un contrat de prêt signé (PDF)
   *
   * @param loan - Prêt
   * @param member - Membre emprunteur
   * @param items - Liste matériel prêté
   * @param clubInfo - Informations club (nom, adresse, logo)
   * @returns Blob PDF
   */
  static async generateLoanContract(
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    clubInfo: {
      nom: string;
      adresse?: string;
      telephone?: string;
      email?: string;
      logo_url?: string;
    }
  ): Promise<Blob> {
    const doc = new jsPDF();

    // Configuration
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 15;
    let currentY = 20;

    // === HEADER: Logo + Infos Club ===
    if (clubInfo.logo_url) {
      try {
        // Charger logo (async)
        const logoImg = await this.loadImage(clubInfo.logo_url);
        doc.addImage(logoImg, 'PNG', marginX, currentY, 40, 20);
        currentY += 25;
      } catch (error) {
        console.warn('Impossible de charger le logo:', error);
        currentY += 5;
      }
    }

    // Nom club
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(clubInfo.nom, pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    // Coordonnées club
    if (clubInfo.adresse || clubInfo.telephone || clubInfo.email) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const coords: string[] = [];
      if (clubInfo.adresse) coords.push(clubInfo.adresse);
      if (clubInfo.telephone) coords.push(`Tél: ${clubInfo.telephone}`);
      if (clubInfo.email) coords.push(`Email: ${clubInfo.email}`);

      doc.text(coords.join(' • '), pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }

    // Ligne séparation
    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, currentY, pageWidth - marginX, currentY);
    currentY += 10;

    // === TITRE ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRAT DE PRÊT DE MATÉRIEL', pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;

    // Numéro contrat + Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`N° ${loan.id}`, marginX, currentY);
    doc.text(`Date: ${this.formatDate(loan.date_pret)}`, pageWidth - marginX, currentY, { align: 'right' });
    currentY += 12;

    // === PARTIE 1: IDENTIFICATION EMPRUNTEUR ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1. EMPRUNTEUR', marginX, currentY);
    currentY += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nom: ${member.nom} ${member.prenom}`, marginX + 5, currentY);
    currentY += 5;
    doc.text(`Email: ${member.email}`, marginX + 5, currentY);
    currentY += 5;
    if (member.telephone) {
      doc.text(`Téléphone: ${member.telephone}`, marginX + 5, currentY);
      currentY += 5;
    }
    currentY += 5;

    // === PARTIE 2: MATÉRIEL PRÊTÉ ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. MATÉRIEL PRÊTÉ', marginX, currentY);
    currentY += 7;

    // Tableau matériel
    const tableData = items.map(item => [
      item.numero_serie || '-',
      item.nom,
      `${item.valeur_achat.toFixed(2)} €`,
      item.etat_actuel || 'Bon'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Code', 'Désignation', 'Valeur', 'État']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 80 },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 25 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // === PARTIE 3: CONDITIONS DU PRÊT ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3. CONDITIONS DU PRÊT', marginX, currentY);
    currentY += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Période prêt
    doc.text(`Date de début: ${this.formatDate(loan.date_pret)}`, marginX + 5, currentY);
    currentY += 5;
    doc.text(`Date de retour prévue: ${this.formatDate(loan.date_retour_prevue)}`, marginX + 5, currentY);
    currentY += 5;

    // Caution
    doc.setFont('helvetica', 'bold');
    doc.text(`Montant de la caution: ${loan.montant_caution.toFixed(2)} €`, marginX + 5, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 8;

    // === PARTIE 4: CLAUSES DE RESPONSABILITÉ ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('4. CLAUSES DE RESPONSABILITÉ', marginX, currentY);
    currentY += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const clauses = [
      "L'emprunteur s'engage à restituer le matériel dans le même état qu'au moment du prêt.",
      "L'emprunteur est responsable de toute perte, vol ou dégradation du matériel pendant la durée du prêt.",
      "En cas de dommage, l'emprunteur s'engage à prendre en charge les frais de réparation ou de remplacement.",
      "Le matériel doit être utilisé conformément à sa destination et aux règles de sécurité en vigueur.",
      "La caution sera restituée intégralement si le matériel est rendu en bon état et dans les délais convenus.",
      "En cas de retard de restitution sans accord préalable, une pénalité pourra être appliquée.",
      "L'emprunteur s'engage à ne pas sous-louer ou prêter le matériel à un tiers."
    ];

    clauses.forEach((clause, index) => {
      const lines = doc.splitTextToSize(`${index + 1}. ${clause}`, pageWidth - 2 * marginX - 10);
      doc.text(lines, marginX + 5, currentY);
      currentY += lines.length * 4;
    });

    currentY += 10;

    // === PARTIE 5: SIGNATURES ===
    // Vérifier si nouvelle page nécessaire
    if (currentY > pageHeight - 80) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('5. SIGNATURES', marginX, currentY);
    currentY += 10;

    // Signature membre (gauche)
    const signatureWidth = 60;
    const signatureHeight = 30;
    const leftX = marginX + 10;
    const rightX = pageWidth - marginX - signatureWidth - 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("L'Emprunteur", leftX + signatureWidth / 2, currentY, { align: 'center' });

    // Cadre signature membre
    if (loan.signature_membre_url) {
      try {
        const signatureImg = await this.loadImage(loan.signature_membre_url);
        doc.addImage(signatureImg, 'PNG', leftX, currentY + 2, signatureWidth, signatureHeight);
      } catch (error) {
        console.warn('Impossible de charger la signature membre:', error);
      }
    }
    doc.rect(leftX, currentY + 2, signatureWidth, signatureHeight);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${member.nom} ${member.prenom}`, leftX + signatureWidth / 2, currentY + signatureHeight + 7, { align: 'center' });
    doc.text(this.formatDate(loan.date_pret), leftX + signatureWidth / 2, currentY + signatureHeight + 12, { align: 'center' });

    // Signature responsable (droite)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Le Responsable Club', rightX + signatureWidth / 2, currentY, { align: 'center' });

    // Cadre signature responsable (placeholder)
    doc.rect(rightX, currentY + 2, signatureWidth, signatureHeight);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Responsable Matériel', rightX + signatureWidth / 2, currentY + signatureHeight + 7, { align: 'center' });
    doc.text(this.formatDate(loan.date_pret), rightX + signatureWidth / 2, currentY + signatureHeight + 12, { align: 'center' });

    currentY += signatureHeight + 20;

    // === FOOTER: Hash document ===
    const docHash = await this.generateDocumentHash(loan, member, items);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Hash du document: ${docHash}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Générer Blob
    return doc.output('blob');
  }

  /**
   * Génère un reçu de vente (PDF)
   */
  static async generateSaleReceipt(
    sale: Sale,
    product: StockProduct,
    member: Member,
    clubInfo: {
      nom: string;
      adresse?: string;
      telephone?: string;
      email?: string;
      logo_url?: string;
    }
  ): Promise<Blob> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 15;
    let currentY = 20;

    // === HEADER ===
    if (clubInfo.logo_url) {
      try {
        const logoImg = await this.loadImage(clubInfo.logo_url);
        doc.addImage(logoImg, 'PNG', marginX, currentY, 40, 20);
        currentY += 25;
      } catch (error) {
        console.warn('Impossible de charger le logo:', error);
        currentY += 5;
      }
    }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(clubInfo.nom, pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    if (clubInfo.adresse || clubInfo.telephone || clubInfo.email) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const coords: string[] = [];
      if (clubInfo.adresse) coords.push(clubInfo.adresse);
      if (clubInfo.telephone) coords.push(`Tél: ${clubInfo.telephone}`);
      if (clubInfo.email) coords.push(`Email: ${clubInfo.email}`);

      doc.text(coords.join(' • '), pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, currentY, pageWidth - marginX, currentY);
    currentY += 10;

    // === TITRE ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REÇU DE VENTE', pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;

    // Numéro reçu + Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Reçu N° ${sale.id}`, marginX, currentY);
    doc.text(`Date: ${this.formatDate(sale.date_vente)}`, pageWidth - marginX, currentY, { align: 'right' });
    currentY += 12;

    // === CLIENT ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT', marginX, currentY);
    currentY += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${member.nom} ${member.prenom}`, marginX + 5, currentY);
    currentY += 5;
    doc.text(member.email, marginX + 5, currentY);
    currentY += 10;

    // === DÉTAILS VENTE ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DÉTAILS', marginX, currentY);
    currentY += 7;

    // Tableau produit
    autoTable(doc, {
      startY: currentY,
      head: [['Produit', 'Quantité', 'Prix unitaire', 'Total']],
      body: [[
        product.nom,
        sale.quantite.toString(),
        `${(sale.montant_total / sale.quantite).toFixed(2)} €`,
        `${sale.montant_total.toFixed(2)} €`
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 10
      },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // === TOTAL ===
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${sale.montant_total.toFixed(2)} €`, pageWidth - marginX, currentY, { align: 'right' });
    currentY += 10;

    // === MODE PAIEMENT ===
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const modePaiement = sale.mode_paiement === 'cash' ? 'Espèces' :
                          sale.mode_paiement === 'card' ? 'Carte bancaire' :
                          sale.mode_paiement === 'transfer' ? 'Virement' : 'Autre';
    doc.text(`Mode de paiement: ${modePaiement}`, marginX, currentY);
    currentY += 15;

    // === FOOTER ===
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Merci pour votre achat !', pageWidth / 2, currentY, { align: 'center' });

    return doc.output('blob');
  }

  /**
   * Génère un bon de commande fournisseur (PDF)
   */
  static async generatePurchaseOrder(
    order: Order,
    products: { product: StockProduct; quantite: number; prix_unitaire: number }[],
    clubInfo: {
      nom: string;
      adresse?: string;
      telephone?: string;
      email?: string;
      logo_url?: string;
    }
  ): Promise<Blob> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 15;
    let currentY = 20;

    // === HEADER ===
    if (clubInfo.logo_url) {
      try {
        const logoImg = await this.loadImage(clubInfo.logo_url);
        doc.addImage(logoImg, 'PNG', marginX, currentY, 40, 20);
        currentY += 25;
      } catch (error) {
        currentY += 5;
      }
    }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(clubInfo.nom, pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    if (clubInfo.adresse || clubInfo.telephone || clubInfo.email) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const coords: string[] = [];
      if (clubInfo.adresse) coords.push(clubInfo.adresse);
      if (clubInfo.telephone) coords.push(`Tél: ${clubInfo.telephone}`);
      if (clubInfo.email) coords.push(`Email: ${clubInfo.email}`);

      doc.text(coords.join(' • '), pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, currentY, pageWidth - marginX, currentY);
    currentY += 10;

    // === TITRE ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BON DE COMMANDE', pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;

    // Numéro + Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Commande N° ${order.id}`, marginX, currentY);
    doc.text(`Date: ${this.formatDate(order.date_commande)}`, pageWidth - marginX, currentY, { align: 'right' });
    currentY += 12;

    // === FOURNISSEUR ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FOURNISSEUR', marginX, currentY);
    currentY += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(order.fournisseur, marginX + 5, currentY);
    currentY += 10;

    // === ARTICLES COMMANDÉS ===
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ARTICLES COMMANDÉS', marginX, currentY);
    currentY += 7;

    const tableData = products.map(p => [
      p.product.reference || '-',
      p.product.nom,
      p.quantite.toString(),
      `${p.prix_unitaire.toFixed(2)} €`,
      `${(p.quantite * p.prix_unitaire).toFixed(2)} €`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Référence', 'Désignation', 'Qté', 'Prix unitaire', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // === TOTAL ===
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL HT: ${order.montant_total.toFixed(2)} €`, pageWidth - marginX, currentY, { align: 'right' });
    currentY += 10;

    // === NOTES ===
    if (order.notes) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTES', marginX, currentY);
      currentY += 5;

      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(order.notes, pageWidth - 2 * marginX);
      doc.text(lines, marginX + 5, currentY);
    }

    return doc.output('blob');
  }

  // === UTILITAIRES ===

  /**
   * Charge une image depuis une URL (avec CORS)
   */
  private static async loadImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Formate une date Firestore Timestamp
   */
  private static formatDate(timestamp: Timestamp | Date): string {
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  /**
   * Génère un hash SHA-256 du document (pour intégrité)
   */
  private static async generateDocumentHash(loan: Loan, member: Member, items: InventoryItem[]): Promise<string> {
    const data = JSON.stringify({
      loanId: loan.id,
      memberId: member.id,
      itemIds: items.map(i => i.id),
      caution: loan.montant_caution,
      date: loan.date_pret.toMillis()
    });

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex.substring(0, 16); // 16 premiers caractères
  }
}

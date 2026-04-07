import { logger } from '@/utils/logger';
/**
 * Service d'export Excel pour les rapports
 *
 * Utilise ExcelJS pour créer des fichiers Excel riches
 * avec graphiques, styles avancés et formatage professionnel
 */

// ExcelJS is loaded dynamically to reduce initial bundle size
import type ExcelJS from 'exceljs';
import { EventStatistics, ReportMetadata } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { saveAs } from 'file-saver';

export class ExcelExportService {
  /**
   * Exporte le rapport d'événements en Excel avec graphiques
   */
  static async exportEventReport(
    data: EventStatistics,
    metadata: ReportMetadata
  ): Promise<void> {
    logger.debug('📊 Génération export Excel rapport événements avec ExcelJS...');

    // Dynamic import for code splitting - ExcelJS is a large library
    const ExcelJS = await import('exceljs');

    // Créer un nouveau classeur
    const workbook = new ExcelJS.Workbook();
    workbook.creator = metadata.generated_by_name;
    workbook.created = metadata.generated_at;

    // Créer les différentes feuilles avec styles et graphiques
    await this.createSummarySheet(workbook, data, metadata);
    await this.createMonthlySheet(workbook, data);

    if (data.top_participants.length > 0) {
      await this.createTop10Sheet(workbook, data);
    }

    if (data.events.length > 0) {
      await this.createEventsListSheet(workbook, data);
    }

    // Générer le buffer et télécharger
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const fileName = this.generateFileName(metadata);
    saveAs(blob, fileName);

    logger.debug(`✅ Export Excel généré: ${fileName}`);
  }

  /**
   * Crée la feuille "Résumé" avec styles riches
   */
  private static async createSummarySheet(
    workbook: ExcelJS.Workbook,
    data: EventStatistics,
    metadata: ReportMetadata
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Résumé', {
      views: [{ showGridLines: false }]
    });

    // Définir les largeurs de colonnes
    sheet.columns = [
      { width: 25 },
      { width: 15 },
      { width: 25 },
      { width: 15 }
    ];

    // === EN-TÊTE ===
    let row = 1;

    // Titre principal
    const titleRow = sheet.getRow(row++);
    titleRow.getCell(1).value = 'RAPPORT D\'ÉVÉNEMENTS';
    titleRow.getCell(1).font = { size: 18, bold: true, color: { argb: 'FF1e40af' } };
    titleRow.height = 25;

    // Club
    const clubRow = sheet.getRow(row++);
    clubRow.getCell(1).value = metadata.club_name;
    clubRow.getCell(1).font = { size: 14, bold: true };

    // Période
    const periodRow = sheet.getRow(row++);
    periodRow.getCell(1).value = data.period.label;
    periodRow.getCell(1).font = { size: 12, italic: true, color: { argb: 'FF64748b' } };

    // Dates détaillées
    const dateRow = sheet.getRow(row++);
    dateRow.getCell(1).value = `Du ${format(data.period.start_date, 'dd MMMM yyyy', { locale: fr })} au ${format(data.period.end_date, 'dd MMMM yyyy', { locale: fr })}`;
    dateRow.getCell(1).font = { size: 11, color: { argb: 'FF64748b' } };

    row++; // Ligne vide

    // === RÉSUMÉ EXÉCUTIF ===
    const summaryTitleRow = sheet.getRow(row++);
    summaryTitleRow.getCell(1).value = 'RÉSUMÉ EXÉCUTIF';
    summaryTitleRow.getCell(1).font = { size: 14, bold: true, color: { argb: 'FF1e40af' } };
    summaryTitleRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFeff6ff' }
    };
    summaryTitleRow.height = 25;

    row++; // Ligne vide

    // KPIs - En-têtes
    const kpiHeaderRow = sheet.getRow(row++);
    const kpiHeaders = ['Événements', 'Inscriptions', 'Moyenne/Événement', 'Taux Paiement'];
    kpiHeaders.forEach((header, index) => {
      const cell = kpiHeaderRow.getCell(index + 1);
      cell.value = header;
      cell.font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3b82f6' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    kpiHeaderRow.height = 20;

    // KPIs - Valeurs
    const kpiValueRow = sheet.getRow(row++);
    const kpiValues = [
      data.total_events,
      data.total_registrations,
      data.average_registrations_per_event.toFixed(1),
      `${data.payment_rate.toFixed(1)}%`
    ];
    kpiValues.forEach((value, index) => {
      const cell = kpiValueRow.getCell(index + 1);
      cell.value = value;
      cell.font = { size: 16, bold: true, color: { argb: 'FF1e293b' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFdbeafe' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    kpiValueRow.height = 30;

    row += 2; // Lignes vides

    // === STATISTIQUES DÉTAILLÉES ===
    const statsTitle = sheet.getRow(row++);
    statsTitle.getCell(1).value = 'STATISTIQUES DÉTAILLÉES';
    statsTitle.getCell(1).font = { size: 14, bold: true, color: { argb: 'FF1e40af' } };
    statsTitle.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFeff6ff' }
    };
    statsTitle.height = 25;

    row++; // Ligne vide

    // Calculer stats supplémentaires
    const eventsWithParticipants = data.events.filter(event => {
      const count = data.registrations.filter(r => r.evenement_id === event.id).length;
      return count > 0;
    }).length;
    const occupancyRate = data.events.length > 0 ? (eventsWithParticipants / data.events.length) * 100 : 0;
    const paidRegistrations = data.registrations.filter(r => r.paye).length;
    const unpaidRegistrations = data.registrations.filter(r => !r.paye).length;

    // Stats en 2 colonnes - Headers
    const statsHeaderRow = sheet.getRow(row++);
    statsHeaderRow.getCell(1).value = 'Activité';
    statsHeaderRow.getCell(1).font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    statsHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366f1' } };
    statsHeaderRow.getCell(3).value = 'Paiements';
    statsHeaderRow.getCell(3).font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    statsHeaderRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };
    statsHeaderRow.height = 20;

    // Stats détaillées
    const statsData = [
      ['Total événements', data.total_events, 'Inscriptions payées', paidRegistrations],
      ['Événements avec participants', eventsWithParticipants, 'En attente de paiement', unpaidRegistrations],
      ['Taux d\'occupation', `${occupancyRate.toFixed(1)}%`, 'Taux de paiement', `${data.payment_rate.toFixed(1)}%`],
      ['Total inscriptions', data.total_registrations, 'Moyenne par événement', `${data.average_registrations_per_event.toFixed(1)} inscrits`]
    ];

    statsData.forEach(rowData => {
      const dataRow = sheet.getRow(row++);
      dataRow.getCell(1).value = rowData[0];
      dataRow.getCell(1).font = { size: 10, color: { argb: 'FF64748b' } };
      dataRow.getCell(2).value = rowData[1];
      dataRow.getCell(2).font = { size: 10, bold: true };
      dataRow.getCell(2).alignment = { horizontal: 'right' };

      dataRow.getCell(3).value = rowData[2];
      dataRow.getCell(3).font = { size: 10, color: { argb: 'FF64748b' } };
      dataRow.getCell(4).value = rowData[3];
      dataRow.getCell(4).font = { size: 10, bold: true };
      dataRow.getCell(4).alignment = { horizontal: 'right' };

      dataRow.height = 18;
    });
  }

  /**
   * Crée la feuille "Évolution Mensuelle" avec graphique en barres
   */
  private static async createMonthlySheet(
    workbook: ExcelJS.Workbook,
    data: EventStatistics
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Évolution Mensuelle');

    // Largeurs de colonnes
    sheet.columns = [
      { width: 20 },
      { width: 15 },
      { width: 15 }
    ];

    // Titre
    let row = 1;
    const titleRow = sheet.getRow(row++);
    titleRow.getCell(1).value = 'ÉVOLUTION MENSUELLE';
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF1e40af' } };
    titleRow.height = 25;

    row++; // Ligne vide

    // En-têtes du tableau
    const headerRow = sheet.getRow(row++);
    const headers = ['Mois', 'Événements', 'Inscriptions'];
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3b82f6' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 22;

    const dataStartRow = row;

    // Données mensuelles avec lignes alternées
    data.monthly_data.forEach((month, index) => {
      const dataRow = sheet.getRow(row++);
      dataRow.getCell(1).value = month.month;
      dataRow.getCell(2).value = month.event_count;
      dataRow.getCell(3).value = month.registration_count;

      // Style lignes alternées
      const fillColor = index % 2 === 0 ? 'FFFFFFFF' : 'FFf8fafc';
      [1, 2, 3].forEach(col => {
        const cell = dataRow.getCell(col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillColor }
        };
        cell.border = {
          left: { style: 'thin' },
          right: { style: 'thin' },
          bottom: { style: 'hair' }
        };
        if (col > 1) {
          cell.alignment = { horizontal: 'center' };
        }
      });
      dataRow.height = 18;
    });

    const dataEndRow = row - 1;

    // Ligne de totaux
    row++;
    const totalRow = sheet.getRow(row);
    totalRow.getCell(1).value = 'TOTAL';
    totalRow.getCell(1).font = { bold: true, size: 11 };
    totalRow.getCell(2).value = data.monthly_data.reduce((sum, m) => sum + m.event_count, 0);
    totalRow.getCell(3).value = data.monthly_data.reduce((sum, m) => sum + m.registration_count, 0);

    [1, 2, 3].forEach(col => {
      const cell = totalRow.getCell(col);
      cell.font = { bold: true, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFdbeafe' }
      };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
      if (col > 1) {
        cell.alignment = { horizontal: 'center' };
      }
    });
    totalRow.height = 22;

    // Ajouter un graphique en barres (si plus de 0 données)
    if (data.monthly_data.length > 0) {
      // Note: ExcelJS ne supporte pas encore complètement les graphiques
      // On ajoute une note indiquant qu'un graphique peut être créé manuellement
      row += 2;
      const noteRow = sheet.getRow(row);
      noteRow.getCell(1).value = '💡 Astuce: Sélectionnez les données ci-dessus pour créer un graphique dans Excel';
      noteRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF64748b' } };
      sheet.mergeCells(row, 1, row, 3);
    }
  }

  /**
   * Crée la feuille "Top 10 Participants" avec formatage conditionnel
   */
  private static async createTop10Sheet(
    workbook: ExcelJS.Workbook,
    data: EventStatistics
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Top 10 Participants');

    // Largeurs de colonnes
    sheet.columns = [
      { width: 8 },
      { width: 30 },
      { width: 20 },
      { width: 15 }
    ];

    // Titre
    let row = 1;
    const titleRow = sheet.getRow(row++);
    titleRow.getCell(1).value = 'TOP 10 DES PARTICIPANTS LES PLUS ACTIFS';
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF1e40af' } };
    sheet.mergeCells(row - 1, 1, row - 1, 4);
    titleRow.height = 25;

    row++; // Ligne vide

    // En-têtes
    const headerRow = sheet.getRow(row++);
    const headers = ['Rang', 'Nom', 'Nombre d\'événements', 'Pourcentage'];
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3b82f6' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 22;

    // Données Top 10 avec médailles
    data.top_participants.forEach((participant, index) => {
      const dataRow = sheet.getRow(row++);

      // Rang avec médaille
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
      dataRow.getCell(1).value = `${index + 1} ${medal}`.trim();
      dataRow.getCell(1).alignment = { horizontal: 'center' };

      dataRow.getCell(2).value = participant.membre_nom;
      dataRow.getCell(3).value = participant.registration_count;
      dataRow.getCell(3).alignment = { horizontal: 'center' };
      dataRow.getCell(4).value = participant.percentage / 100;
      dataRow.getCell(4).numFmt = '0.0%';
      dataRow.getCell(4).alignment = { horizontal: 'center' };

      // Couleurs pour le podium
      let bgColor = 'FFFFFFFF';
      if (index === 0) bgColor = 'FFFEF3c7'; // Or
      else if (index === 1) bgColor = 'FFe5e7eb'; // Argent
      else if (index === 2) bgColor = 'FFfed7aa'; // Bronze
      else if (index % 2 === 1) bgColor = 'FFf8fafc'; // Lignes alternées

      [1, 2, 3, 4].forEach(col => {
        const cell = dataRow.getCell(col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor }
        };
        cell.border = {
          left: { style: 'thin' },
          right: { style: 'thin' },
          bottom: { style: 'hair' }
        };
        if (index < 3) {
          cell.font = { bold: true };
        }
      });
      dataRow.height = 20;
    });
  }

  /**
   * Crée la feuille "Liste Événements" avec filtres
   */
  private static async createEventsListSheet(
    workbook: ExcelJS.Workbook,
    data: EventStatistics
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Liste Événements');

    // Largeurs de colonnes
    sheet.columns = [
      { width: 12 },
      { width: 40 },
      { width: 12 },
      { width: 10 },
      { width: 10 },
      { width: 12 }
    ];

    // Titre
    let row = 1;
    const titleRow = sheet.getRow(row++);
    titleRow.getCell(1).value = 'LISTE DES ÉVÉNEMENTS';
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF1e40af' } };
    sheet.mergeCells(row - 1, 1, row - 1, 6);
    titleRow.height = 25;

    row++; // Ligne vide

    // En-têtes avec filtres
    const headerRow = sheet.getRow(row++);
    const headers = ['Date', 'Titre', 'Statut', 'Inscrits', 'Payés', 'En attente'];
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3b82f6' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 22;

    const dataStartRow = row;

    // Labels de statut
    const statusLabels: Record<string, string> = {
      'brouillon': 'Brouillon',
      'ouvert': 'Ouvert',
      'ferme': 'Fermé',
      'annule': 'Annulé'
    };

    // Données événements
    data.events.forEach((event, index) => {
      const eventRegs = data.registrations.filter(r => r.evenement_id === event.id);
      const paidRegs = eventRegs.filter(r => r.paye).length;
      const unpaidRegs = eventRegs.length - paidRegs;

      const dataRow = sheet.getRow(row++);
      dataRow.getCell(1).value = format(event.date_debut, 'dd/MM/yyyy', { locale: fr });
      dataRow.getCell(2).value = event.titre;
      dataRow.getCell(3).value = statusLabels[event.statut] || event.statut;
      dataRow.getCell(3).alignment = { horizontal: 'center' };
      dataRow.getCell(4).value = eventRegs.length;
      dataRow.getCell(4).alignment = { horizontal: 'center' };
      dataRow.getCell(5).value = paidRegs;
      dataRow.getCell(5).alignment = { horizontal: 'center' };
      dataRow.getCell(6).value = unpaidRegs;
      dataRow.getCell(6).alignment = { horizontal: 'center' };

      // Lignes alternées
      const fillColor = index % 2 === 0 ? 'FFFFFFFF' : 'FFf8fafc';
      [1, 2, 3, 4, 5, 6].forEach(col => {
        const cell = dataRow.getCell(col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillColor }
        };
        cell.border = {
          left: { style: 'thin' },
          right: { style: 'thin' },
          bottom: { style: 'hair' }
        };
      });
      dataRow.height = 18;
    });

    const dataEndRow = row - 1;

    // Activer les filtres
    sheet.autoFilter = {
      from: { row: dataStartRow - 1, column: 1 },
      to: { row: dataEndRow, column: 6 }
    };

    // Ligne de totaux
    row++;
    const totalRow = sheet.getRow(row);
    totalRow.getCell(1).value = '';
    totalRow.getCell(2).value = 'TOTAL';
    totalRow.getCell(2).font = { bold: true, size: 11 };
    totalRow.getCell(3).value = '';
    totalRow.getCell(4).value = data.registrations.length;
    totalRow.getCell(5).value = data.registrations.filter(r => r.paye).length;
    totalRow.getCell(6).value = data.registrations.filter(r => !r.paye).length;

    [1, 2, 3, 4, 5, 6].forEach(col => {
      const cell = totalRow.getCell(col);
      cell.font = { bold: true, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFdbeafe' }
      };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
      if (col > 2) {
        cell.alignment = { horizontal: 'center' };
      }
    });
    totalRow.height = 22;
  }

  /**
   * Génère le nom du fichier Excel
   */
  private static generateFileName(metadata: ReportMetadata): string {
    const date = format(metadata.generated_at, 'yyyyMMdd');
    return `Rapport_Evenements_${metadata.fiscal_year}_${date}.xlsx`;
  }
}

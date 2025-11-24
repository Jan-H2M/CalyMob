/**
 * Service d'export PowerPoint pour les rapports d'événements
 * Génère des présentations professionnelles avec graphiques natifs PowerPoint
 */

import pptxgen from 'pptxgenjs';
import { EventStatistics, ReportMetadata } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export class PptxExportService {
  // Couleurs Calypso Diving Club
  private static readonly COLORS = {
    primary: '0088CC', // Bleu Calypso
    secondary: '06B6D4', // Cyan
    accent: 'F97316', // Orange
    success: '10B981', // Vert
    gold: 'FCD34D', // Or (podium)
    silver: 'D1D5DB', // Argent
    bronze: 'FDBA74', // Bronze
    text: '1E293B', // Texte sombre
    textLight: '64748B', // Texte gris
    background: 'F8FAFC', // Background clair
    white: 'FFFFFF'
  };

  /**
   * Exporte le rapport d'événements en PowerPoint
   */
  static async exportEventReport(data: EventStatistics, metadata: ReportMetadata): Promise<void> {
    const pres = new pptxgen();

    // Configuration présentation
    pres.layout = 'LAYOUT_16x9';
    pres.author = metadata.generated_by_name;
    pres.company = metadata.club_name;
    pres.subject = `Rapport d'Événements - ${metadata.period.label}`;
    pres.title = `Rapport d'Événements ${metadata.club_name}`;

    // Créer les slides
    await this.createTitleSlide(pres, data, metadata);
    await this.createKPISlide(pres, data);
    await this.createMonthlyBarChartSlide(pres, data);
    await this.createTrendLineChartSlide(pres, data);
    await this.createTop10Slide(pres, data);
    await this.createStatusPieChartSlide(pres, data);
    await this.createEventsListSlide(pres, data);

    // Télécharger
    const fileName = `Rapport_Evenements_${metadata.club_name.replace(/\s+/g, '_')}_${format(metadata.generated_at, 'yyyyMMdd')}.pptx`;
    await pres.writeFile({ fileName });
  }

  /**
   * Slide 1: Page de titre
   */
  private static async createTitleSlide(
    pres: pptxgen,
    data: EventStatistics,
    metadata: ReportMetadata
  ): Promise<void> {
    const slide = pres.addSlide();

    // Background dégradé bleu
    slide.background = { fill: this.COLORS.primary };

    // Titre principal
    slide.addText('Rapport d\'Événements', {
      x: 0.5,
      y: 2.0,
      w: 12,
      h: 1.5,
      fontSize: 54,
      bold: true,
      color: this.COLORS.white,
      align: 'center',
      fontFace: 'Calibri'
    });

    // Nom du club
    slide.addText(metadata.club_name, {
      x: 0.5,
      y: 3.2,
      w: 12,
      h: 0.8,
      fontSize: 32,
      color: this.COLORS.white,
      align: 'center',
      fontFace: 'Calibri'
    });

    // Période
    slide.addText(metadata.period.label, {
      x: 0.5,
      y: 4.2,
      w: 12,
      h: 0.6,
      fontSize: 24,
      color: this.COLORS.background,
      align: 'center',
      fontFace: 'Calibri'
    });

    // Date de génération
    slide.addText(`Généré le ${format(metadata.generated_at, 'dd MMMM yyyy', { locale: fr })}`, {
      x: 0.5,
      y: 5.0,
      w: 12,
      h: 0.4,
      fontSize: 14,
      color: this.COLORS.background,
      align: 'center',
      fontFace: 'Calibri',
      italic: true
    });

    // Généré par
    slide.addText(`Par ${metadata.generated_by_name}`, {
      x: 0.5,
      y: 5.4,
      w: 12,
      h: 0.4,
      fontSize: 14,
      color: this.COLORS.background,
      align: 'center',
      fontFace: 'Calibri',
      italic: true
    });
  }

  /**
   * Slide 2: KPIs visuels (4 cartes)
   */
  private static async createKPISlide(pres: pptxgen, data: EventStatistics): Promise<void> {
    const slide = pres.addSlide();
    slide.background = { fill: this.COLORS.background };

    // Titre slide
    slide.addText('Vue d\'Ensemble', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: this.COLORS.text,
      fontFace: 'Calibri'
    });

    // KPI 1: Total événements
    this.addKPICard(slide, {
      x: 0.5,
      y: 1.5,
      value: data.total_events.toString(),
      label: 'Événements',
      color: this.COLORS.primary
    });

    // KPI 2: Total inscriptions
    this.addKPICard(slide, {
      x: 3.8,
      y: 1.5,
      value: data.total_registrations.toString(),
      label: 'Inscriptions',
      color: this.COLORS.secondary
    });

    // KPI 3: Moyenne inscriptions/événement
    this.addKPICard(slide, {
      x: 7.1,
      y: 1.5,
      value: data.average_registrations_per_event.toFixed(1),
      label: 'Moyenne / Événement',
      color: this.COLORS.accent
    });

    // KPI 4: Taux de paiement
    this.addKPICard(slide, {
      x: 10.4,
      y: 1.5,
      value: `${data.payment_rate.toFixed(0)}%`,
      label: 'Taux Paiement',
      color: this.COLORS.success
    });
  }

  /**
   * Ajoute une carte KPI stylée
   */
  private static addKPICard(
    slide: pptxgen.Slide,
    options: { x: number; y: number; value: string; label: string; color: string }
  ): void {
    const cardWidth = 3.0;
    const cardHeight = 2.5;

    // Rectangle de fond avec ombre
    slide.addShape('rect', {
      x: options.x,
      y: options.y,
      w: cardWidth,
      h: cardHeight,
      fill: { color: this.COLORS.white },
      line: { color: options.color, width: 2 },
      shadow: {
        type: 'outer',
        blur: 8,
        offset: 4,
        angle: 45,
        color: '000000',
        opacity: 0.15
      }
    });

    // Valeur (grand chiffre)
    slide.addText(options.value, {
      x: options.x,
      y: options.y + 0.6,
      w: cardWidth,
      h: 1.0,
      fontSize: 48,
      bold: true,
      color: options.color,
      align: 'center',
      fontFace: 'Calibri'
    });

    // Label
    slide.addText(options.label, {
      x: options.x,
      y: options.y + 1.7,
      w: cardWidth,
      h: 0.5,
      fontSize: 16,
      color: this.COLORS.textLight,
      align: 'center',
      fontFace: 'Calibri'
    });
  }

  /**
   * Slide 3: Graphique en barres - Évolution mensuelle
   */
  private static async createMonthlyBarChartSlide(
    pres: pptxgen,
    data: EventStatistics
  ): Promise<void> {
    const slide = pres.addSlide();
    slide.background = { fill: this.COLORS.background };

    // Titre
    slide.addText('Évolution Mensuelle', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: this.COLORS.text,
      fontFace: 'Calibri'
    });

    // Préparer les données pour le graphique
    const labels = data.monthly_data.map(m => m.month);
    const eventCounts = data.monthly_data.map(m => m.event_count);
    const registrationCounts = data.monthly_data.map(m => m.registration_count);

    const chartData = [
      {
        name: 'Événements',
        labels,
        values: eventCounts
      },
      {
        name: 'Inscriptions',
        labels,
        values: registrationCounts
      }
    ];

    // Ajouter le graphique en barres
    slide.addChart(pres.ChartType.bar, chartData, {
      x: 0.5,
      y: 1.5,
      w: 9.5,
      h: 4.5,
      showTitle: false,
      showLegend: true,
      legendPos: 'b',
      legendFontSize: 11,
      chartColors: [this.COLORS.primary, this.COLORS.secondary],
      barGrouping: 'clustered',
      catAxisLabelColor: this.COLORS.text,
      catAxisLabelFontSize: 9,
      catAxisLabelFontFace: 'Calibri',
      catAxisLabelRotate: 45,
      valAxisLabelColor: this.COLORS.text,
      valAxisLabelFontSize: 11,
      valAxisTitle: 'Nombre',
      valAxisTitleColor: this.COLORS.text,
      valAxisTitleFontSize: 12,
      showValue: false,
      dataLabelColor: this.COLORS.text,
      dataLabelFontSize: 10,
      border: { pt: 1, color: this.COLORS.textLight }
    });
  }

  /**
   * Slide 4: Graphique en ligne - Tendance inscriptions
   */
  private static async createTrendLineChartSlide(
    pres: pptxgen,
    data: EventStatistics
  ): Promise<void> {
    const slide = pres.addSlide();
    slide.background = { fill: this.COLORS.background };

    // Titre
    slide.addText('Tendance des Inscriptions', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: this.COLORS.text,
      fontFace: 'Calibri'
    });

    // Préparer les données
    const labels = data.monthly_data.map(m => m.month);
    const registrationCounts = data.monthly_data.map(m => m.registration_count);

    const chartData = [
      {
        name: 'Inscriptions',
        labels,
        values: registrationCounts
      }
    ];

    // Ajouter le graphique en ligne
    slide.addChart(pres.ChartType.line, chartData, {
      x: 0.5,
      y: 1.5,
      w: 9.5,
      h: 4.5,
      showTitle: false,
      showLegend: true,
      legendPos: 'b',
      legendFontSize: 11,
      chartColors: [this.COLORS.accent],
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 7,
      lineDataSymbolLineSize: 2,
      lineSize: 3,
      catAxisLabelColor: this.COLORS.text,
      catAxisLabelFontSize: 9,
      catAxisLabelFontFace: 'Calibri',
      catAxisLabelRotate: 45,
      valAxisLabelColor: this.COLORS.text,
      valAxisLabelFontSize: 11,
      valAxisTitle: 'Inscriptions',
      valAxisTitleColor: this.COLORS.text,
      valAxisTitleFontSize: 12,
      showValue: false,
      dataLabelColor: this.COLORS.text,
      dataLabelFontSize: 10,
      border: { pt: 1, color: this.COLORS.textLight }
    });
  }

  /**
   * Slide 5: Top 10 participants avec tableau stylé
   */
  private static async createTop10Slide(pres: pptxgen, data: EventStatistics): Promise<void> {
    const slide = pres.addSlide();
    slide.background = { fill: this.COLORS.background };

    // Titre
    slide.addText('Top 10 Participants', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: this.COLORS.text,
      fontFace: 'Calibri'
    });

    // Préparer les données du tableau
    const tableData: any[][] = [];

    // Header
    tableData.push([
      { text: 'Rang', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary } },
      { text: 'Nom', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary } },
      { text: 'Événements', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary, align: 'center' } },
      { text: '% Total', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary, align: 'center' } }
    ]);

    // Données (Top 10)
    const top10 = data.top_participants.slice(0, 10);
    top10.forEach((participant, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';

      // Couleur de fond pour podium
      let fillColor = this.COLORS.white;
      if (rank === 1) fillColor = this.COLORS.gold;
      else if (rank === 2) fillColor = this.COLORS.silver;
      else if (rank === 3) fillColor = this.COLORS.bronze;

      tableData.push([
        { text: `${medal}${rank}`, options: { fill: fillColor } },
        { text: participant.membre_nom, options: { fill: fillColor } },
        { text: participant.registration_count.toString(), options: { fill: fillColor, align: 'center' } },
        { text: `${participant.percentage.toFixed(1)}%`, options: { fill: fillColor, align: 'center' } }
      ]);
    });

    // Ajouter le tableau
    slide.addTable(tableData, {
      x: 1.5,
      y: 1.5,
      w: 10,
      colW: [1.5, 5.0, 2.0, 1.5],
      border: { pt: 1, color: this.COLORS.textLight },
      fontSize: 14,
      fontFace: 'Calibri',
      color: this.COLORS.text
    });
  }

  /**
   * Slide 6: Graphique camembert - Répartition par statut
   */
  private static async createStatusPieChartSlide(
    pres: pptxgen,
    data: EventStatistics
  ): Promise<void> {
    const slide = pres.addSlide();
    slide.background = { fill: this.COLORS.background };

    // Titre
    slide.addText('Répartition par Statut', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: this.COLORS.text,
      fontFace: 'Calibri'
    });

    // Préparer les données pour le camembert
    const statusEntries = Object.entries(data.events_by_status);

    if (statusEntries.length === 0) {
      slide.addText('Aucune donnée de statut disponible', {
        x: 2,
        y: 3,
        w: 9,
        h: 1,
        fontSize: 18,
        color: this.COLORS.textLight,
        align: 'center',
        fontFace: 'Calibri'
      });
      return;
    }

    const labels = statusEntries.map(([status]) => status);
    const values = statusEntries.map(([, count]) => count);

    const chartData = [
      {
        name: 'Événements',
        labels,
        values
      }
    ];

    // Couleurs variées pour chaque statut
    const pieColors = [
      this.COLORS.success, // Confirmé (vert)
      this.COLORS.accent,  // Annulé (orange)
      this.COLORS.secondary, // En attente (cyan)
      this.COLORS.primary  // Autre (bleu)
    ];

    // Ajouter le graphique camembert
    slide.addChart(pres.ChartType.pie, chartData, {
      x: 2,
      y: 1.5,
      w: 9,
      h: 4.5,
      showTitle: false,
      showLegend: true,
      legendPos: 'r',
      legendFontSize: 14,
      chartColors: pieColors,
      showPercent: true,
      dataLabelColor: this.COLORS.white,
      dataLabelFontSize: 14,
      dataLabelFontFace: 'Calibri'
    });
  }

  /**
   * Slide 7: Liste récapitulative des événements
   */
  private static async createEventsListSlide(
    pres: pptxgen,
    data: EventStatistics
  ): Promise<void> {
    const slide = pres.addSlide();
    slide.background = { fill: this.COLORS.background };

    // Titre
    slide.addText('Liste des Événements', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: this.COLORS.text,
      fontFace: 'Calibri'
    });

    // Si pas d'événements, afficher un message
    if (data.events.length === 0) {
      slide.addText('Aucun événement pour cette période', {
        x: 2,
        y: 3,
        w: 9,
        h: 1,
        fontSize: 18,
        color: this.COLORS.textLight,
        align: 'center',
        fontFace: 'Calibri'
      });
      return;
    }

    // Préparer le tableau des événements (maximum 10 pour tenir sur 1 slide)
    const tableData: any[][] = [];

    // Header
    tableData.push([
      { text: 'Date', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary, fontSize: 12 } },
      { text: 'Titre', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary, fontSize: 12 } },
      { text: 'Statut', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary, fontSize: 12, align: 'center' } },
      { text: 'Inscrits', options: { bold: true, color: this.COLORS.white, fill: this.COLORS.primary, fontSize: 12, align: 'center' } }
    ]);

    // Trier les événements par date (plus récent en premier)
    const sortedEvents = [...data.events].sort((a, b) => {
      const dateA = a.date_debut instanceof Date ? a.date_debut : new Date(a.date_debut);
      const dateB = b.date_debut instanceof Date ? b.date_debut : new Date(b.date_debut);
      return dateB.getTime() - dateA.getTime();
    });

    // Prendre les 12 événements les plus récents
    const eventsToShow = sortedEvents.slice(0, 12);

    eventsToShow.forEach((event, index) => {
      const dateDebut = event.date_debut instanceof Date
        ? event.date_debut
        : new Date(event.date_debut);

      const dateStr = format(dateDebut, 'dd/MM/yyyy', { locale: fr });

      // Compter les inscriptions pour cet événement
      const inscriptionCount = data.registrations.filter(
        r => r.evenement_id === event.id
      ).length;

      // Couleur alternée pour les lignes
      const fillColor = index % 2 === 0 ? this.COLORS.white : 'F1F5F9';

      // Couleur du statut
      let statusColor = this.COLORS.textLight;
      if (event.statut === 'confirmé') statusColor = this.COLORS.success;
      else if (event.statut === 'annulé') statusColor = this.COLORS.accent;

      tableData.push([
        { text: dateStr, options: { fill: fillColor, fontSize: 11 } },
        { text: event.titre || 'Sans titre', options: { fill: fillColor, fontSize: 11 } },
        {
          text: event.statut || 'inconnu',
          options: {
            fill: fillColor,
            fontSize: 11,
            align: 'center',
            color: statusColor,
            bold: true
          }
        },
        {
          text: inscriptionCount.toString(),
          options: {
            fill: fillColor,
            fontSize: 11,
            align: 'center',
            bold: true
          }
        }
      ]);
    });

    // Ajouter une ligne de total
    const totalInscriptions = eventsToShow.reduce((sum, event) => {
      return sum + data.registrations.filter(r => r.evenement_id === event.id).length;
    }, 0);

    tableData.push([
      { text: 'TOTAL', options: { bold: true, fill: this.COLORS.primary, color: this.COLORS.white, fontSize: 12 } },
      { text: '', options: { fill: this.COLORS.primary } },
      { text: '', options: { fill: this.COLORS.primary } },
      { text: totalInscriptions.toString(), options: { bold: true, fill: this.COLORS.primary, color: this.COLORS.white, fontSize: 12, align: 'center' } }
    ]);

    // Ajouter le tableau
    slide.addTable(tableData, {
      x: 0.5,
      y: 1.3,
      w: 12,
      colW: [2.0, 7.0, 1.8, 1.2],
      border: { pt: 1, color: this.COLORS.textLight },
      fontSize: 11,
      fontFace: 'Calibri',
      color: this.COLORS.text,
      valign: 'middle'
    });

    // Note si plus de 12 événements
    if (data.events.length > 12) {
      slide.addText(
        `Note: ${data.events.length - 12} événement(s) supplémentaire(s) non affichés`,
        {
          x: 0.5,
          y: 6.3,
          w: 12,
          h: 0.3,
          fontSize: 10,
          color: this.COLORS.textLight,
          italic: true,
          fontFace: 'Calibri'
        }
      );
    }
  }
}

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { EventStatistics } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface EventReportPDFProps {
  data: EventStatistics;
  clubName: string;
  generatedAt: Date;
  generatedBy: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
    borderBottom: '2 solid #1e40af',
    paddingBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 10,
    borderBottom: '1 solid #cbd5e1',
    paddingBottom: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 15,
    gap: 10,
  },
  statBox: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    border: '1 solid #e2e8f0',
  },
  statLabel: {
    fontSize: 9,
    color: '#64748b',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  table: {
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e2e8f0',
    paddingVertical: 6,
  },
  tableHeader: {
    backgroundColor: '#f1f5f9',
    borderBottom: '2 solid #cbd5e1',
    paddingVertical: 8,
  },
  tableCell: {
    flex: 1,
    fontSize: 9,
  },
  tableCellHeader: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  tableCellCenter: {
    textAlign: 'center',
  },
  tableCellRight: {
    textAlign: 'right',
  },
  monthlyTable: {
    marginTop: 10,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottom: '1 solid #f1f5f9',
  },
  participantRank: {
    width: 30,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3b82f6',
    textAlign: 'center',
  },
  participantName: {
    flex: 1,
    fontSize: 10,
    color: '#1e293b',
  },
  participantCount: {
    width: 80,
    fontSize: 10,
    color: '#64748b',
    textAlign: 'right',
  },
  participantPercentage: {
    width: 60,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#3b82f6',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#94a3b8',
    textAlign: 'center',
    borderTop: '1 solid #e2e8f0',
    paddingTop: 10,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  column: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottom: '1 solid #f1f5f9',
  },
  detailLabel: {
    fontSize: 9,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1e293b',
  },
});

export function EventReportPDF({ data, clubName, generatedAt, generatedBy }: EventReportPDFProps) {
  // Calculer des statistiques supplémentaires
  const eventsWithParticipants = data.events.filter(event => {
    const count = data.registrations.filter(r => r.evenement_id === event.id).length;
    return count > 0;
  }).length;

  const occupancyRate = data.events.length > 0 ? (eventsWithParticipants / data.events.length) * 100 : 0;
  const unpaidRegistrations = data.registrations.filter(r => !r.paye).length;
  const paidRegistrations = data.registrations.filter(r => r.paye).length;

  return (
    <Document>
      {/* Page 1: Résumé et Statistiques */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.title}>Rapport d'Événements</Text>
          <Text style={styles.subtitle}>{clubName}</Text>
          <Text style={styles.subtitle}>{data.period.label}</Text>
          <Text style={styles.subtitle}>
            Du {format(data.period.start_date, 'dd MMMM yyyy', { locale: fr })} au{' '}
            {format(data.period.end_date, 'dd MMMM yyyy', { locale: fr })}
          </Text>
        </View>

        {/* Résumé Exécutif */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Résumé Exécutif</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Événements</Text>
              <Text style={styles.statValue}>{data.total_events}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Inscriptions</Text>
              <Text style={styles.statValue}>{data.total_registrations}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Moyenne/Événement</Text>
              <Text style={styles.statValue}>{data.average_registrations_per_event.toFixed(1)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Taux Paiement</Text>
              <Text style={styles.statValue}>{data.payment_rate.toFixed(0)}%</Text>
            </View>
          </View>
        </View>

        {/* Évolution Mensuelle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Évolution Mensuelle</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 2 }]}>Mois</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, styles.tableCellCenter]}>Événements</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, styles.tableCellCenter]}>Inscriptions</Text>
            </View>
            {data.monthly_data.map((month, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{month.month}</Text>
                <Text style={[styles.tableCell, styles.tableCellCenter]}>{month.event_count}</Text>
                <Text style={[styles.tableCell, styles.tableCellCenter]}>{month.registration_count}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top 10 Participants */}
        {data.top_participants.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 10 des Participants les Plus Actifs</Text>
            {data.top_participants.map((participant, index) => (
              <View key={participant.membre_id} style={styles.participantRow}>
                <Text style={styles.participantRank}>{index + 1}</Text>
                <Text style={styles.participantName}>{participant.membre_nom}</Text>
                <Text style={styles.participantCount}>
                  {participant.registration_count} événement{participant.registration_count > 1 ? 's' : ''}
                </Text>
                <Text style={styles.participantPercentage}>{participant.percentage.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pied de page */}
        <View style={styles.footer}>
          <Text>
            Rapport généré le {format(generatedAt, 'dd MMMM yyyy à HH:mm', { locale: fr })} par {generatedBy}
          </Text>
          <Text>{clubName} - Système de Comptabilité</Text>
        </View>
      </Page>

      {/* Page 2: Détails et Liste des Événements */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.title}>Détails des Événements</Text>
          <Text style={styles.subtitle}>{data.period.label}</Text>
        </View>

        {/* Statistiques Détaillées */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiques Détaillées</Text>
          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total événements</Text>
                <Text style={styles.detailValue}>{data.total_events}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Événements avec participants</Text>
                <Text style={styles.detailValue}>{eventsWithParticipants}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Taux d'occupation</Text>
                <Text style={styles.detailValue}>{occupancyRate.toFixed(1)}%</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total inscriptions</Text>
                <Text style={styles.detailValue}>{data.total_registrations}</Text>
              </View>
            </View>
            <View style={styles.column}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Inscriptions payées</Text>
                <Text style={styles.detailValue}>{paidRegistrations}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>En attente de paiement</Text>
                <Text style={styles.detailValue}>{unpaidRegistrations}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Taux de paiement</Text>
                <Text style={styles.detailValue}>{data.payment_rate.toFixed(1)}%</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Moyenne par événement</Text>
                <Text style={styles.detailValue}>{data.average_registrations_per_event.toFixed(1)} inscrits</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Liste des Événements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Liste des Événements</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.tableCellHeader]}>Date</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 2 }]}>Titre</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, styles.tableCellCenter]}>Statut</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, styles.tableCellCenter]}>Inscrits</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, styles.tableCellCenter]}>Payés</Text>
            </View>
            {data.events.map((event, index) => {
              const eventRegs = data.registrations.filter(r => r.evenement_id === event.id);
              const paidRegs = eventRegs.filter(r => r.paye).length;

              const statusLabels: Record<string, string> = {
                'brouillon': 'Brouillon',
                'ouvert': 'Ouvert',
                'ferme': 'Fermé',
                'annule': 'Annulé'
              };

              return (
                <View key={event.id} style={styles.tableRow}>
                  <Text style={styles.tableCell}>
                    {format(event.date_debut, 'dd/MM/yyyy', { locale: fr })}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{event.titre}</Text>
                  <Text style={[styles.tableCell, styles.tableCellCenter]}>
                    {statusLabels[event.statut] || event.statut}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellCenter]}>{eventRegs.length}</Text>
                  <Text style={[styles.tableCell, styles.tableCellCenter]}>
                    {paidRegs}/{eventRegs.length}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Pied de page */}
        <View style={styles.footer}>
          <Text>Page 2/2</Text>
          <Text>{clubName} - Système de Comptabilité</Text>
        </View>
      </Page>
    </Document>
  );
}

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDFReport } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.5
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottom: '2 solid #ea580c'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ea580c',
    marginBottom: 5
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2
  },
  section: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 4
  },
  eventHeader: {
    backgroundColor: '#ffedd5',
    padding: 12,
    marginBottom: 10,
    borderRadius: 4,
    border: '1 solid #ea580c'
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9a3412',
    marginBottom: 3
  },
  eventInfo: {
    fontSize: 9,
    color: '#6b7280'
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4
  },
  statsLabel: {
    fontSize: 9,
    color: '#374151',
    fontWeight: 'bold'
  },
  statsValue: {
    fontSize: 9,
    color: '#1f2937'
  },
  table: {
    marginBottom: 15
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottom: '1 solid #d1d5db',
    paddingVertical: 8,
    paddingHorizontal: 5,
    fontWeight: 'bold',
    fontSize: 9
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #e5e7eb',
    paddingVertical: 5,
    paddingHorizontal: 5
  },
  tableRowEven: {
    backgroundColor: '#f9fafb'
  },
  col1: {
    width: '40%',
    fontSize: 9
  },
  col2: {
    width: '15%',
    fontSize: 9,
    textAlign: 'center'
  },
  col3: {
    width: '15%',
    fontSize: 9,
    textAlign: 'right'
  },
  col4: {
    width: '15%',
    fontSize: 9,
    textAlign: 'right'
  },
  col5: {
    width: '15%',
    fontSize: 9,
    textAlign: 'right'
  },
  resultBox: {
    padding: 10,
    marginTop: 10,
    borderRadius: 4
  },
  resultPositive: {
    backgroundColor: '#d1fae5',
    border: '1 solid #059669'
  },
  resultNegative: {
    backgroundColor: '#fee2e2',
    border: '1 solid #dc2626'
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  resultValue: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 8,
    borderTop: '1 solid #e5e7eb',
    paddingTop: 10
  }
});

interface Props {
  report: PDFReport;
}

export function ActivityReport({ report }: Props) {
  const { metadata, data } = report;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  // Séparer les événements par pages (max 3 par page pour détail)
  const eventsPerPage = 3;
  const pageCount = Math.ceil(data.events.length / eventsPerPage);

  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    const startIndex = i * eventsPerPage;
    const endIndex = Math.min(startIndex + eventsPerPage, data.events.length);
    pages.push(data.events.slice(startIndex, endIndex));
  }

  return (
    <Document>
      {/* Page de synthèse */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ea580c', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Rapport d'Activités</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.subtitle}>
              Généré le {format(metadata.generated_at, 'dd/MM/yyyy', { locale: fr })}
            </Text>
            <Text style={styles.subtitle}>Par {metadata.generated_by_name}</Text>
          </View>
        </View>

        {/* Vue d'ensemble */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vue d'Ensemble</Text>

          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Nombre d'événements</Text>
            <Text style={styles.statsValue}>{data.events.length}</Text>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Total participants</Text>
            <Text style={styles.statsValue}>
              {data.events.reduce((sum, e) => sum + e.participant_count, 0)}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Revenus total des événements</Text>
            <Text style={[styles.statsValue, { color: '#059669', fontWeight: 'bold' }]}>
              {formatCurrency(data.events.reduce((sum, e) => sum + e.total_revenue, 0))}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Charges total des événements</Text>
            <Text style={[styles.statsValue, { color: '#dc2626', fontWeight: 'bold' }]}>
              {formatCurrency(data.events.reduce((sum, e) => sum + e.total_expense, 0))}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Résultat net global</Text>
            <Text style={[
              styles.statsValue,
              {
                color: data.events.reduce((sum, e) => sum + e.net_result, 0) >= 0 ? '#059669' : '#dc2626',
                fontWeight: 'bold'
              }
            ]}>
              {formatCurrency(data.events.reduce((sum, e) => sum + e.net_result, 0))}
            </Text>
          </View>
        </View>

        {/* Classement des événements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Classement par Rentabilité</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Événement</Text>
              <Text style={styles.col2}>Participants</Text>
              <Text style={styles.col3}>Revenus</Text>
              <Text style={styles.col4}>Charges</Text>
              <Text style={styles.col5}>Résultat</Text>
            </View>

            {data.events.map((event, index) => (
              <View key={event.evenement_id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                <Text style={styles.col1}>
                  {event.titre.substring(0, 30)}{event.titre.length > 30 ? '...' : ''}
                </Text>
                <Text style={styles.col2}>{event.participant_count}</Text>
                <Text style={styles.col3}>{formatCurrency(event.total_revenue)}</Text>
                <Text style={styles.col4}>{formatCurrency(event.total_expense)}</Text>
                <Text style={[
                  styles.col5,
                  { color: event.net_result >= 0 ? '#059669' : '#dc2626', fontWeight: 'bold' }
                ]}>
                  {formatCurrency(event.net_result)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Rapport d'Activités - Page 1/{pages.length + 1}</Text>
        </View>
      </Page>

      {/* Pages détaillées par événement */}
      {pages.map((pageEvents, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
          {/* En-tête */}
          <View style={styles.header}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ea580c', marginBottom: 8 }}>
                {metadata.club_name || 'Calypso Diving Club'}
              </Text>
              <Text style={styles.title}>Détail des Événements</Text>
              <Text style={styles.subtitle}>{data.period.label}</Text>
            </View>
          </View>

          {pageEvents.map((event) => (
            <View key={event.evenement_id} style={styles.section}>
              {/* En-tête événement */}
              <View style={styles.eventHeader}>
                <Text style={styles.eventTitle}>{event.titre}</Text>
                <Text style={styles.eventInfo}>
                  {format(event.date_debut, 'dd/MM/yyyy', { locale: fr })}
                  {event.date_fin.getTime() !== event.date_debut.getTime() &&
                    ` - ${format(event.date_fin, 'dd/MM/yyyy', { locale: fr })}`
                  }
                </Text>
              </View>

              {/* Statistiques */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 8, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>Participants</Text>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1f2937' }}>
                    {event.participant_count}
                  </Text>
                </View>

                <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 8, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>Revenu/Participant</Text>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1f2937' }}>
                    {formatCurrency(event.revenue_per_participant)}
                  </Text>
                </View>

                <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 8, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>Transactions</Text>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1f2937' }}>
                    {event.transactions.length}
                  </Text>
                </View>
              </View>

              {/* Résultat */}
              <View style={[
                styles.resultBox,
                event.net_result >= 0 ? styles.resultPositive : styles.resultNegative
              ]}>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Revenus</Text>
                  <Text style={[styles.resultValue, { color: '#059669' }]}>
                    {formatCurrency(event.total_revenue)}
                  </Text>
                </View>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Charges</Text>
                  <Text style={[styles.resultValue, { color: '#dc2626' }]}>
                    {formatCurrency(event.total_expense)}
                  </Text>
                </View>
                <View style={[styles.resultRow, { marginTop: 5, paddingTop: 5, borderTop: '1 solid #d1d5db' }]}>
                  <Text style={styles.resultLabel}>RÉSULTAT NET</Text>
                  <Text style={[
                    styles.resultValue,
                    { color: event.net_result >= 0 ? '#059669' : '#dc2626' }
                  ]}>
                    {formatCurrency(event.net_result)}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {/* Footer */}
          <View style={styles.footer}>
            <Text>Rapport d'Activités - Page {pageIndex + 2}/{pages.length + 1}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

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
    borderBottom: '2 solid #4f46e5'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4f46e5',
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
  balanceBox: {
    backgroundColor: '#eef2ff',
    border: '2 solid #4f46e5',
    borderRadius: 6,
    padding: 15,
    marginBottom: 15
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  balanceLabel: {
    fontSize: 11,
    color: '#374151',
    fontWeight: 'bold'
  },
  balanceValue: {
    fontSize: 11,
    color: '#1f2937',
    fontWeight: 'bold'
  },
  divider: {
    borderBottom: '1 solid #d1d5db',
    marginVertical: 8
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
    paddingVertical: 6,
    paddingHorizontal: 5
  },
  tableRowEven: {
    backgroundColor: '#f9fafb'
  },
  col1: {
    width: '20%',
    fontSize: 9
  },
  col2: {
    width: '20%',
    fontSize: 9,
    textAlign: 'right'
  },
  col3: {
    width: '20%',
    fontSize: 9,
    textAlign: 'right'
  },
  col4: {
    width: '20%',
    fontSize: 9,
    textAlign: 'right'
  },
  col5: {
    width: '20%',
    fontSize: 9,
    textAlign: 'right'
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '1 solid #f59e0b',
    borderRadius: 6,
    padding: 12,
    marginTop: 15
  },
  warningTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 5
  },
  warningText: {
    fontSize: 9,
    color: '#92400e',
    marginBottom: 3
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

export function TreasuryReport({ report }: Props) {
  const { metadata, data } = report;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4f46e5', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Rapport de Trésorerie</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.subtitle}>
              Généré le {format(metadata.generated_at, 'dd/MM/yyyy', { locale: fr })}
            </Text>
            <Text style={styles.subtitle}>Par {metadata.generated_by_name}</Text>
          </View>
        </View>

        {/* Soldes de trésorerie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Position de Trésorerie</Text>
          <View style={styles.balanceBox}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Solde de début</Text>
              <Text style={styles.balanceValue}>{formatCurrency(data.opening_balance)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Encaissements (Rentrées)</Text>
              <Text style={[styles.balanceValue, { color: '#059669' }]}>
                + {formatCurrency(data.total_revenue)}
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Décaissements (Sorties)</Text>
              <Text style={[styles.balanceValue, { color: '#dc2626' }]}>
                - {formatCurrency(data.total_expense)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Variation de trésorerie</Text>
              <Text style={[
                styles.balanceValue,
                { color: data.net_result >= 0 ? '#059669' : '#dc2626' }
              ]}>
                {data.net_result >= 0 ? '+' : ''}{formatCurrency(data.net_result)}
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { fontSize: 13 }]}>Solde de fin</Text>
              <Text style={[styles.balanceValue, { fontSize: 13, color: '#4f46e5' }]}>
                {formatCurrency(data.closing_balance)}
              </Text>
            </View>
          </View>
        </View>

        {/* Évolution mensuelle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Évolution Mensuelle de Trésorerie</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Mois</Text>
              <Text style={styles.col2}>Encaissements</Text>
              <Text style={styles.col3}>Décaissements</Text>
              <Text style={styles.col4}>Flux Net</Text>
              <Text style={styles.col5}>Cumul</Text>
            </View>

            {data.monthly_evolution.map((month, index) => (
              <View key={month.month} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                <Text style={styles.col1}>{month.month}</Text>
                <Text style={[styles.col2, { color: '#059669' }]}>
                  {formatCurrency(month.revenue)}
                </Text>
                <Text style={[styles.col3, { color: '#dc2626' }]}>
                  {formatCurrency(month.expense)}
                </Text>
                <Text style={[
                  styles.col4,
                  { color: month.net >= 0 ? '#059669' : '#dc2626', fontWeight: 'bold' }
                ]}>
                  {formatCurrency(month.net)}
                </Text>
                <Text style={[
                  styles.col5,
                  { color: month.cumulative_net >= 0 ? '#059669' : '#dc2626' }
                ]}>
                  {formatCurrency(month.cumulative_net)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Analyse */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Analyse de Trésorerie</Text>

          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 9, color: '#374151' }}>Mois le plus rentable:</Text>
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#059669' }}>
                {data.monthly_evolution.reduce((best, month) =>
                  month.net > best.net ? month : best
                ).month}
                {' '}
                ({formatCurrency(data.monthly_evolution.reduce((best, month) =>
                  month.net > best.net ? month : best
                ).net)})
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 9, color: '#374151' }}>Mois le moins rentable:</Text>
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#dc2626' }}>
                {data.monthly_evolution.reduce((worst, month) =>
                  month.net < worst.net ? month : worst
                ).month}
                {' '}
                ({formatCurrency(data.monthly_evolution.reduce((worst, month) =>
                  month.net < worst.net ? month : worst
                ).net)})
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 9, color: '#374151' }}>Flux net moyen mensuel:</Text>
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#4f46e5' }}>
                {formatCurrency(
                  data.monthly_evolution.reduce((sum, m) => sum + m.net, 0) / data.monthly_evolution.length
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Rapport de Trésorerie - Page 1/2</Text>
        </View>
      </Page>

      {/* Page 2: Alertes et détails */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4f46e5', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Rapport de Trésorerie - Alertes</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
        </View>

        {/* Transactions non réconciliées */}
        {data.unreconciled_transactions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Transactions Non Réconciliées</Text>

            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>
                {data.unreconciled_transactions.length} transaction(s) non réconciliée(s)
              </Text>
              <Text style={styles.warningText}>
                Ces transactions n'ont pas été rattachées à un événement ou à une demande de remboursement.
              </Text>
              <Text style={styles.warningText}>
                Impact sur la trésorerie: {formatCurrency(
                  data.unreconciled_transactions.reduce((sum, t) => sum + t.montant, 0)
                )}
              </Text>
            </View>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ width: '15%', fontSize: 9 }}>Date</Text>
                <Text style={{ width: '45%', fontSize: 9 }}>Description</Text>
                <Text style={{ width: '20%', fontSize: 9, textAlign: 'right' }}>Montant</Text>
                <Text style={{ width: '20%', fontSize: 9 }}>Catégorie</Text>
              </View>

              {data.unreconciled_transactions.slice(0, 10).map((trans, index) => (
                <View key={trans.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                  <Text style={{ width: '15%', fontSize: 8 }}>
                    {format(trans.date_execution, 'dd/MM/yy', { locale: fr })}
                  </Text>
                  <Text style={{ width: '45%', fontSize: 8 }}>
                    {trans.contrepartie_nom.substring(0, 35)}
                  </Text>
                  <Text style={{
                    width: '20%',
                    fontSize: 8,
                    textAlign: 'right',
                    color: trans.montant >= 0 ? '#059669' : '#dc2626'
                  }}>
                    {formatCurrency(trans.montant)}
                  </Text>
                  <Text style={{ width: '20%', fontSize: 8 }}>
                    {trans.categorie || 'Non défini'}
                  </Text>
                </View>
              ))}
            </View>

            {data.unreconciled_transactions.length > 10 && (
              <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 5 }}>
                ... et {data.unreconciled_transactions.length - 10} autre(s) transaction(s)
              </Text>
            )}
          </View>
        )}

        {/* Demandes de remboursement en attente */}
        {data.pending_expense_claims.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Demandes de Remboursement en Attente</Text>

            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>
                {data.pending_expense_claims.length} demande(s) en attente
              </Text>
              <Text style={styles.warningText}>
                Ces demandes doivent être approuvées et remboursées, ce qui impactera la trésorerie future.
              </Text>
              <Text style={styles.warningText}>
                Montant total: {formatCurrency(
                  data.pending_expense_claims.reduce((sum, d) => sum + d.montant, 0)
                )}
              </Text>
            </View>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ width: '15%', fontSize: 9 }}>Date</Text>
                <Text style={{ width: '35%', fontSize: 9 }}>Demandeur</Text>
                <Text style={{ width: '30%', fontSize: 9 }}>Description</Text>
                <Text style={{ width: '20%', fontSize: 9, textAlign: 'right' }}>Montant</Text>
              </View>

              {data.pending_expense_claims.slice(0, 10).map((demand, index) => (
                <View key={demand.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                  <Text style={{ width: '15%', fontSize: 8 }}>
                    {format(demand.date_depense || demand.date_demande, 'dd/MM/yy', { locale: fr })}
                  </Text>
                  <Text style={{ width: '35%', fontSize: 8 }}>
                    {demand.demandeur_nom || 'Inconnu'}
                  </Text>
                  <Text style={{ width: '30%', fontSize: 8 }}>
                    {demand.description.substring(0, 25)}{demand.description.length > 25 ? '...' : ''}
                  </Text>
                  <Text style={{ width: '20%', fontSize: 8, textAlign: 'right', color: '#dc2626' }}>
                    {formatCurrency(demand.montant)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Indicateurs de santé */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicateurs de Santé Financière</Text>

          <View style={{ backgroundColor: '#f9fafb', padding: 10, borderRadius: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 9, color: '#374151' }}>Taux de réconciliation:</Text>
              <Text style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: data.reconciliation_rate >= 80 ? '#059669' : data.reconciliation_rate >= 60 ? '#f59e0b' : '#dc2626'
              }}>
                {data.reconciliation_rate.toFixed(1)}%
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 9, color: '#374151' }}>Nombre total de transactions:</Text>
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1f2937' }}>
                {data.transaction_count}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 9, color: '#374151' }}>Solde de trésorerie final:</Text>
              <Text style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: data.closing_balance >= 0 ? '#059669' : '#dc2626'
              }}>
                {formatCurrency(data.closing_balance)}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Rapport de Trésorerie - Page 2/2</Text>
        </View>
      </Page>
    </Document>
  );
}

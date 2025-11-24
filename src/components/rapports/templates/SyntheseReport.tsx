import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { PDFReport } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Styles pour le PDF
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
    borderBottom: '2 solid #1e40af'
  },
  logo: {
    width: 120,
    height: 40,
    objectFit: 'contain'
  },
  headerText: {
    textAlign: 'right'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
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
  summaryBox: {
    backgroundColor: '#eff6ff',
    border: '1 solid #3b82f6',
    borderRadius: 6,
    padding: 15,
    marginBottom: 15
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  summaryLabel: {
    fontSize: 11,
    color: '#374151',
    fontWeight: 'bold'
  },
  summaryValue: {
    fontSize: 11,
    color: '#1f2937',
    fontWeight: 'bold'
  },
  summaryValuePositive: {
    color: '#059669'
  },
  summaryValueNegative: {
    color: '#dc2626'
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
    fontWeight: 'bold'
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
    width: '50%',
    fontSize: 9
  },
  col2: {
    width: '15%',
    fontSize: 9,
    textAlign: 'center'
  },
  col3: {
    width: '20%',
    fontSize: 9,
    textAlign: 'right'
  },
  col4: {
    width: '15%',
    fontSize: 9,
    textAlign: 'right'
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
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '1 solid #f59e0b',
    borderRadius: 6,
    padding: 10,
    marginTop: 15
  },
  warningText: {
    fontSize: 9,
    color: '#92400e'
  }
});

interface Props {
  report: PDFReport;
  logoUrl?: string;
}

export function SyntheseReport({ report, logoUrl }: Props) {
  const { metadata, data } = report;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatPercent = (percent: number): string => {
    return `${percent.toFixed(1)}%`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            {logoUrl && (
              <Image
                src={logoUrl}
                style={styles.logo}
              />
            )}
            <View>
              <Text style={styles.title}>Synthèse Financière</Text>
              <Text style={styles.subtitle}>{data.period.label}</Text>
            </View>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.subtitle}>
              Généré le {format(metadata.generated_at, 'dd/MM/yyyy à HH:mm', { locale: fr })}
            </Text>
            <Text style={styles.subtitle}>Par {metadata.generated_by_name}</Text>
          </View>
        </View>

        {/* Résumé financier */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Résumé Financier</Text>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Solde de début</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.opening_balance)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Produits (Revenus)</Text>
              <Text style={[styles.summaryValue, styles.summaryValuePositive]}>
                {formatCurrency(data.total_revenue)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Charges (Dépenses)</Text>
              <Text style={[styles.summaryValue, styles.summaryValueNegative]}>
                {formatCurrency(data.total_expense)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Résultat Net</Text>
              <Text style={[
                styles.summaryValue,
                data.net_result >= 0 ? styles.summaryValuePositive : styles.summaryValueNegative
              ]}>
                {formatCurrency(data.net_result)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Solde de fin</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.closing_balance)}</Text>
            </View>
          </View>
        </View>

        {/* Produits par catégorie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Produits par Catégorie</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Catégorie</Text>
              <Text style={styles.col2}>Nb Trans.</Text>
              <Text style={styles.col3}>Montant</Text>
              <Text style={styles.col4}>%</Text>
            </View>
            {data.revenue_by_category.slice(0, 10).map((cat, index) => (
              <View key={cat.categorie} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                <Text style={styles.col1}>{cat.categorie_label}</Text>
                <Text style={styles.col2}>{cat.transaction_count}</Text>
                <Text style={styles.col3}>{formatCurrency(cat.total)}</Text>
                <Text style={styles.col4}>{formatPercent(cat.percentage)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Charges par catégorie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Charges par Catégorie</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Catégorie</Text>
              <Text style={styles.col2}>Nb Trans.</Text>
              <Text style={styles.col3}>Montant</Text>
              <Text style={styles.col4}>%</Text>
            </View>
            {data.expense_by_category.slice(0, 10).map((cat, index) => (
              <View key={cat.categorie} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                <Text style={styles.col1}>{cat.categorie_label}</Text>
                <Text style={styles.col2}>{cat.transaction_count}</Text>
                <Text style={styles.col3}>{formatCurrency(cat.total)}</Text>
                <Text style={styles.col4}>{formatPercent(cat.percentage)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Rapport généré par CalyCompta - Page 1/{data.events.length > 0 ? '2' : '1'}
          </Text>
        </View>
      </Page>

      {/* Page 2: Événements (si présents) */}
      {data.events.length > 0 && (
        <Page size="A4" style={styles.page}>
          {/* En-tête */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
              {logoUrl && (
                <Image
                  src={logoUrl}
                  style={styles.logo}
                />
              )}
              <View>
                <Text style={styles.title}>Synthèse Financière - Événements</Text>
                <Text style={styles.subtitle}>{data.period.label}</Text>
              </View>
            </View>
          </View>

          {/* Top 5 événements les plus rentables */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 5 Événements - Rentabilité</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Événement</Text>
                <Text style={styles.col2}>Participants</Text>
                <Text style={styles.col3}>Revenus</Text>
                <Text style={styles.col4}>Résultat</Text>
              </View>
              {data.events.slice(0, 5).map((event, index) => (
                <View key={event.evenement_id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                  <Text style={styles.col1}>
                    {event.titre} ({format(event.date_debut, 'dd/MM/yyyy', { locale: fr })})
                  </Text>
                  <Text style={styles.col2}>{event.participant_count}</Text>
                  <Text style={styles.col3}>{formatCurrency(event.total_revenue)}</Text>
                  <Text style={[
                    styles.col4,
                    event.net_result >= 0 ? { color: '#059669' } : { color: '#dc2626' }
                  ]}>
                    {formatCurrency(event.net_result)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Alertes */}
          {(data.unreconciled_transactions.length > 0 || data.pending_expense_claims.length > 0) && (
            <View style={styles.warningBox}>
              <Text style={[styles.warningText, { fontWeight: 'bold', marginBottom: 5 }]}>
                ⚠️ Points d'attention
              </Text>
              {data.unreconciled_transactions.length > 0 && (
                <Text style={styles.warningText}>
                  • {data.unreconciled_transactions.length} transaction(s) non réconciliée(s)
                </Text>
              )}
              {data.pending_expense_claims.length > 0 && (
                <Text style={styles.warningText}>
                  • {data.pending_expense_claims.length} demande(s) de remboursement en attente
                </Text>
              )}
              <Text style={[styles.warningText, { marginTop: 5 }]}>
                Taux de réconciliation: {formatPercent(data.reconciliation_rate)}
              </Text>
            </View>
          )}

          {/* Statistiques générales */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistiques</Text>
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Nombre total de transactions</Text>
                <Text style={styles.summaryValue}>{data.transaction_count}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Transactions réconciliées</Text>
                <Text style={styles.summaryValue}>
                  {Math.round((data.transaction_count * data.reconciliation_rate) / 100)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Nombre d'événements</Text>
                <Text style={styles.summaryValue}>{data.events.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total participants</Text>
                <Text style={styles.summaryValue}>
                  {data.events.reduce((sum, e) => sum + e.participant_count, 0)}
                </Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text>
              Rapport généré par CalyCompta - Page 2/2
            </Text>
          </View>
        </Page>
      )}
    </Document>
  );
}

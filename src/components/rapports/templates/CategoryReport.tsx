import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDFReport } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Styles similaires à SyntheseReport
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
    borderBottom: '2 solid #059669'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 5
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2
  },
  section: {
    marginBottom: 25
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
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ecfdf5',
    padding: 10,
    marginBottom: 8,
    borderRadius: 4
  },
  categoryName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#065f46'
  },
  categoryTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#065f46'
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
    paddingVertical: 5,
    paddingHorizontal: 5
  },
  tableRowEven: {
    backgroundColor: '#f9fafb'
  },
  col1: {
    width: '15%',
    fontSize: 9
  },
  col2: {
    width: '45%',
    fontSize: 9
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
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#d1fae5',
    paddingVertical: 8,
    paddingHorizontal: 5,
    marginTop: 5,
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

export function CategoryReport({ report }: Props) {
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
      {/* Page 1: Rentrées par catégorie */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#059669', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Rapport par Catégorie</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.subtitle}>
              Généré le {format(metadata.generated_at, 'dd/MM/yyyy', { locale: fr })}
            </Text>
            <Text style={styles.subtitle}>Par {metadata.generated_by_name}</Text>
          </View>
        </View>

        {/* Section Rentrées */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Rentrées</Text>

          {data.revenue_by_category.map((category) => (
            <View key={`revenue-${category.categorie}`} style={{ marginBottom: 15 }}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName}>{category.categorie_label}</Text>
                <Text style={styles.categoryTotal}>
                  {formatCurrency(category.total)} ({formatPercent(category.percentage)})
                </Text>
              </View>
              <Text style={{ fontSize: 9, color: '#6b7280', marginBottom: 5, paddingLeft: 10 }}>
                {category.transaction_count} transaction(s)
              </Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={{ ...styles.col2, fontWeight: 'bold' }}>TOTAL PRODUITS</Text>
            <Text style={{ ...styles.col3, fontWeight: 'bold' }}></Text>
            <Text style={{ ...styles.col4, fontWeight: 'bold', color: '#059669' }}>
              {formatCurrency(data.total_revenue)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Rapport par Catégorie - Page 1/2</Text>
        </View>
      </Page>

      {/* Page 2: Sorties par catégorie */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#059669', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Rapport par Catégorie - Sorties</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
        </View>

        {/* Section Sorties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💸 Sorties</Text>

          {data.expense_by_category.map((category) => (
            <View key={`expense-${category.categorie}`} style={{ marginBottom: 15 }}>
              <View style={[styles.categoryHeader, { backgroundColor: '#fef2f2' }]}>
                <Text style={[styles.categoryName, { color: '#991b1b' }]}>
                  {category.categorie_label}
                </Text>
                <Text style={[styles.categoryTotal, { color: '#991b1b' }]}>
                  {formatCurrency(category.total)} ({formatPercent(category.percentage)})
                </Text>
              </View>
              <Text style={{ fontSize: 9, color: '#6b7280', marginBottom: 5, paddingLeft: 10 }}>
                {category.transaction_count} transaction(s)
              </Text>
            </View>
          ))}

          <View style={[styles.totalRow, { backgroundColor: '#fee2e2' }]}>
            <Text style={{ ...styles.col2, fontWeight: 'bold' }}>TOTAL CHARGES</Text>
            <Text style={{ ...styles.col3, fontWeight: 'bold' }}></Text>
            <Text style={{ ...styles.col4, fontWeight: 'bold', color: '#dc2626' }}>
              {formatCurrency(data.total_expense)}
            </Text>
          </View>
        </View>

        {/* Résultat net */}
        <View style={[styles.section, { marginTop: 20 }]}>
          <View style={{
            backgroundColor: data.net_result >= 0 ? '#ecfdf5' : '#fef2f2',
            padding: 15,
            borderRadius: 6,
            border: `2 solid ${data.net_result >= 0 ? '#059669' : '#dc2626'}`
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1f2937' }}>
                RÉSULTAT NET
              </Text>
              <Text style={{
                fontSize: 14,
                fontWeight: 'bold',
                color: data.net_result >= 0 ? '#059669' : '#dc2626'
              }}>
                {formatCurrency(data.net_result)}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Rapport par Catégorie - Page 2/2</Text>
        </View>
      </Page>
    </Document>
  );
}

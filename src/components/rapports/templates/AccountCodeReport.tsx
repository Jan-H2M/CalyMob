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
    borderBottom: '2 solid #7c3aed'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#7c3aed',
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
  classHeader: {
    backgroundColor: '#ede9fe',
    padding: 12,
    marginBottom: 10,
    borderRadius: 4,
    border: '1 solid #7c3aed'
  },
  className: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#5b21b6'
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
    width: '45%',
    fontSize: 9
  },
  col3: {
    width: '15%',
    fontSize: 9,
    textAlign: 'center'
  },
  col4: {
    width: '20%',
    fontSize: 9,
    textAlign: 'right'
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#ddd6fe',
    paddingVertical: 8,
    paddingHorizontal: 5,
    marginTop: 5,
    fontWeight: 'bold',
    border: '1 solid #7c3aed'
  },
  grandTotalRow: {
    flexDirection: 'row',
    backgroundColor: '#5b21b6',
    paddingVertical: 10,
    paddingHorizontal: 5,
    marginTop: 15,
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
  },
  noteBox: {
    backgroundColor: '#fef3c7',
    padding: 10,
    marginTop: 15,
    borderRadius: 4,
    border: '1 solid #f59e0b'
  },
  noteText: {
    fontSize: 8,
    color: '#92400e'
  }
});

interface Props {
  report: PDFReport;
}

export function AccountCodeReport({ report }: Props) {
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
      {/* Page 1: Classe 7 - Produits */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#7c3aed', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Plan Comptable Belge ASBL</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.subtitle}>
              Généré le {format(metadata.generated_at, 'dd/MM/yyyy', { locale: fr })}
            </Text>
            <Text style={styles.subtitle}>Par {metadata.generated_by_name}</Text>
          </View>
        </View>

        {/* Classe 7 - Produits */}
        <View style={styles.section}>
          <View style={styles.classHeader}>
            <Text style={styles.className}>CLASSE 7 - PRODUITS</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Code</Text>
              <Text style={styles.col2}>Libellé</Text>
              <Text style={styles.col3}>Nb Trans.</Text>
              <Text style={styles.col4}>Montant</Text>
            </View>

            {data.revenue_by_account.map((account, index) => (
              <View key={account.code} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                <Text style={styles.col1}>{account.code}</Text>
                <Text style={styles.col2}>{account.label}</Text>
                <Text style={styles.col3}>{account.transaction_count}</Text>
                <Text style={styles.col4}>{formatCurrency(account.total)}</Text>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={{ ...styles.col1, fontWeight: 'bold' }}></Text>
              <Text style={{ ...styles.col2, fontWeight: 'bold' }}>TOTAL CLASSE 7</Text>
              <Text style={{ ...styles.col3, fontWeight: 'bold' }}>
                {data.revenue_by_account.reduce((sum, a) => sum + a.transaction_count, 0)}
              </Text>
              <Text style={{ ...styles.col4, fontWeight: 'bold', color: '#059669' }}>
                {formatCurrency(data.total_revenue)}
              </Text>
            </View>
          </View>

          {/* Note explicative */}
          <View style={styles.noteBox}>
            <Text style={[styles.noteText, { fontWeight: 'bold', marginBottom: 3 }]}>
              📝 Note comptable
            </Text>
            <Text style={styles.noteText}>
              La classe 7 du plan comptable belge regroupe les produits (revenus) de l'ASBL:
              cotisations membres, ventes de marchandises, prestations de services, subsides, dons, etc.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Plan Comptable Belge ASBL - Page 1/2</Text>
        </View>
      </Page>

      {/* Page 2: Classe 6 - Charges */}
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#7c3aed', marginBottom: 8 }}>
              {metadata.club_name || 'Calypso Diving Club'}
            </Text>
            <Text style={styles.title}>Plan Comptable Belge ASBL - Charges</Text>
            <Text style={styles.subtitle}>{data.period.label}</Text>
          </View>
        </View>

        {/* Classe 6 - Charges */}
        <View style={styles.section}>
          <View style={[styles.classHeader, { backgroundColor: '#fee2e2', borderColor: '#dc2626' }]}>
            <Text style={[styles.className, { color: '#991b1b' }]}>CLASSE 6 - CHARGES</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Code</Text>
              <Text style={styles.col2}>Libellé</Text>
              <Text style={styles.col3}>Nb Trans.</Text>
              <Text style={styles.col4}>Montant</Text>
            </View>

            {data.expense_by_account.map((account, index) => (
              <View key={account.code} style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}>
                <Text style={styles.col1}>{account.code}</Text>
                <Text style={styles.col2}>{account.label}</Text>
                <Text style={styles.col3}>{account.transaction_count}</Text>
                <Text style={styles.col4}>{formatCurrency(account.total)}</Text>
              </View>
            ))}

            <View style={[styles.totalRow, { backgroundColor: '#fee2e2', borderColor: '#dc2626' }]}>
              <Text style={{ ...styles.col1, fontWeight: 'bold' }}></Text>
              <Text style={{ ...styles.col2, fontWeight: 'bold' }}>TOTAL CLASSE 6</Text>
              <Text style={{ ...styles.col3, fontWeight: 'bold' }}>
                {data.expense_by_account.reduce((sum, a) => sum + a.transaction_count, 0)}
              </Text>
              <Text style={{ ...styles.col4, fontWeight: 'bold', color: '#dc2626' }}>
                {formatCurrency(data.total_expense)}
              </Text>
            </View>
          </View>

          {/* Note explicative */}
          <View style={styles.noteBox}>
            <Text style={[styles.noteText, { fontWeight: 'bold', marginBottom: 3 }]}>
              📝 Note comptable
            </Text>
            <Text style={styles.noteText}>
              La classe 6 du plan comptable belge regroupe les charges (dépenses) de l'ASBL:
              achats, services, rémunérations, amortissements, charges financières, etc.
            </Text>
          </View>
        </View>

        {/* Résultat analytique */}
        <View style={styles.section}>
          <View style={styles.classHeader}>
            <Text style={styles.className}>RÉSULTAT ANALYTIQUE</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.col2}>Produits (Classe 7)</Text>
              <Text style={styles.col3}></Text>
              <Text style={[styles.col4, { color: '#059669', fontWeight: 'bold' }]}>
                {formatCurrency(data.total_revenue)}
              </Text>
            </View>
            <View style={[styles.tableRow, { backgroundColor: '#f9fafb' }]}>
              <Text style={styles.col2}>Charges (Classe 6)</Text>
              <Text style={styles.col3}></Text>
              <Text style={[styles.col4, { color: '#dc2626', fontWeight: 'bold' }]}>
                {formatCurrency(data.total_expense)}
              </Text>
            </View>

            <View style={styles.grandTotalRow}>
              <Text style={{ ...styles.col2, fontWeight: 'bold', color: '#ffffff' }}>
                RÉSULTAT NET (Classe 7 - Classe 6)
              </Text>
              <Text style={{ ...styles.col3, fontWeight: 'bold', color: '#ffffff' }}></Text>
              <Text style={{ ...styles.col4, fontWeight: 'bold', color: '#ffffff' }}>
                {formatCurrency(data.net_result)}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Plan Comptable Belge ASBL - Page 2/2 - Conforme aux normes comptables belges</Text>
        </View>
      </Page>
    </Document>
  );
}

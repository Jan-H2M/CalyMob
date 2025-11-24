/**
 * Claude Report Prompts
 *
 * Prompt templates for generating Excel, PowerPoint, and PDF reports with Claude.
 * These prompts are engineered to produce high-quality, professional documents
 * with working formulas, charts, and Belgian accounting standards.
 */

import { FinancialSummary } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Format number as Belgian currency (€1.234,56)
 */
function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}

/**
 * Format date as DD/MM/YYYY
 */
function formatDate(date: Date): string {
  return format(date, 'dd/MM/yyyy', { locale: fr });
}

/**
 * Build Excel prompt for Annual Report
 */
export function buildExcelAnnualReportPrompt(data: FinancialSummary, clubName: string = 'Calypso Diving Club'): string {
  const fiscalYear = data.period.fiscal_year;
  const periodLabel = data.period.label;

  // Top revenue categories
  const topRevenues = data.revenue_by_category.slice(0, 5);
  const topExpenses = data.expense_by_category.slice(0, 10);

  // Monthly evolution summary
  const monthlyData = data.monthly_evolution
    .map(m => `  ${m.month}: Revenus ${formatEuro(m.revenue)}, Dépenses ${formatEuro(m.expense)}, Net ${formatEuro(m.net)}`)
    .join('\n');

  // Events summary
  const eventsData = data.events
    .slice(0, 10)
    .map(e => `  ${e.titre} (${formatDate(e.date_debut)}): ${e.participant_count} participants, ${formatEuro(e.net_result)} net`)
    .join('\n');

  return `Crée un fichier Excel professionnel pour le rapport financier annuel ${fiscalYear} du ${clubName} (Belgique).

DONNÉES FINANCIÈRES GLOBALES:
- Période: ${periodLabel}
- Solde d'ouverture: ${formatEuro(data.opening_balance)}
- Revenus totaux: ${formatEuro(data.total_revenue)} (${data.revenue_by_category.length} catégories, ${data.transaction_count} transactions)
- Dépenses totales: ${formatEuro(data.total_expense)} (${data.expense_by_category.length} catégories)
- Résultat net: ${formatEuro(data.net_result)}
- Solde de clôture: ${formatEuro(data.closing_balance)}
- Taux de réconciliation: ${data.reconciliation_rate.toFixed(1)}%

TOP CATÉGORIES REVENUS:
${topRevenues.map(c => `- ${c.categorie}: ${formatEuro(c.total)} (${c.percentage.toFixed(1)}%)`).join('\n')}

TOP CATÉGORIES DÉPENSES:
${topExpenses.map(c => `- ${c.categorie}: ${formatEuro(c.total)} (${c.percentage.toFixed(1)}%)`).join('\n')}

ÉVOLUTION MENSUELLE:
${monthlyData}

ÉVÉNEMENTS (${data.events.length} total):
${eventsData}

FEUILLES EXCEL REQUISES (8 tabs):

1. "📊 Dashboard"
   - Titre: "Rapport Financier ${fiscalYear} - ${clubName}"
   - 4 KPIs en grande taille et couleur:
     • Revenus: ${formatEuro(data.total_revenue)} (vert)
     • Dépenses: ${formatEuro(data.total_expense)} (rouge)
     • Résultat Net: ${formatEuro(data.net_result)} (bleu si positif, rouge si négatif)
     • Taux Réconciliation: ${data.reconciliation_rate.toFixed(1)}% (vert si >90%, orange si 70-90%, rouge si <70%)
   - Graph: Line chart évolution mensuelle (revenus vs dépenses)
   - Graph: Horizontal bar chart top 5 revenus
   - Graph: Horizontal bar chart top 5 dépenses

2. "💰 Revenus Détaillés"
   - Table complète: Catégorie | Montant | % du Total | Nb Transactions
   - Tri: Par montant décroissant
   - Total en bas (formule SUM)
   - Graph: Pie chart répartition par catégorie (top 7 + "Autres")
   - Sous-section: Top 10 transactions revenus individuelles

3. "💸 Dépenses Détaillées"
   - Table complète: Catégorie | Montant | % du Total | Nb Transactions
   - Tri: Par montant décroissant
   - Total en bas (formule SUM)
   - Conditional formatting: Rouge si montant > moyenne + 20%
   - Graph: Bar chart vertical top 10 dépenses
   - Sous-section: Top 10 transactions dépenses individuelles

4. "📅 Évolution Mensuelle"
   - Table: Mois | Revenus | Dépenses | Net | Cumulatif Net
   - Toutes les colonnes avec formules (SUM, calculs)
   - Graph: Line chart avec 3 lignes (revenus bleu, dépenses rouge, net vert/rouge)
   - Sparklines dans chaque cellule (si supporté par Excel)

5. "🎯 Événements"
   - Table: Événement | Date | Participants | Revenus | Dépenses | Net | € par Participant
   - Tri: Par rentabilité (net) décroissant
   - Conditional formatting:
     • Vert si net > 0
     • Rouge si net < 0
   - Formule: € par participant = Revenus / Participants
   - Totaux en bas

6. "💼 Codes Comptables"
   - Table: Code | Libellé | Montant Revenus | Montant Dépenses | Total
   - Conforme au plan comptable belge ASBL
   - Groupé par classe (7xx = revenus, 6xx = dépenses)
   - Formules pour totaux par classe

7. "📈 Cash Flow"
   - Structure: Solde initial → Entrées → Sorties → Solde final
   - Table mensuelle avec solde progressif
   - Formules: Solde fin = Solde début + Revenus - Dépenses
   - Graph: Waterfall chart (si supporté)
   - Highlight: Mois avec solde le plus bas (rouge)

8. "📝 Documentation"
   - Section "Méthodologie":
     • Comment les revenus sont calculés
     • Comment les dépenses sont calculées
     • Définition du taux de réconciliation
   - Section "Formules utilisées":
     • Liste des formules Excel utilisées avec explications
   - Section "Notes importantes":
     • ${data.unreconciled_transactions.length} transactions non réconciliées
     • ${data.pending_expense_claims.length} demandes de remboursement en attente
   - Section "Période couverte": ${periodLabel}

FORMULES EXCEL (OBLIGATOIRES):
- SUM() pour tous les totaux (pas de valeurs hard-codées!)
- AVERAGE() pour moyennes
- COUNTIF() pour compter par catégorie
- IF() pour conditional logic (ex: couleur basée sur valeur)
- Formules relatives (pas absolues) pour pouvoir copier

STYLE PROFESSIONNEL:
- Couleurs: Calypso blue (#006994) pour headers principaux
- Couleurs: Aqua (#00A5CF) pour accents et graphs
- Font: Calibri 11pt (standard business)
- Headers: Bold, background bleu, texte blanc, centré
- Tableaux: Alternating row colors (blanc/gris très clair #F8F9FA)
- Borders: Thin gray lines (#E0E0E0)

FORMAT NOMBRES (BELGE):
- Currency: €1.234,56 (virgule pour décimales, point pour milliers)
- Dates: DD/MM/YYYY (format belge)
- Pourcentages: 45,3% (virgule pour décimales)

CONDITIONAL FORMATTING:
- Montants positifs (revenus, net > 0): Texte vert foncé (#28A745)
- Montants négatifs (dépenses, net < 0): Texte rouge foncé (#DC3545)
- Montants exceptionnellement élevés (>moyenne+20%): Background orange clair (#FFF3CD)

FEATURES EXCEL AVANCÉES:
- Freeze panes: Figer ligne 1 (headers) sur toutes les feuilles
- Auto-filter: Activer sur toutes les tables
- Column width: Auto-ajuster pour lisibilité
- Print setup: Orientation paysage pour tables larges, A4 format
- Tab colors: Couleurs différentes par feuille (bleu, vert, rouge, etc.)

IMPORTANT:
- Toutes les formules doivent FONCTIONNER (pas de #REF!, #VALUE!)
- Charts doivent être data-linked (pas des images)
- Nombres doivent avoir format belge (virgule décimale)
- Si données manquent, écrire "N/A" (pas d'erreur)
- Professional = sobre, pas de clipart ou décorations inutiles`;
}

/**
 * Build PowerPoint prompt for General Assembly presentation
 */
export function buildPowerPointAGPrompt(data: FinancialSummary, clubName: string = 'Calypso Diving Club'): string {
  const fiscalYear = data.period.fiscal_year;

  return `Crée une présentation PowerPoint de 15 slides pour l'Assemblée Générale ${fiscalYear} du ${clubName}.

DONNÉES CLÉS:
- Revenus: ${formatEuro(data.total_revenue)}
- Dépenses: ${formatEuro(data.total_expense)}
- Résultat Net: ${formatEuro(data.net_result)}
- Événements: ${data.events.length} organisés
- Transactions: ${data.transaction_count} total
- Taux réconciliation: ${data.reconciliation_rate.toFixed(1)}%

STRUCTURE SLIDES (15 total):

Slide 1: TITRE
- Titre principal: "Rapport Financier ${fiscalYear}"
- Sous-titre: "${clubName}"
- Date AG: "Assemblée Générale - Mars ${fiscalYear + 1}"
- Design: Clean, professional, logo si possible

Slide 2: AGENDA
- Titre: "Ordre du Jour"
- 5 points numérotés:
  1. Chiffres clés ${fiscalYear}
  2. Analyse des revenus
  3. Analyse des dépenses
  4. Bilan des événements
  5. Perspectives ${fiscalYear + 1}

Slide 3: CHIFFRES CLÉS
- Titre: "Synthèse Financière ${fiscalYear}"
- 4 KPIs en TRÈS GRANDE taille (font 48pt minimum):
  ✓ Revenus: ${formatEuro(data.total_revenue)}
  ✓ Dépenses: ${formatEuro(data.total_expense)}
  ✓ Résultat Net: ${formatEuro(data.net_result)}
  ✓ Événements: ${data.events.length}
- Utiliser couleurs: vert pour revenus, rouge pour dépenses, bleu/rouge pour net selon signe

Slide 4: REVENUS - VUE GLOBALE
- Titre: "Revenus ${fiscalYear}: ${formatEuro(data.total_revenue)}"
- Pie chart: Répartition par catégorie (top 5 + "Autres")
- Légende claire avec montants
- Highlight: Plus grosse catégorie

Slide 5: REVENUS - TOP 5
- Titre: "Top 5 Catégories de Revenus"
- Table propre: Catégorie | Montant | % du Total
- Design: Alternating row colors, bold headers

Slide 6: DÉPENSES - VUE GLOBALE
- Titre: "Dépenses ${fiscalYear}: ${formatEuro(data.total_expense)}"
- Horizontal bar chart: Top 10 dépenses
- Colors: Gradient rouge/orange
- Highlight: Plus grosse dépense

Slide 7: DÉPENSES - COMPARAISON
- Titre: "Évolution des Dépenses"
- Si données ${fiscalYear - 1} disponibles: Comparaison année N-1 vs N
- Sinon: Répartition mensuelle dépenses ${fiscalYear}
- Bar chart ou line chart selon données

Slide 8: ÉVOLUTION MENSUELLE
- Titre: "Trésorerie: Évolution Mensuelle"
- Line chart avec 2 lignes:
  • Revenus (ligne bleue)
  • Dépenses (ligne rouge)
- Axes clairs, grid subtile
- Highlight: Meilleur mois et pire mois

Slide 9: SOLDE & RÉSULTAT
- Titre: "Bilan Financier"
- Waterfall chart ou simple display:
  • Solde début: ${formatEuro(data.opening_balance)}
  • + Revenus: ${formatEuro(data.total_revenue)}
  • - Dépenses: ${formatEuro(data.total_expense)}
  • = Solde fin: ${formatEuro(data.closing_balance)}
- Grande flèche verte si positif, rouge si négatif

Slide 10: ÉVÉNEMENTS - BILAN
- Titre: "Bilan des Événements ${fiscalYear}"
- Stats:
  • ${data.events.length} événements organisés
  • X participants total (si dispo)
  • ${formatEuro(data.events.reduce((sum, e) => sum + e.total_revenue, 0))} revenus événements
- Bar chart: Top 5 événements par rentabilité

Slide 11: ÉVÉNEMENTS - TOP 5
- Titre: "Événements les Plus Rentables"
- Table: Événement | Participants | Revenus | Dépenses | Net
- Tri: Par net décroissant
- Top 5 seulement (lisible à distance)

Slide 12: POINTS D'ATTENTION
- Titre: "⚠️ Points d'Attention"
- Bullet points courts (max 5):
  ${data.unreconciled_transactions.length > 0 ? `• ${data.unreconciled_transactions.length} transactions non réconciliées à traiter` : ''}
  ${data.pending_expense_claims.length > 0 ? `• ${data.pending_expense_claims.length} demandes de remboursement en attente` : ''}
  • Taux réconciliation: ${data.reconciliation_rate.toFixed(1)}% ${data.reconciliation_rate < 90 ? '(objectif: >90%)' : '(✓ Excellent!)'}
- Couleur: Orange pour warnings, vert pour succès

Slide 13: PROJECTIONS ${fiscalYear + 1}
- Titre: "Budget Prévisionnel ${fiscalYear + 1}"
- Basé sur tendances ${fiscalYear}:
  • Revenus estimés: ${formatEuro(data.total_revenue * 1.05)} (+5%)
  • Dépenses estimées: ${formatEuro(data.total_expense * 1.03)} (+3%)
  • Résultat prévu: ${formatEuro((data.total_revenue * 1.05) - (data.total_expense * 1.03))}
- Note: "Estimations basées sur croissance tendancielle"

Slide 14: QUESTIONS
- Titre: "Questions ?"
- Design: Grande slide épurée
- Sous-titre: "Nous sommes à votre écoute"
- Contact: tresorier@calypso.be (ou email réel si fourni)

Slide 15: REMERCIEMENTS
- Titre: "Merci pour Votre Attention"
- Sous-titre: "${clubName}"
- Logo si disponible
- Footer: "Assemblée Générale ${fiscalYear + 1}"

DESIGN RULES (CRITIQUE):
- Theme: Professionnel business (pas ludique!)
- Couleurs principales: Bleu Calypso (#006994) + Aqua (#00A5CF)
- Font: Calibri ou Arial (sans-serif, lisible)
- Max 5 bullet points par slide (RÈGLE STRICTE)
- Pas de paragraphes (phrases courtes)
- Charts: Style moderne, flat design
- Spacing: Généreux (pas surcharger)
- Animations: AUCUNE (pas de transitions fancy)

LISIBILITÉ:
- Font size minimum: 18pt pour texte, 24pt pour titres, 48pt pour KPIs
- Contraste élevé: Texte foncé sur fond clair
- Pas de texte sur images (illisible)
- Charts: Légendes claires, axes labeled

FORMAT:
- Aspect ratio: 16:9 (widescreen standard)
- Professional template (pas de clipart)
- Consistent header/footer sur toutes slides
- Numérotation slides (1/15, 2/15, etc.)

STORYTELLING:
- Flow: Chiffres globaux → Détails → Événements → Conclusions → Projections
- Chaque slide raconte UNE idée (pas 5!)
- Highlights: Utiliser couleurs/bold pour points importants
- Data viz: Préférer charts à tables quand possible

IMPORTANT:
- Professional = sobre, clair, scannable à distance
- Pas de murs de texte (max 5 lignes par slide)
- Charts doivent être readable à 5 mètres
- Pas d'animations (distracting en présentation)`;
}

/**
 * Build simple Excel prompt for testing
 */
export function buildSimpleExcelPrompt(): string {
  return `Create a test Excel file with 3 sheets and output it as base64.

Write a Python script that:
1. Uses openpyxl to create workbook
2. Adds Sheet 1 "Test": A1="Hello", B1="World", C1=CONCATENATE(A1," ",B1)
3. Adds Sheet 2 "Nombres": A1=10, A2=20, A3=30, A4=SUM(A1:A3)
4. Adds Sheet 3 "Dates": A1="Date", A2=today's date
5. Saves as "test.xlsx"
6. Runs: python recalc.py test.xlsx
7. Reads the file and prints ONLY the base64 encoding

CRITICAL: The script must print ONLY the base64 string (no other text).

Example structure:
\`\`\`python
import openpyxl
import base64
import subprocess
from datetime import date

# Create workbook
wb = openpyxl.Workbook()
# ... add sheets and data ...
wb.save('test.xlsx')

# Recalculate formulas
subprocess.run(['python', 'recalc.py', 'test.xlsx'])

# Output base64
with open('test.xlsx', 'rb') as f:
    print(base64.b64encode(f.read()).decode('utf-8'))
\`\`\`

Use Belgian format (comma for decimals).`;
}

/**
 * Build Excel prompt for Monthly Summary Report
 * Uses base64 output workaround for CORS-free download
 */
export function buildMonthlyExcelPrompt(data: FinancialSummary, clubName: string = 'Calypso Diving Club'): string {
  const periodLabel = data.period.label;

  // Top revenue categories (top 5)
  const topRevenues = data.revenue_by_category.slice(0, 5);
  // Top expense categories (top 5)
  const topExpenses = data.expense_by_category.slice(0, 5);

  // Format revenues for Python data structure
  const revenuesData = topRevenues
    .map(c => `        {"categorie": "${c.categorie}", "montant": ${c.total}, "percentage": ${c.percentage.toFixed(1)}}`)
    .join(',\n');

  // Format expenses for Python data structure
  const expensesData = topExpenses
    .map(c => `        {"categorie": "${c.categorie}", "montant": ${Math.abs(c.total)}, "percentage": ${c.percentage.toFixed(1)}}`)
    .join(',\n');

  return `Create a professional monthly summary Excel file for ${clubName} and output it as base64.

FINANCIAL DATA:
- Period: ${periodLabel}
- Total Revenue: €${data.total_revenue.toFixed(2)}
- Total Expense: €${Math.abs(data.total_expense).toFixed(2)}
- Net Result: €${data.net_result.toFixed(2)}
- Transaction Count: ${data.transaction_count}

TOP REVENUES (by category):
${topRevenues.map(c => `- ${c.categorie}: €${c.total.toFixed(2)} (${c.percentage.toFixed(1)}%)`).join('\n')}

TOP EXPENSES (by category):
${topExpenses.map(c => `- ${c.categorie}: €${Math.abs(c.total).toFixed(2)} (${c.percentage.toFixed(1)}%)`).join('\n')}

Write a complete Python script that:

1. Creates Excel workbook with 3 sheets:
   - Sheet 1 "Synthèse": KPIs + summary chart
   - Sheet 2 "Transactions": Top revenues and expenses this month
   - Sheet 3 "Comparaison": Current month overview

2. Sheet "Synthèse" structure:
   - A1: Title "${clubName} - Synthèse Mensuelle"
   - A2: Subtitle "${periodLabel}"
   - Row 4: KPI headers (bold, blue background)
   - A4="Revenus", B4="Dépenses", C4="Résultat Net", D4="Transactions"
   - Row 5: KPI values with formulas linking to data
   - A5=${data.total_revenue}, B5=${Math.abs(data.total_expense)}, C5=A5-B5, D5=${data.transaction_count}
   - Add simple column chart for revenues vs expenses

3. Sheet "Transactions" structure:
   - Section A: Top Revenues (rows 2-8)
     • A2="TOP REVENUS" (bold header)
     • A3="Catégorie", B3="Montant €", C3="% Total"
     • Rows 4-8: Revenue data
     • B9: =SUM(B4:B8)
   - Section B: Top Expenses (rows 11-17)
     • A11="TOP DÉPENSES" (bold header)
     • A12="Catégorie", B12="Montant €", C12="% Total"
     • Rows 13-17: Expense data
     • B18: =SUM(B13:B17)

4. Sheet "Comparaison" structure:
   - A1="Analyse Mensuelle"
   - A3="Indicateur", B3="Valeur"
   - A4="Revenus totaux", B4=${data.total_revenue}
   - A5="Dépenses totales", B5=${Math.abs(data.total_expense)}
   - A6="Résultat net", B6=B4-B5
   - A7="Nombre transactions", B7=${data.transaction_count}
   - A8="Moyenne par transaction", B8=B4/B7

5. Belgian number format:
   - Use comma for decimals: €1.234,56
   - Apply to all currency cells

6. Professional styling:
   - Headers: Bold, blue background (#006994), white text
   - Alternating row colors (white / light gray #F8F9FA)
   - Currency format: "€#,##0.00" with comma decimal separator

7. Save as "rapport_mensuel.xlsx"

8. Run: python recalc.py rapport_mensuel.xlsx

9. Read file and print ONLY the base64 encoding (no other text)

CRITICAL REQUIREMENTS:
- Script must print ONLY base64 string (no debug messages, no labels)
- All formulas must work (use correct cell references)
- Use openpyxl library
- Belgian number format (comma for decimals)

Example Python script structure:

\`\`\`python
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.chart import BarChart, Reference
import base64
import subprocess

# Create workbook
wb = openpyxl.Workbook()

# Sheet 1: Synthèse
ws1 = wb.active
ws1.title = "Synthèse"

# Add title
ws1['A1'] = "${clubName} - Synthèse Mensuelle"
ws1['A1'].font = Font(size=16, bold=True)
ws1['A2'] = "${periodLabel}"

# KPI headers (row 4)
headers = ['Revenus', 'Dépenses', 'Résultat Net', 'Transactions']
for col, header in enumerate(headers, start=1):
    cell = ws1.cell(row=4, column=col)
    cell.value = header
    cell.font = Font(bold=True, color='FFFFFF')
    cell.fill = PatternFill(start_color='006994', end_color='006994', fill_type='solid')
    cell.alignment = Alignment(horizontal='center')

# KPI values (row 5)
ws1['A5'] = ${data.total_revenue}
ws1['A5'].number_format = '€#,##0.00'
ws1['B5'] = ${Math.abs(data.total_expense)}
ws1['B5'].number_format = '€#,##0.00'
ws1['C5'] = '=A5-B5'
ws1['C5'].number_format = '€#,##0.00'
ws1['D5'] = ${data.transaction_count}

# Adjust column widths
ws1.column_dimensions['A'].width = 20
ws1.column_dimensions['B'].width = 15
ws1.column_dimensions['C'].width = 15
ws1.column_dimensions['D'].width = 15

# Sheet 2: Transactions
ws2 = wb.create_sheet("Transactions")

# Top Revenues section
ws2['A2'] = "TOP REVENUS"
ws2['A2'].font = Font(bold=True, size=12)
ws2['A3'] = "Catégorie"
ws2['B3'] = "Montant €"
ws2['C3'] = "% Total"

# Revenue data
revenues = [
${revenuesData}
]

row = 4
for rev in revenues:
    ws2.cell(row=row, column=1).value = rev['categorie']
    ws2.cell(row=row, column=2).value = rev['montant']
    ws2.cell(row=row, column=2).number_format = '€#,##0.00'
    ws2.cell(row=row, column=3).value = rev['percentage'] / 100
    ws2.cell(row=row, column=3).number_format = '0.0%'
    row += 1

# Revenue total
ws2.cell(row=row, column=1).value = "TOTAL"
ws2.cell(row=row, column=1).font = Font(bold=True)
ws2.cell(row=row, column=2).value = f"=SUM(B4:B{row-1})"
ws2.cell(row=row, column=2).number_format = '€#,##0.00'
ws2.cell(row=row, column=2).font = Font(bold=True)

# Top Expenses section
ws2['A11'] = "TOP DÉPENSES"
ws2['A11'].font = Font(bold=True, size=12)
ws2['A12'] = "Catégorie"
ws2['B12'] = "Montant €"
ws2['C12'] = "% Total"

# Expense data
expenses = [
${expensesData}
]

row = 13
for exp in expenses:
    ws2.cell(row=row, column=1).value = exp['categorie']
    ws2.cell(row=row, column=2).value = exp['montant']
    ws2.cell(row=row, column=2).number_format = '€#,##0.00'
    ws2.cell(row=row, column=3).value = exp['percentage'] / 100
    ws2.cell(row=row, column=3).number_format = '0.0%'
    row += 1

# Expense total
ws2.cell(row=row, column=1).value = "TOTAL"
ws2.cell(row=row, column=1).font = Font(bold=True)
ws2.cell(row=row, column=2).value = f"=SUM(B13:B{row-1})"
ws2.cell(row=row, column=2).number_format = '€#,##0.00'
ws2.cell(row=row, column=2).font = Font(bold=True)

# Adjust column widths
ws2.column_dimensions['A'].width = 25
ws2.column_dimensions['B'].width = 15
ws2.column_dimensions['C'].width = 12

# Sheet 3: Comparaison
ws3 = wb.create_sheet("Comparaison")

ws3['A1'] = "Analyse Mensuelle"
ws3['A1'].font = Font(bold=True, size=14)

ws3['A3'] = "Indicateur"
ws3['B3'] = "Valeur"
ws3['A3'].font = Font(bold=True)
ws3['B3'].font = Font(bold=True)

indicators = [
    ("Revenus totaux", ${data.total_revenue}),
    ("Dépenses totales", ${Math.abs(data.total_expense)}),
    ("Résultat net", "=B4-B5"),
    ("Nombre transactions", ${data.transaction_count}),
    ("Moyenne par transaction", "=B4/B7")
]

row = 4
for indicator, value in indicators:
    ws3.cell(row=row, column=1).value = indicator
    if isinstance(value, str) and value.startswith('='):
        ws3.cell(row=row, column=2).value = value
    else:
        ws3.cell(row=row, column=2).value = value
    ws3.cell(row=row, column=2).number_format = '€#,##0.00'
    row += 1

ws3.column_dimensions['A'].width = 25
ws3.column_dimensions['B'].width = 20

# Save workbook
wb.save('rapport_mensuel.xlsx')

# Recalculate formulas
subprocess.run(['python', 'recalc.py', 'rapport_mensuel.xlsx'], check=True)

# Output base64 (ONLY this, no other text)
with open('rapport_mensuel.xlsx', 'rb') as f:
    print(base64.b64encode(f.read()).decode('utf-8'))
\`\`\`

IMPORTANT: The script must print ONLY the base64 string with no labels, no debugging output, no extra text.`;
}

/**
 * Build Word prompt for Monthly Summary Report
 * Uses base64 output workaround for CORS-free download
 */
export function buildMonthlyWordPrompt(data: FinancialSummary, clubName: string = 'Calypso Diving Club'): string {
  const periodLabel = data.period.label;

  // Top revenue categories (top 5)
  const topRevenues = data.revenue_by_category.slice(0, 5);
  // Top expense categories (top 5)
  const topExpenses = data.expense_by_category.slice(0, 5);

  return `Create a professional monthly summary Word document for ${clubName} and output it as base64.

FINANCIAL DATA:
- Period: ${periodLabel}
- Total Revenue: €${data.total_revenue.toFixed(2)}
- Total Expense: €${Math.abs(data.total_expense).toFixed(2)}
- Net Result: €${data.net_result.toFixed(2)}
- Transaction Count: ${data.transaction_count}

TOP REVENUES (by category):
${topRevenues.map(c => `- ${c.categorie}: €${c.total.toFixed(2)} (${c.percentage.toFixed(1)}%)`).join('\n')}

TOP EXPENSES (by category):
${topExpenses.map(c => `- ${c.categorie}: €${Math.abs(c.total).toFixed(2)} (${c.percentage.toFixed(1)}%)`).join('\n')}

Write a complete Python script using python-docx that:

1. Creates Word document with professional business style

2. Document structure:
   - Title page:
     • Title: "${clubName}"
     • Subtitle: "Synthèse Mensuelle - ${periodLabel}"
     • Large professional font

   - Section 1: "Chiffres Clés"
     • Table with 4 rows:
       - Revenus: €${data.total_revenue.toFixed(2)}
       - Dépenses: €${Math.abs(data.total_expense).toFixed(2)}
       - Résultat Net: €${data.net_result.toFixed(2)}
       - Nombre de Transactions: ${data.transaction_count}
     • Bold headers, centered values

   - Section 2: "Revenus par Catégorie"
     • Table: Catégorie | Montant € | % du Total
     • Top 5 revenues with data
     • Total row with SUM

   - Section 3: "Dépenses par Catégorie"
     • Table: Catégorie | Montant € | % du Total
     • Top 5 expenses with data
     • Total row with SUM

   - Section 4: "Analyse"
     • Paragraph: Summary of financial period
     • Average transaction: €${(data.total_revenue / data.transaction_count).toFixed(2)}
     • Net margin: ${((data.net_result / data.total_revenue) * 100).toFixed(1)}%

3. Styling requirements:
   - Font: Calibri 11pt for body, 16pt for titles
   - Headers: Bold, blue color (#006994)
   - Tables: Grid borders, alternating row shading
   - Numbers: Belgian format with comma decimals (€1.234,56)
   - Margins: 2.5cm all sides (A4 page)
   - Professional business document style

4. Save as "rapport_mensuel.docx"

5. Read file and print ONLY the base64 encoding (no other text)

CRITICAL REQUIREMENTS:
- Script must print ONLY base64 string (no debug messages, no labels)
- Use python-docx library (from docx import Document)
- Belgian number formatting
- Professional business style

Example Python script structure:

\`\`\`python
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
import base64

# Create document
doc = Document()

# Set margins
sections = doc.sections
for section in sections:
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

# Title
title = doc.add_heading('${clubName}', level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in title.runs:
    run.font.size = Pt(24)
    run.font.color.rgb = RGBColor(0, 105, 148)  # Calypso blue

# Subtitle
subtitle = doc.add_paragraph('Synthèse Mensuelle - ${periodLabel}')
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in subtitle.runs:
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0, 165, 207)  # Aqua

doc.add_page_break()

# Section 1: Chiffres Clés
doc.add_heading('Chiffres Clés', level=1)
table = doc.add_table(rows=5, cols=2)
table.style = 'Light Grid Accent 1'

# Headers
hdr_cells = table.rows[0].cells
hdr_cells[0].text = 'Indicateur'
hdr_cells[1].text = 'Valeur'

# Data
kpis = [
    ('Revenus', '€${data.total_revenue.toFixed(2).replace('.', ',')}'),
    ('Dépenses', '€${Math.abs(data.total_expense).toFixed(2).replace('.', ',')}'),
    ('Résultat Net', '€${data.net_result.toFixed(2).replace('.', ',')}'),
    ('Transactions', '${data.transaction_count}')
]

for i, (label, value) in enumerate(kpis, start=1):
    row_cells = table.rows[i].cells
    row_cells[0].text = label
    row_cells[1].text = value

# Section 2: Revenus
doc.add_heading('Revenus par Catégorie', level=1)
table_rev = doc.add_table(rows=${topRevenues.length + 2}, cols=3)
table_rev.style = 'Light Grid Accent 1'

# Headers
hdr = table_rev.rows[0].cells
hdr[0].text = 'Catégorie'
hdr[1].text = 'Montant €'
hdr[2].text = '% Total'

# Revenue data
revenues = [
${topRevenues.map(c => `    ('${c.categorie}', ${c.total.toFixed(2)}, ${c.percentage.toFixed(1)})`).join(',\n')}
]

for i, (cat, amt, pct) in enumerate(revenues, start=1):
    cells = table_rev.rows[i].cells
    cells[0].text = cat
    cells[1].text = f'€{amt:,.2f}'.replace(',', ' ').replace('.', ',')
    cells[2].text = f'{pct}%'

# Total
total_row = table_rev.rows[${topRevenues.length + 1}].cells
total_row[0].text = 'TOTAL'
total_row[1].text = '€${data.total_revenue.toFixed(2).replace('.', ',')}'

# Section 3: Dépenses
doc.add_heading('Dépenses par Catégorie', level=1)
table_exp = doc.add_table(rows=${topExpenses.length + 2}, cols=3)
table_exp.style = 'Light Grid Accent 1'

# Headers
hdr = table_exp.rows[0].cells
hdr[0].text = 'Catégorie'
hdr[1].text = 'Montant €'
hdr[2].text = '% Total'

# Expense data
expenses = [
${topExpenses.map(c => `    ('${c.categorie}', ${Math.abs(c.total).toFixed(2)}, ${c.percentage.toFixed(1)})`).join(',\n')}
]

for i, (cat, amt, pct) in enumerate(expenses, start=1):
    cells = table_exp.rows[i].cells
    cells[0].text = cat
    cells[1].text = f'€{amt:,.2f}'.replace(',', ' ').replace('.', ',')
    cells[2].text = f'{pct}%'

# Total
total_row = table_exp.rows[${topExpenses.length + 1}].cells
total_row[0].text = 'TOTAL'
total_row[1].text = '€${Math.abs(data.total_expense).toFixed(2).replace('.', ',')}'

# Section 4: Analyse
doc.add_heading('Analyse', level=1)
doc.add_paragraph(
    f"Pour la période ${periodLabel}, le club a généré €${data.total_revenue.toFixed(2).replace('.', ',')} "
    f"de revenus avec ${data.transaction_count} transactions. "
    f"Le résultat net s'élève à €${data.net_result.toFixed(2).replace('.', ',')}, "
    f"soit une marge de ${((data.net_result / data.total_revenue) * 100).toFixed(1)}%."
)

# Save document
doc.save('rapport_mensuel.docx')

# Output base64 (ONLY this, no other text)
with open('rapport_mensuel.docx', 'rb') as f:
    print(base64.b64encode(f.read()).decode('utf-8'))
\`\`\`

IMPORTANT: The script must print ONLY the base64 string with no labels, no debugging output, no extra text.`;
}

/**
 * Build Excel prompt for Event Report
 */
export function buildExcelEventReportPrompt(
  eventName: string,
  eventDate: Date,
  participants: number,
  revenue: number,
  expense: number
): string {
  return `Crée un fichier Excel pour le rapport de l'événement "${eventName}".

DONNÉES ÉVÉNEMENT:
- Nom: ${eventName}
- Date: ${formatDate(eventDate)}
- Participants: ${participants}
- Revenus: ${formatEuro(revenue)}
- Dépenses: ${formatEuro(expense)}
- Résultat net: ${formatEuro(revenue - expense)}

FEUILLES REQUISES (3):

1. "Synthèse"
   - KPIs en grande taille
   - Pie chart revenus vs dépenses
   - Résultat net (vert si positif, rouge si négatif)

2. "Participants"
   - Liste participants avec statut paiement
   - Colonnes: Nom | Prénom | Montant | Payé (Oui/Non)

3. "Détails Financiers"
   - Table revenus par type
   - Table dépenses par catégorie
   - Totaux avec formules

Format belge (€1.234,56), style professionnel.`;
}

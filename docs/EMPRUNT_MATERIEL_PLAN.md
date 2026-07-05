# Emprunter du matériel — refonte flux membre

**Statut:** ontwerp / design-partner. Geen Flutter- of CalyCompta-code aanpassen zonder expliciete opdracht.
**Mockup:** `EMPRUNT_MATERIEL_MOCKUP.html` (klikbaar).
**Aanleiding:** testfeedback (juli 2026) — zie §1.

---

## 1. Testfeedback (bron)

1. Voeg **parachute** en **ceinture de plomb** toe aan de keuze.
2. De lijst « matériel disponible » is niet bruikbaar: toont de **volledige inventaris** met nutteloze data (code/fabricant/modèle/n° série). Voorraadaantal is overbodig (behalve evt. ordinateurs).
3. Keuze moet **per categorie + eigenschap**:
   - Bouteille: 10 L / 12 L · étrier / DIN
   - Gilet: XS / S / M / L / XL
   - Palmes: S (36/40) / M (40/46)
   - Ceinture: aantal kg
4. « Ma commande est envoyée » maar daarna is er **niets terug te vinden**.

---

## 2. Diagnose van de huidige implementatie

- Member-flow zit in `CalyMob/lib/screens/stock/material_returns_screen.dart` (via kaart **Prêts matériel** in de Boutique) + `services/material_return_service.dart`.
- `watchBorrowableItems()` haalt **alle** `inventory_items` met `statut == disponible` op en toont `displayName` (type + code + fabricant + modèle + n° série) → exact wat de tester « données inutiles » noemt.
- `submitLoanRequest()` schrijft naar `clubs/{clubId}/inventory_loan_requests` met `status: submitted`, `source: calymob`. Bevestiging: *« Demande envoyée au responsable matériel. »*

### Waarom de aanvraag verdwijnt (2 echte bugs)
- **B1 — geen consument.** CalyCompta (`loanService.ts`, `PretsPage`) leest enkel `inventory_loans`. **Niemand** leest `inventory_loan_requests`. Er is geen goedkeurings-workflow die een aanvraag → prêt maakt. Dood spoor.
- **B2 — eigen lijst faalt stil.** `watchMyLoanRequests()` query (`memberId ==` + `status in [...]`) heeft **geen Firestore composite index** (`firestore.indexes.json`) → stream faalt → « Aucune demande en cours » of foutstate.
- Plandocument `CalyCompta/docs/boutique-plan/PRETS_CAUTIONS_PLAN.md` bevestigt: self-service aanvraag door lid stond als **Fase 5 « éventuelle »** — UI half ingebouwd, keten nooit afgemaakt.

---

## 3. Ontwerpbeslissing (kern)

Van **objectselectie** (kies dit fysieke stuk met n° série) → naar **categorie + eigenschap**.

De aanvraag bewaart `lines` i.p.v. `itemIds`:

```jsonc
{
  "memberId": "m_4821",
  "memberName": "…",
  "status": "submitted",            // submitted → validated → ready → handed_over | refused
  "lines": [
    { "category": "bouteille", "attrs": { "volume": "12L", "raccord": "DIN" }, "qty": 1 },
    { "category": "gilet",     "attrs": { "taille": "L" }, "qty": 1 },
    { "category": "ceinture",  "attrs": { "poids_kg": 8 }, "qty": 1 },
    { "category": "parachute", "attrs": {}, "qty": 1 }
  ],
  "assignedItemIds": [],            // ingevuld door responsable bij validatie
  "date_retour_prevue": "2026-07-12",
  "notes": null,
  "source": "calymob"
}
```

Het echte materiaal (n° série) wordt **pas bij validatie/afgifte** toegewezen door de responsable → sluit aan bij de bestaande admin-flow (`LoanService.createLoan` op `inventory_loans`).

### Categorieën (mockup)
bouteille · gilet · palmes · ceinture (plomb) · parachute (DSMB) · détendeur · lampe · ordinateur (enige met voorraadaantal).

---

## 4. Chaîne à fermer (maillon manquant)

```
Membre demande  →  Responsable reçoit (inbox + notif)  →  Valide & attribue matériel réel  →  Prêt (inventory_loans) + caution
```

Nodig: (a) responsable-inbox op `inventory_loan_requests` in CalyCompta, (b) validatie-actie die aanvraag → `inventory_loans` omzet + caution genereert (hergebruik `LoanService.createLoan`), (c) refuse-actie met motief, (d) notificaties + composite index voor `watchMyLoanRequests`.

---

## 5. Beslissingslogboek

| # | Datum | Beslissing | Status |
|---|-------|------------|--------|
| 1 | 2026-07-02 | Richting = eerst klikbare mockup categorie-keuze (design-first) | ✅ vergrendeld |
| 2 | 2026-07-02 | Aanvraagmodel = `lines` (catégorie+attrs+qty), niet `itemIds` | ✅ vergrendeld |
| 2b | 2026-07-02 | UI = **één formulier**, checkbox per categorie, opties + aantal inline (geen wizard, geen iconen) | ✅ vergrendeld |
| 3 | 2026-07-02 | Responsable-flow = tabblad **Demandes** in CalyCompta (Stock › Prêts); Valider hergebruikt `LoanService.createLoan`, Refuser met motief | ✅ vergrendeld |
| 3b | 2026-07-02 | **Geen exemplaar-/n° série-toewijzing** in v1 — prêt verwijst naar gevraagde categorieën; serienummer = latere fase (bij afgifte) | ✅ vergrendeld |
| 4 | — | Definitieve categorielijst + waarden (flesvolumes, maten, evt. masque/combinaison) — met club | ⬜ open |
| 5 | — | Wie is « responsable matériel » (rol/rechten in CalyCompta) | ⬜ open |
| 6 | — | Caution: bedrag per categorie/handmatig + betaalmoment (validatie vs afgifte) | ⬜ open |

---

## 6. Reste à faire (implementatie, ná vergrendeling)

**A. Datamodel & rules**
- `inventory_loan_requests`: `lines[{category,attrs,qty}]`, `status` (submitted→validated→refused), `notes`, `date_retour_prevue`, `source`.
- Firestore **composite index** voor `watchMyLoanRequests` (`memberId ==` + `status in`) — mist nu → « Mes demandes » faalt stil.
- Security rules: lid schrijft/leest eigen aanvraag; responsable leest/muteert club-aanvragen.

**B. CalyMob — member**
- Formulier-scherm herbouwen (checkbox per categorie + opties + aantal) i.p.v. huidige inventaris-lijst in `material_returns_screen.dart`.
- « Mes demandes » met statussen (En attente / Validée / Prêt à retirer / Refusée).
- Parachute + ceinture de plomb + categorie-opties toevoegen.

**C. CalyCompta — responsable**
- Nieuw tabblad **Demandes** (Stock › Prêts) dat `inventory_loan_requests` leest (badge met aantal).
- Detail « Traiter » → Valider (→ `LoanService.createLoan` + caution) / Refuser (+ motief); aanvraag op `validated`/`refused`.

**D. Notificaties**
- Naar responsable: nieuwe aanvraag. Naar lid: validée / refusée / prête à retirer.

**E. Later (aparte fase)**
- Exemplaar-/n° série-toewijzing bij afgifte.
- Caution-QR/Ponto-matching doortrekken (bestaat al voor admin-prêts).

---

## 7. Openstaande vragen (1 per keer, design-partner)

- V-A: Definitieve categorielijst + waarden bevestigen (met club).
- V-B: Definitie « responsable matériel » (welke rol ziet tabblad Demandes).
- V-C: Caution — vast bedrag per categorie of handmatig + betaalmoment.

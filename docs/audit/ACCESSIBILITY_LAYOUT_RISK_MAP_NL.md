# Accessibility layout risk map

Datum: 2026-05-25
Scope: CalyMob Flutter UI, met focus op grote systeemtekst, smalle Android-schermen en beperkte schermhoogte.

## Aanleiding

Frank zag bij het plannen van een duik dat het scherm "Nouvel evenement" vast leek te lopen: tekst werd verticaal afgebroken, de knop overlapte de tekst en scrollen was niet mogelijk. De oorzaak is niet een data- of backendprobleem, maar een layout die bij grote tekstschaling te weinig ruimte krijgt.

De eerste fix is al gedaan in:

- `lib/screens/operations/create_event_wizard.dart`

Daar scrollt de volledige eerste stap nu mee en schakelt de manuele aanmaakrij op smalle of sterk geschaalde schermen naar een verticale layout.

## Risicoprofiel

| Prioriteit | Zone | Bestand | Risico | Aanpak |
|---|---|---|---|---|
| P0 | Nieuwe duikactiviteit plannen | `lib/screens/operations/create_event_wizard.dart` | Bewezen probleem bij grote tekst. | Gefixt. Regressietest op klein scherm met grote tekst. |
| P1 | Activiteit bewerken | `lib/screens/operations/edit_event_screen.dart` | Lange formulieren, datumvelden, verantwoordelijke-picker en tariefsecties kunnen te krap worden. | Volledig scherm moet scrollbaar blijven; actieknoppen en compacte rijen responsive maken. |
| P1 | Inschrijving aanpassen | `lib/screens/operations/edit_my_inscription_dialog.dart` | Dialog met vaste max-breedte en veel secties; acties onderaan kunnen buiten beeld vallen. | Dialog hoogte begrenzen, content flexibel laten scrollen, acties altijd bereikbaar houden. |
| P1 | Palanquee / evaluatie | `lib/screens/operations/palanquee_screen.dart` | Bottom sheets met statusknoppen in `Row`; bij grote tekst kunnen knoppen overlappen. | Statusknoppen vervangen door `Wrap` of verticale layout bij hoge textScale. |
| P1 | Carnet duiker invoeren | `lib/screens/training/logbook_entry_screen.dart` | Groot formulier met dictaat, selectors, binomes en vaste bottom save-zone. | Controleren dat alle secties scrollen en dat save-knop niet over content ligt. |
| P1 | OCR review carnet | `lib/screens/training/logbook_ocr_review_screen.dart` | Review cards met meerdere velden en acties; groot teksttype kan kaarten te hoog maken. | Kaarten en actieknoppen responsive maken; geen vaste hoogtes rond bewerkvelden. |
| P2 | Locatiekiezer carnet | `lib/widgets/dive_location_picker.dart` | Bottom sheet is begrensd op 85 procent hoogte; header in een `Row` kan krap worden. | Header robuuster maken met `Expanded`/wrapping; sheet blijft scrollbaar. |
| P2 | Binome/typeahead velden | `lib/widgets/binome_typeahead_field.dart` | Zoekvelden en geselecteerde personen kunnen horizontaal vol lopen. | Chips/rijen laten wrappen; lange namen ellips of meerdere regels. |
| P2 | Materiaalpickers | `lib/widgets/tank_picker_field.dart`, `lib/widgets/combi_picker_field.dart` | Bottom sheets met opties; labels kunnen overlopen. | Optierijen testen met grote tekst; indien nodig `Wrap`/meerregelige labels. |
| P2 | Betalings- en supplementkaarten | `lib/widgets/participant_payment_card.dart`, `lib/screens/operations/register_with_guests_dialog.dart` | Prijs, status en knoppen staan vaak naast elkaar. | Bedragen/statussen los laten wrappen; actieknoppen onder elkaar op smal scherm. |
| P3 | Scanner/camera schermen | `lib/widgets/scanner_modal_sheet.dart`, `lib/screens/training/*scan*` | Vaste camera-preview afmetingen zijn normaal, maar begeleidende tekst kan krap worden. | Alleen tekstzones responsive maken; camera kader mag vast blijven. |
| P3 | Discussie en polls | `lib/widgets/event_discussion_tab.dart`, `lib/widgets/poll_compose_dialog.dart` | Chat/poll UI bevat compacte rijen en dialogen. | Later testen; lager risico voor kernflow plannen/duiken. |

## Herkenbare codepatronen

Deze patronen moeten we vermijden of controleren:

- `Column` als hoofdinhoud waarbij alleen een klein deel scrollt.
- `Row` met lange tekst en een knop zonder `Expanded`, `Flexible` of fallback naar verticale layout.
- Dialogen en bottom sheets zonder maximale hoogte en zonder scrollbare content.
- Vaste `height` rond tekst, formulierregels, kaarten of knoppen.
- Actieknoppen die onderaan vast staan maar content kunnen bedekken.

## Standaardoplossing

Voor schermen:

- Gebruik een scrollbare hoofdcontainer (`ListView` of `CustomScrollView`) wanneer de volledige stap/formulier kan groeien.
- Hou vaste footerknoppen buiten de scroll alleen als er voldoende bottom padding is.
- Gebruik `LayoutBuilder` plus `MediaQuery.textScalerOf(context)` om bij smalle breedte of grote tekst naar verticale layout te schakelen.

Voor dialogs en bottom sheets:

- Begrens hoogte met `MediaQuery.size.height`.
- Zet inhoud in `SingleChildScrollView`, `ListView` of `DraggableScrollableSheet`.
- Gebruik `Wrap` of verticale knoppen in plaats van meerdere brede knoppen in een `Row`.

Voor test:

- Android klein scherm: 360 x 800.
- Tekstgrootte: minimaal 1.6x, liefst ook 2.0x.
- Controlepunten: geen overlap, alle knoppen bereikbaar, scroll werkt, geen `RenderFlex overflow`.

## Voorgestelde volgorde

1. P0 valideren: `create_event_wizard.dart` testen met Frank-profiel.
2. P1 fixronde: `edit_event_screen.dart`, `edit_my_inscription_dialog.dart`, `palanquee_screen.dart`.
3. P1 carnetronde: `logbook_entry_screen.dart`, `logbook_ocr_review_screen.dart`.
4. P2 widgets hardenen: locatie, binome, tank, combi en betalingskaarten.
5. P3 visuele regressie: scanner, discussie, polls.


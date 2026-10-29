# Diagnose — Boutique-beheer in CalyMob

> **Historical snapshot.** This is a read-only diagnosis made against the stated
> 19 October 2026 revisions. It is retained for decision history, not as a
> statement of the current implementation; later Boutique work may supersede it.

**Datum:** 19 oktober 2026  
**Onderzoekstype:** read-only. Geen code, Firestore-data, regels, Git-status of deployment gewijzigd.  
**Bronbasis:** `CalyMob` `origin/dev` (`e52fecf`, 18 oktober 2026) en `CalyCompta` `origin/main` (`d12991d`, 15 oktober 2026). Dit is dus een broncode-diagnose; er is geen productie-Sentry- of Firestore-inspectie uitgevoerd.

## Conclusie in één zin

De CalyMob-Boutique is een **ledenwinkel**, geen mobiele backoffice. Het ontbrekende beheer is geen verborgen of kapotte adminroute: catalogusbeheer, orderverwerking, leveranciers, ontvangsten, voorraad, betalingen en afrekeningen bestaan momenteel alleen in CalyCompta. Daarnaast heeft de mobiele klantflow een reële compatibiliteitsfout voor bestaande varianten met een leeg label.

## Wat bestaat vandaag

### CalyMob: ledenflow

| Onderdeel | Route/scherm | Mogelijkheden |
| --- | --- | --- |
| Toegangspunt | Home/landing → `BoutiqueScreen` | Alleen tonen na live feature-flag- en ledencontrole. |
| Catalogus | `BoutiqueProductsScreen` | Alleen gepubliceerde producten lezen, categorie filteren, detail openen. |
| Aankoop | `BoutiqueProductDetailScreen`, cart, checkout | Variant/persoonlijke opties kiezen; order uitsluitend via callable `createBoutiqueOrder`. |
| Eigen bestellingen | `MesCommandesScreen` | Alleen eigen orders tonen, open order annuleren en betalingse-mail opnieuw vragen. |
| Niet aanwezig | — | Geen product-editor, productpublicatie, orderoverzicht voor medewerkers, betaalmatching, leverancier, ontvangst, stock, afrekening of Boutique-instellingen. |

De expliciete scherminventaris onder `lib/screens/boutique/` bevat alleen `boutique_screen`, productdetail, mandje, checkout, bevestiging en `mes_commandes`. Er bestaat geen `BoutiqueAdmin`, `BoutiqueManagement`, `BoutiqueOrders` of `BoutiqueSupplier`-scherm in `origin/dev`.

### CalyCompta: werkelijke backoffice

De web-backoffice bevat wel de volledige operationele werkruimte:

| Webroute | Functie |
| --- | --- |
| `/stock/boutique` | Dashboard met open bestellingen, betaal- en leveranciersuitzonderingen. |
| `/stock/boutique/products` | Producten, varianten, prijs, publicatie, afbeeldingen en personalisatie. |
| `/stock/boutique/orders` | Order-, betaal-, fulfillment-, ontvangst-, productie- en leveringsflow. |
| `/stock/boutique/settlements` | Jim/personalisatie-afrekeningen. |
| `/stock/boutique/suppliers` | Leveranciers en hun leveringsconfiguratie. |
| `/stock/boutique/settings` | Gecoördineerde zichtbaarheid en sectie-instellingen. |

De huidige webflow gaat bovendien verder dan wat een mobiele ledenapp veilig zou kunnen dupliceren: supplier batches, fysieke voorraadstukken, QR-labels, invoice reconciliation, bankkoppeling en immutable auditlogs zijn allemaal onderdeel van de CalyCompta-flow.

## Toegang en Firestore-contract

### Ledenwinkel in CalyMob

De mobiele `BoutiqueAccessService` leest `clubs/{clubId}/settings/feature_flags` én het eigen `members/{uid}`-document.

| Modus | Wie kan de mobiele Boutique gebruiken? |
| --- | --- |
| `testeurs` (voorbereiding) | Alleen een **actief** lid met `clubStatuten` `Responsable boutique`/`RB` (met de ondersteunde schrijfwijzen). |
| `tous` | Elk actief lid. |
| `masque` | Niemand. |

`boutiqueEnabled` of `boutiqueMobileEnabled` moet tevens waar zijn. Elke mobiele subroute wordt opnieuw fail-closed bewaakt door `BoutiqueAccessGuard`; een reeds geopende route verdwijnt ook bij logout/accountwissel of flagwijziging. De actuele `origin/main`-rules van CalyCompta hanteren dezelfde RB-test voor de ledenwinkel en laten leden alleen `products` met `visibility == 'published'` lezen. Orders worden door een callable aangemaakt; directe client-creatie is verboden.

### Beheer in CalyCompta

Web-backofficewrites op producten, orders, leveranciers, batches, fysieke voorraad en audit-informatie vereisen een admin/superadmin én, waar van toepassing, een geldige websessie. `Responsable boutique` is dus **geen** backoffice-beheerdersrol. Dat is een verdedigbare scheiding, maar de benaming “Responsable boutique” schept terecht de verwachting dat die persoon ook kan beheren.

## Problemen en aanbevolen aanpak

| Prioriteit | Diagnose | Huidige toestand / bewijs | Aanpak | Inspanning |
| --- | --- | --- | --- | --- |
| Hoog (productverwachting) | **Er is geen mobiele Boutique-backoffice.** | De mobiele module bevat uitsluitend de ledenflow; geen adminroute of beheercomponent. CalyCompta heeft daarentegen dashboard, producten, bestellingen, leveranciers, afrekeningen en instellingen. | Maak eerst de productkeuze expliciet: **A)** web-backoffice blijft de enige beheerplek en CalyMob toont voor bevoegde medewerkers enkel een duidelijke “Beheer in CalyCompta”-uitleg/deeplink; of **B)** bouw een beperkte mobiele operationele cockpit. Kies B alleen voor concrete mobiele taken (bv. uitgifte via QR), niet als duplicaat van de volledige webbackoffice. | A: klein, 0,5–1 dag. B (scoped uitgifte/ontvangst): 2–4 weken. Volledige parity: 8–12+ weken, niet aanbevolen. |
| Hoog (rollen/UX) | **`Responsable boutique` geeft testtoegang tot de ledenwinkel, maar geen beheerrechten.** | RB is voldoende voor `testeurs` in de mobiele guard, Cloud Functions en rules. De webnavigatie en writes zijn admin-only. Een RB ziet dus als tester de shop, maar kan geen product of order beheren. | Documenteer en toon de rolgrens in de UI. Als RB operationeel beheer moet doen, introduceer een afzonderlijke, minimaal-geprivilegieerde server-authorized capability (bv. `boutique.fulfillment`) met eigen screens en rules; maak RB niet automatisch admin. | Documentatie/UI: 0,5–1 dag. Nieuwe operationele capability: 4–8 dagen plus rule/emulatortests. |
| Middel (echte datacompatibiliteit) | **Lege variantlabels worden in CalyMob blanco getoond en in het mandje opgeslagen.** | `BoutiqueVariant.fromMap` neemt een aanwezige lege `label` letterlijk over. Het detail toont `Text(variant.label)` en het cart bewaart `variant?.label ?? 'Standard'`; `''` passeert dus beide fallbacks. CalyCompta deriveert sinds de recente webfix wel `taille/size · couleur/color · coupe/genre` bij opslaan/weergave. Bestaande lege documenten blijven echter mobiel fout totdat ze opnieuw zijn opgeslagen. | Deel of spiegel de pure `deriveBoutiqueVariantLabel`-logica in Dart; normaliseer bij Firestore-deserialisatie en gebruik vervolgens steeds de genormaliseerde label. Voeg tests toe voor lege labels en de Franse/Engelse attribuutnamen. Een optionele eenmalige backfill pas apart beoordelen. | 0,5–1 dag, plus 0,5 dag voor tests. Backfill: apart, alleen na data-audit. |
| Middel (functionele kloof) | **Mobiele “Mes commandes” is geen orderbeheer.** | De callable `listBoutiqueOrders` retourneert de eigen orders. De UI kan alleen een nog onbetaalde eigen order annuleren of de betaalmail opnieuw vragen. Geen overzicht per klant, geen betaalstatuscorrectie, geen fulfillment, geen voorraadreservering/uitgifte. | Behoud financiële en leveranciersacties op web. Als de vraag vooral “afhalen aan het zwembad” is, ontwerp één beperkte scanner-/handoverflow die server-side autoriseert, audit en idempotent maakt; koppel niet rechtstreeks aan brede `orders`-writes. | 2–4 weken inclusief callable, regels, emulatortests en UX. |
| Laag (compatibiliteit) | **Mobiel leest de actuele verkoopsvelden correct, maar is geen volledig catalogusmodel.** | Productnaam, prijs, gepubliceerde zichtbaarheid, varianten, stock, delivery en `embroidery` worden gelezen. Legacy webcategorieën vallen in Dart terug op `autre`; supplier reference, minimum/target stock, backorder-ETA en de overige backofficevelden worden bewust niet gebruikt. | Alleen uitbreiden wanneer die velden een ledenbeslissing beïnvloeden. Houd de mobiele DTO expliciet consumptiegericht en leg een contracttest vast met representatieve Firestore-producten uit CalyCompta. | Contracttests: 1–2 dagen. Extra klantvelden: per veld beoordelen. |
| Laag (observability/kwaliteit) | **Geen Boutique-specifieke Sentry-fout of compileerfout is uit de bron afleidbaar.** | In de huidige Boutique-scope staan geen TODO/FIXME/`unimplemented`-markers. De aanwezige tests dekken access guard, cart, personalisatie, productdetail en afbeelding, maar geen beheerflow omdat die niet bestaat. Er was in dit read-only onderzoek geen geauthenticeerde Sentry-query en geen analyse/build tegen een uitcheck van `origin/dev`. | Voeg bij elk nieuw mobiel beheeronderdeel unit-, widget-, callable- en Firestore-emulatortests toe; voeg Sentry-tags voor flow/rol toe, zonder klant- of betalingsgegevens te loggen. | 1–2 dagen als onderdeel van de gekozen feature. |

## Geen aangetoond probleem

- De actuele CalyCompta `origin/main`-rules en de CalyMob `origin/dev`-mobile access policy zijn inhoudelijk aligned voor actieve leden, RB/testers, alle leden en verborgen mode.
- De directe productread is beperkt tot `published`; een client kan dus niet via de normale mobiele catalogus drafts lezen.
- De callable hercontroleert Boutique-toegang server-side en gebruikt een transactie; de clientprijs is niet de bron van waarheid voor een order.
- De feature-flag- en routeguards zijn niet de oorzaak van het ontbreken van beheer: zij beschermen bewust alleen de ledenwinkel.

## Aanbevolen volgorde

1. Beslis expliciet of beheer uitsluitend in CalyCompta blijft. Dat is de veiligste en meest proportionele standaard.
2. Herstel de lege variantlabel-fallback in CalyMob, onafhankelijk van die beslissing.
3. Als mobiele operatie nodig is, schrijf één taakgerichte scope (bijvoorbeeld afhaling/hand-over) met een eigen capability en server-callable; begin niet met een mobiele kopie van catalogus, leveranciers en boekhouding.
4. Laat RB versus admin zichtbaar uitleggen in CalyCompta én in CalyMob, zodat “verantwoordelijke” niet als onbedoelde beheerautorisatie wordt geïnterpreteerd.

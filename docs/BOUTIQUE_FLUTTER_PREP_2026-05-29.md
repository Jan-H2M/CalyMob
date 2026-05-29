# Boutique in CalyMob — heranalyse en voorbereidingsplan

Datum: 2026-05-29  
Scope: CalyMob leden-app, nog niet algemeen zichtbaar maken.

## Huidige stand

- In CalyMob is nog geen echte boutique-module aanwezig.
- Er bestaat wel al een `FeatureFlagService`, maar die kent vooral Carnet de Formation.
- De web-admin gebruikt intussen de Firestore-collecties:
  - `clubs/{clubId}/products`
  - `clubs/{clubId}/orders`
  - bestaande `clubs/{clubId}/fournisseurs`
- Producten hebben inmiddels meer velden dan het eerste plan:
  - categorieën: `vetements`, `accessoires_club`, `abonnements`, `brevets_formations`, enz.
  - meerdere beelden in `images`
  - varianten met stockvelden
  - personalisatieconfiguratie via `embroidery`, maar die betekent nu ruimer: broderie of impression
  - supporttypes zoals `polo`, `tshirt`, `sweatshirt`, `cap`, `poncho`, `towel`, `patch`, `mask_strap`, `bcd_name_tag`, `tank_band`, `mug`, `thermos`, `drink_bottle`

## Belangrijkste keuze: beperkte toegang

De Boutique mag in CalyMob niet voor alle leden zichtbaar worden. Alleen een beperkte groep gekozen testers mag de module zien en gebruiken.

Voor deze testfase houden we de toegang bewust eenvoudig:

1. UI-gate in CalyMob: geen knop, tab of route tonen als het lid geen toegang heeft.
2. Geen extra Firestore-verstrenging nu. Dat vermindert het risico dat we tijdens testen vastlopen op permissions.

Aanbevolen model voor zichtbaarheid:

```ts
clubs/{clubId}/settings/feature_flags {
  boutiqueMobileEnabled: true
}

clubs/{clubId}/members/{memberId} {
  feature_access: {
    boutique: true
  }
}
```

Waarom per member?

- Jan kan exact enkele mensen selecteren.
- Het blijft beheersbaar als de testgroep groeit.
- Later kan CalyCompta een eenvoudige toggle tonen op de ledenfiche.

## Firestore rules in deze fase

Niet aanpassen voor de eerste Flutter-test. De huidige rules mogen gepubliceerde producten technisch leesbaar laten voor leden; de module blijft praktisch verborgen doordat CalyMob geen toegangspunt toont zonder de member-flag.

Als de boutique later publiek/financieel kritisch wordt, kunnen we alsnog dezelfde `feature_access.boutique` flag in Firestore rules afdwingen.

## Navigatie in CalyMob

Niet meteen een permanente tab voor iedereen.

Aanpak voor testfase:

- Op `HomeScreen` conditioneel een Boutique-entry tonen, alleen als `BoutiqueAccessService` true geeft.
- Beste UX: een extra actieknop/tegel in de home-content of profielmenu, niet blind een vierde bottom-tab forceren.
- Als we later algemeen lanceren, kunnen we beslissen of Boutique een hoofdtab wordt.

## Eerste Flutter-MVP

Doel: leden kunnen producten bekijken en een bestelling voorbereiden, zonder de volledige automatisering al te zwaar te maken.

Fase 1:

- `BoutiqueProduct` model in Dart, gespiegeld op web-type.
- `BoutiqueService`:
  - stream/list `published` producten
  - categorie-filter
  - product detail
- `BoutiqueAccessService`:
  - leest `feature_flags`
  - leest `members/{uid}.feature_access.boutique`
  - geeft 1 boolean voor UI
- Schermen:
  - productlijst
  - productdetail met foto-carousel
  - variantkeuze
  - eenvoudige cart/order draft

Fase 2:

- bestelling aanmaken in `orders`
- betaling/QR-flow aansluiten op bestaande betalingslogica
- "Mes commandes"

Fase 3:

- personalisatie:
  - clublogo
  - naam met prijs per letter per gekozen plaats
  - brevet als exact één waarde
  - zones volgens supporttype
  - eenvoudige preview en waarschuwing bij lange namen

## Foto's

CalyMob moet productfoto's lezen uit `product.images`.  
Voor admin-upload blijft CalyCompta de bron. Als later CalyMob ook adminfoto's zou uploaden, moet dat dezelfde Storage-conventie volgen:

```text
clubs/{clubId}/boutique/products/{productId}/...
```

Voor gewone leden is uploaden van productfoto's niet nodig.

## Niet vergeten

- Geen hardcoded categorieflows; alle opties komen uit productconfiguratie.
- Geen "Boutique V2" naam gebruiken.
- "Carnets & documentation" is nu `accessoires_club`.
- "Vêtements brodés" is nu `vetements`.
- "Abonnements sites de plongée" is nu `abonnements`.
- Personalisatie betekent niet altijd broderie: mugs/thermos/gourdes gebruiken `print`.
- Niet elke mug is personaliseerbaar; sommige producten zijn gewoon stock met clublogo.
- Bestellingen moeten op orderlijnniveau bewaren wat gekozen werd, inclusief tekst, zones, brevet en prijsberekening.

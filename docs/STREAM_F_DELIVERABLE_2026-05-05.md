# Stream F Deliverable — 2026-05-05

## Samenvatting per file

### `lib/services/feature_flag_service.dart`
Nieuwe `FeatureFlagService` toegevoegd die luistert op `clubs/{clubId}/settings/feature_flags`, default flags op `false` zet als het document ontbreekt, en de Boutique-zichtbaarheid afleidt via `boutiqueV2Enabled` + `boutiqueV2AdminOnly`.

### `lib/providers/cart_provider.dart`
Nieuwe in-memory `CartProvider` toegevoegd met `CartItem`, `DeliveryMode`, `addItem`, `removeItem`, `updateQty`, `total` en `clear()`. Geen persistence in MVP; TODO blijft voor latere `SharedPreferences`.

### `lib/main.dart`
`FeatureFlagService` en `CartProvider` geregistreerd in `MultiProvider`. Named routes toegevoegd voor `/home`, `/boutique`, `/boutique/product/:productId`, `/boutique/cart`, `/boutique/checkout`, `/profile/orders`, `/profile/orders/:orderId`, `/profile/recus`, `/profile/abonnements`, `/profile/cotisation` en `/profile/prets`.

### `lib/screens/home/landing_screen.dart`
Landing uitgebreid met conditionele Boutique-knop op basis van de feature flag, zonder `Finances` te vervangen. Wanneer Boutique zichtbaar is, schakelt de glossy-knoppenzone over naar een 7-knoppen `Wrap`-layout. Er is ook een conditionele saldo-banner-hook toegevoegd met TODO voor echte balance-fetch.

### `lib/screens/boutique/boutique_feature_guard.dart`
Gedeelde guard toegevoegd voor Boutique-gerelateerde screens. Bij niet-zichtbare feature wordt naar `/home` teruggestuurd.

### `lib/screens/boutique/boutique_screen.dart`
Nieuwe Boutique-hubscreen met `OceanGradientBackground`, horizontale categorie-strip, placeholder productcards en FAB naar het winkelmandje.

### `lib/screens/boutique/boutique_product_detail_screen.dart`
Nieuwe skeleton detailpagina met placeholder-carrousel, prijsblok, variant-dropdown, quantity selector, delivery chips en `Ajouter au panier`-actie naar `CartProvider`.

### `lib/screens/boutique/boutique_cart_screen.dart`
Nieuwe cartscreen op basis van `CartProvider`, met qty-controls, remove-knop, totaal en doorstroom naar checkout.

### `lib/screens/boutique/boutique_checkout_screen.dart`
Nieuwe checkout-skeleton met contactoverzicht, conditioneel postadres-formulier, TODO voor `createOrder` en een simpele success state met QR/IBAN/ordernummer placeholder.

### `lib/screens/boutique/mes_commandes_screen.dart`
Nieuwe ordersscreen met echte Firestore-stream op `clubs/{clubId}/orders` gefilterd op `buyer.userId`, grouping per status en een `endDrawer` voor orderdetails + timeline placeholder.

### `lib/screens/profile/profile_screen.dart`
Bestaande profielpagina uitgebreid met Boutique-items onder de bestaande menu-items, enkel zichtbaar als Boutique via feature flags zichtbaar is.

### `lib/screens/profile/mes_recus_screen.dart`
Nieuwe guarded placeholder route voor `Mes reçus`.

### `lib/screens/profile/mes_abonnements_screen.dart`
Nieuwe guarded placeholder route voor `Mes abonnements`.

### `lib/screens/profile/ma_cotisation_screen.dart`
Nieuwe guarded placeholder route voor `Ma cotisation`.

### `lib/screens/profile/mes_prets_screen.dart`
Nieuwe guarded placeholder route voor `Mes prêts`.

## Nieuwe files

- `lib/providers/cart_provider.dart`
- `lib/screens/boutique/boutique_cart_screen.dart`
- `lib/screens/boutique/boutique_checkout_screen.dart`
- `lib/screens/boutique/boutique_feature_guard.dart`
- `lib/screens/boutique/boutique_product_detail_screen.dart`
- `lib/screens/boutique/boutique_screen.dart`
- `lib/screens/boutique/mes_commandes_screen.dart`
- `lib/screens/profile/ma_cotisation_screen.dart`
- `lib/screens/profile/mes_abonnements_screen.dart`
- `lib/screens/profile/mes_prets_screen.dart`
- `lib/screens/profile/mes_recus_screen.dart`
- `lib/services/feature_flag_service.dart`
- `docs/STREAM_F_DELIVERABLE_2026-05-05.md`

## Gewijzigde files

- `lib/main.dart`
- `lib/screens/home/landing_screen.dart`
- `lib/screens/profile/profile_screen.dart`

## Open punten

- Cart persistence ontbreekt nog bewust; huidige MVP-cart leeft enkel in memory.
- `BoutiqueCheckoutScreen` gebruikt nog geen echte Cloud Function `createOrder`.
- QR-betaling, EPC/IBAN payload en ordernummering zijn placeholder-data.
- Landing-balance-banner heeft enkel de UI-hook; echte open-balance fetch ontbreekt nog.
- `BoutiqueScreen` en `BoutiqueProductDetailScreen` lezen nog geen echte `products`-data uit Firestore.
- `Mes commandes` gebruikt al de echte Firestore-collectie, maar order detail-timeline en snapshots zijn nog tolerant/placeholder-gericht.
- `OceanBackground`-varianten zijn beperkt tot bestaand `OceanGradientBackground`; geen extra Boutique-specifieke variant toegevoegd.

## Analyze

Geprobeerd:

```bash
flutter analyze
```

Resultaat in deze omgeving:

```text
zsh:1: command not found: flutter
```

Daarna geprobeerd met de expliciete lokale SDK:

```bash
/Users/jan/flutter/bin/flutter analyze
```

Resultaat:

```text
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
/Users/jan/flutter/bin/internal/update_engine_version.sh: line 64: /Users/jan/flutter/bin/cache/engine.stamp: Operation not permitted
```

Conclusie: `flutter analyze` kon hier niet succesvol uitgevoerd worden omdat de sandbox geen write-toegang heeft op de lokale Flutter SDK-cache buiten de workspace.

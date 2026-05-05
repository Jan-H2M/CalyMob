# Stream H Deliverable — 2026-05-05

## Files changed

- `lib/providers/cart_provider.dart`
  - In-memory cart vervangen door `SharedPreferences`-backed cart met `CartProvider.load()`.
  - JSON persistence toegevoegd op `cart_items_v1`.
  - Migration-safe load: invalid/oud formaat wordt gewist.
  - `CartItem.productSnapshot` en `toCallablePayload()` toegevoegd voor checkout/createOrder.

- `lib/screens/boutique/boutique_screen.dart`
  - Placeholder catalog vervangen door real Firestore stream op `clubs/{clubId}/products`.
  - Dynamische categoriechips opgebouwd uit `products.category`.
  - Product cards tonen image, naam en verkoopprijs.
  - Navigatie naar real product detail screen toegevoegd.

- `lib/screens/boutique/boutique_product_detail_screen.dart`
  - Real Firestore product stream toegevoegd.
  - Foto-carrousel via `PageView`.
  - Variant dropdown, stock badge, quantity guard en delivery mode chips toegevoegd.
  - `CartProvider.addItem(...)` gebruikt met real snapshot data.

- `lib/screens/boutique/boutique_checkout_screen.dart`
  - Simulatie verwijderd.
  - Real `FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable('createOrder')` call toegevoegd.
  - Error mapping per `FirebaseFunctionsException.code`.
  - Succes navigeert naar `BoutiqueOrderConfirmationScreen`.

- `lib/screens/boutique/boutique_order_confirmation_screen.dart`
  - Nieuw confirmation/QR scherm toegevoegd.
  - EPC QR render via `qr_flutter`.
  - Fallback EPC payload lokaal opgebouwd wanneer response geen `payment.epcPayload` bevat.
  - Copy actions voor IBAN en communicatie toegevoegd.
  - Cart wordt bij entry gewist.

- `lib/screens/boutique/mes_commandes_screen.dart`
  - Orderslijst houdt Firestore stream aan maar toont nu echte order cards.
  - Drawer toont status badge, itemlijst, payment info en timeline.
  - `Voir QR` knop toegevoegd voor `awaiting_payment`.

- `lib/utils/epc_qr_code.dart`
  - EPC helper afgestemd op de CalyCompta referentie.
  - Structured communication helpers en `buildEpcQrPayload(...)` toegevoegd.

- `lib/main.dart`
  - Async cart bootstrap via `CartProvider.load()`.
  - Route `/boutique/order-confirmation` toegevoegd.

## Dependencies

- Geen nieuwe dependencies toegevoegd.
- `cloud_functions`, `shared_preferences` en `qr_flutter` stonden al in `pubspec.yaml`.

## Validation

`flutter analyze` kon niet worden uitgevoerd in deze sandbox omdat Flutter niet op `PATH` staat.

Uitgevoerde command:

```text
flutter analyze
```

Output:

```text
zsh:1: command not found: flutter
```

Extra check:

```text
git diff --check
```

Resultaat:

```text
Geen whitespace / patch-format fouten gemeld.
```

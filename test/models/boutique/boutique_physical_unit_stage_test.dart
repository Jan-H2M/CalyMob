import "package:calymob/models/boutique/boutique_physical_unit.dart";
import "package:flutter_test/flutter_test.dart";

void main() {
  test("finish shipped_from_jim maps to its stage label", () {
    final unit = BoutiquePhysicalUnit({"id": "p1", "finish": "shipped_from_jim"});
    expect(unit.stage, "Expédié par Jim");
  });
}

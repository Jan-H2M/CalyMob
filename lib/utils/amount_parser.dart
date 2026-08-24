/// Parses a user-entered amount with either a comma or a dot as decimal
/// separator.
double? parseAmount(String value) {
  return double.tryParse(value.trim().replaceAll(',', '.'));
}

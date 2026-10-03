bool canOpenOperationEditor({
  required String? appRole,
  required bool isOriginalCreator,
  required bool isCurrentOrganizer,
}) {
  final role = appRole?.trim().toLowerCase();
  return isOriginalCreator ||
      isCurrentOrganizer ||
      role == 'validateur' ||
      role == 'admin' ||
      role == 'superadmin';
}

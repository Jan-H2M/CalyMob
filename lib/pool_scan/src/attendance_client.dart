import 'package:cloud_functions/cloud_functions.dart';

typedef PoolScanCallable =
    Future<void> Function({
      required String region,
      required String functionName,
      required Map<String, dynamic> data,
    });

/// Records one QR attendance through the pinned pool-scan callable contract.
Future<void> recordPoolQrAttendance({
  required String clubId,
  required String sessionId,
  required String memberId,
  PoolScanCallable? call,
}) async {
  final invoke =
      call ??
      ({required region, required functionName, required data}) async {
        await FirebaseFunctions.instanceFor(
          region: region,
        ).httpsCallable(functionName).call(data);
      };

  await invoke(
    region: 'europe-west1',
    functionName: 'recordPoolQrAttendance',
    data: {'clubId': clubId, 'sessionId': sessionId, 'memberId': memberId},
  );
}

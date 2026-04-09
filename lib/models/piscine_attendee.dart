import 'package:cloud_firestore/cloud_firestore.dart';

/// Model voor een aanwezige bij een piscine sessie
class PiscineAttendee {
  final String id;
  final String memberId;
  final String memberName;
  final DateTime scannedAt;
  final String scannedBy;
  final bool isGuest;
  final String? assignedLevel;
  final String? assignedCourseId;
  final String? assignedToMemberId;
  final String? remarks;

  PiscineAttendee({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.scannedAt,
    required this.scannedBy,
    this.isGuest = false,
    this.assignedLevel,
    this.assignedCourseId,
    this.assignedToMemberId,
    this.remarks,
  });

  factory PiscineAttendee.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return PiscineAttendee(
      id: doc.id,
      memberId: data['memberId'] ?? '',
      memberName: data['memberName'] ?? '',
      scannedAt: (data['scannedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      scannedBy: data['scannedBy'] ?? '',
      isGuest: data['isGuest'] ?? false,
      assignedLevel: data['assignedLevel'],
      assignedCourseId: data['assignedCourseId'],
      assignedToMemberId: data['assignedToMemberId'],
      remarks: data['remarks'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'memberId': memberId,
      'memberName': memberName,
      'scannedAt': Timestamp.fromDate(scannedAt),
      'scannedBy': scannedBy,
      'isGuest': isGuest,
      if (assignedLevel != null) 'assignedLevel': assignedLevel,
      if (assignedCourseId != null) 'assignedCourseId': assignedCourseId,
      if (assignedToMemberId != null) 'assignedToMemberId': assignedToMemberId,
      if (remarks != null) 'remarks': remarks,
    };
  }
}

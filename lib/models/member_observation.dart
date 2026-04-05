import 'package:cloud_firestore/cloud_firestore.dart';

/// Model voor een observatie door een encadrant.
/// Collection: clubs/{clubId}/member_observations/{observationId}
class MemberObservation {
  final String id;
  final String memberId;
  final String memberName;
  final String memberNiveau;

  final String contextType; // 'piscine' | 'plongee' | 'theorie' | 'autre'
  final String contextId;
  final DateTime contextDate;
  final String contextTitle;

  final String category; // 'exercice_lifras' | 'theme_session' | 'technique' | etc.
  final String? exerciceCode;
  final String? exerciceDescription;
  final String? themeId;
  final String? themeTitle;

  final String? result; // 'acquis' | 'en_progres' | 'a_revoir'
  final String note;

  final String observerId;
  final String observerName;
  final DateTime createdAt;
  MemberObservation({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.memberNiveau,
    required this.contextType,
    required this.contextId,
    required this.contextDate,
    required this.contextTitle,
    required this.category,
    this.exerciceCode,
    this.exerciceDescription,
    this.themeId,
    this.themeTitle,
    this.result,
    required this.note,
    required this.observerId,
    required this.observerName,
    required this.createdAt,
  });

  factory MemberObservation.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return MemberObservation(
      id: doc.id,
      memberId: data['memberId'] ?? '',
      memberName: data['memberName'] ?? '',
      memberNiveau: data['memberNiveau'] ?? '',      contextType: data['contextType'] ?? 'piscine',
      contextId: data['contextId'] ?? '',
      contextDate: (data['contextDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      contextTitle: data['contextTitle'] ?? '',
      category: data['category'] ?? 'general',
      exerciceCode: data['exerciceCode'],
      exerciceDescription: data['exerciceDescription'],
      themeId: data['themeId'],
      themeTitle: data['themeTitle'],
      result: data['result'],
      note: data['note'] ?? '',
      observerId: data['observerId'] ?? '',
      observerName: data['observerName'] ?? '',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toMap() => {
    'memberId': memberId,
    'memberName': memberName,
    'memberNiveau': memberNiveau,
    'contextType': contextType,
    'contextId': contextId,
    'contextDate': Timestamp.fromDate(contextDate),
    'contextTitle': contextTitle,
    'category': category,
    if (exerciceCode != null) 'exerciceCode': exerciceCode,
    if (exerciceDescription != null) 'exerciceDescription': exerciceDescription,
    if (themeId != null) 'themeId': themeId,
    if (themeTitle != null) 'themeTitle': themeTitle,    if (result != null) 'result': result,
    'note': note,
    'observerId': observerId,
    'observerName': observerName,
    'createdAt': Timestamp.fromDate(createdAt),
    'updatedAt': Timestamp.now(),
  };
}
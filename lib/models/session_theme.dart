import 'package:cloud_firestore/cloud_firestore.dart';

/// Model voor een sessie-thema uit de catalogus (read-only in CalyMob).
/// Collection: clubs/{clubId}/session_themes/{themeId}
class SessionTheme {
  final String id;
  final String title;
  final String description;
  final String? instructorNotes;
  final String category;
  final List<String> targetNiveaux;
  final String difficulty;
  final List<RelatedExercice> relatedExercices;
  final int timesUsed;
  final DateTime? lastUsedDate;

  SessionTheme({
    required this.id,
    required this.title,
    required this.description,
    this.instructorNotes,
    required this.category,
    required this.targetNiveaux,
    required this.difficulty,
    required this.relatedExercices,
    this.timesUsed = 0,
    this.lastUsedDate,
  });
  factory SessionTheme.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return SessionTheme(
      id: doc.id,
      title: data['title'] ?? '',
      description: data['description'] ?? '',
      instructorNotes: data['instructorNotes'],
      category: data['category'] ?? 'autre',
      targetNiveaux: List<String>.from(data['targetNiveaux'] ?? []),
      difficulty: data['difficulty'] ?? 'intermediaire',
      relatedExercices: (data['relatedExercices'] as List<dynamic>? ?? [])
          .map((e) => RelatedExercice.fromMap(e as Map<String, dynamic>))
          .toList(),
      timesUsed: data['timesUsed'] ?? 0,
      lastUsedDate: (data['lastUsedDate'] as Timestamp?)?.toDate(),
    );
  }
}

/// Exercice LIFRAS lié à un thème
class RelatedExercice {
  final String code;
  final String description;

  RelatedExercice({required this.code, required this.description});

  factory RelatedExercice.fromMap(Map<String, dynamic> map) {
    return RelatedExercice(
      code: map['code'] ?? '',
      description: map['description'] ?? '',
    );
  }
}
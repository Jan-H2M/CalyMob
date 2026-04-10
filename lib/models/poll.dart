import 'package:cloud_firestore/cloud_firestore.dart';

class PollOption {
  final String id;
  final String text;
  final List<String> votes;

  const PollOption({
    required this.id,
    required this.text,
    this.votes = const [],
  });

  factory PollOption.fromMap(Map<String, dynamic> map) {
    return PollOption(
      id: map['id'] ?? '',
      text: map['text'] ?? '',
      votes:
          (map['votes'] as List<dynamic>?)?.map((v) => v.toString()).toList() ??
              const [],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'text': text,
      'votes': votes,
    };
  }

  bool hasVote(String userId) => votes.contains(userId);

  PollOption copyWith({
    String? id,
    String? text,
    List<String>? votes,
  }) {
    return PollOption(
      id: id ?? this.id,
      text: text ?? this.text,
      votes: votes ?? this.votes,
    );
  }
}

class Poll {
  final String question;
  final List<PollOption> options;
  final bool allowMultiple;
  final DateTime? closedAt;

  const Poll({
    required this.question,
    required this.options,
    this.allowMultiple = false,
    this.closedAt,
  });

  factory Poll.fromMap(Map<String, dynamic> map) {
    final closedAtValue = map['closed_at'];
    DateTime? closedAt;
    if (closedAtValue is Timestamp) {
      closedAt = closedAtValue.toDate();
    } else if (closedAtValue is DateTime) {
      closedAt = closedAtValue;
    }

    return Poll(
      question: map['question'] ?? '',
      options: (map['options'] as List<dynamic>?)
              ?.map((option) =>
                  PollOption.fromMap(option as Map<String, dynamic>))
              .toList() ??
          const [],
      allowMultiple: map['allow_multiple'] == true,
      closedAt: closedAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'question': question,
      'options': options.map((option) => option.toMap()).toList(),
      'allow_multiple': allowMultiple,
      'closed_at': closedAt != null ? Timestamp.fromDate(closedAt!) : null,
    };
  }

  bool get isClosed => closedAt != null;

  int get totalVotes =>
      options.fold<int>(0, (total, option) => total + option.votes.length);

  List<String> selectedOptionIds(String userId) {
    return options
        .where((option) => option.hasVote(userId))
        .map((option) => option.id)
        .toList();
  }

  bool hasVoted(String userId) =>
      options.any((option) => option.hasVote(userId));

  Poll copyWith({
    String? question,
    List<PollOption>? options,
    bool? allowMultiple,
    DateTime? closedAt,
    bool clearClosedAt = false,
  }) {
    return Poll(
      question: question ?? this.question,
      options: options ?? this.options,
      allowMultiple: allowMultiple ?? this.allowMultiple,
      closedAt: clearClosedAt ? null : (closedAt ?? this.closedAt),
    );
  }
}

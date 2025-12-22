/// Modèle pour la configuration du calendrier iCal
class CalendarFeed {
  final String feedUrl;
  final String token;
  final DateTime? tokenCreatedAt;

  CalendarFeed({
    required this.feedUrl,
    required this.token,
    this.tokenCreatedAt,
  });

  /// Crée une instance CalendarFeed depuis la réponse JSON de l'API
  factory CalendarFeed.fromJson(Map<String, dynamic> json) {
    return CalendarFeed(
      feedUrl: json['feedUrl'] as String,
      token: json['token'] as String,
      tokenCreatedAt: json['tokenCreatedAt'] != null
          ? DateTime.parse(json['tokenCreatedAt'] as String)
          : null,
    );
  }

  /// Convertit l'instance en Map JSON
  Map<String, dynamic> toJson() {
    return {
      'feedUrl': feedUrl,
      'token': token,
      'tokenCreatedAt': tokenCreatedAt?.toIso8601String(),
    };
  }

  /// Retourne l'URL avec le scheme webcal:// pour iOS
  String get webcalUrl => feedUrl.replaceFirst('https://', 'webcal://');

  /// Copie l'instance avec des valeurs modifiées
  CalendarFeed copyWith({
    String? feedUrl,
    String? token,
    DateTime? tokenCreatedAt,
  }) {
    return CalendarFeed(
      feedUrl: feedUrl ?? this.feedUrl,
      token: token ?? this.token,
      tokenCreatedAt: tokenCreatedAt ?? this.tokenCreatedAt,
    );
  }

  @override
  String toString() {
    return 'CalendarFeed(feedUrl: $feedUrl, token: ${token.substring(0, 8)}...)';
  }
}

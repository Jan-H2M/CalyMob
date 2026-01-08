import 'package:cloud_firestore/cloud_firestore.dart';

class CompatibilitySettings {
  final CalyMobCompatibility calymob;
  final CalyComptaCompatibility calycompta;
  final CompatibilityMessages messages;
  final DateTime? updatedAt;
  final String? updatedBy;

  CompatibilitySettings({
    required this.calymob,
    required this.calycompta,
    required this.messages,
    this.updatedAt,
    this.updatedBy,
  });

  factory CompatibilitySettings.fromFirestore(Map<String, dynamic> data) {
    return CompatibilitySettings(
      calymob: CalyMobCompatibility.fromMap(data['calymob'] ?? {}),
      calycompta: CalyComptaCompatibility.fromMap(data['calycompta'] ?? {}),
      messages: CompatibilityMessages.fromMap(data['messages'] ?? {}),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
      updatedBy: data['updatedBy'] as String?,
    );
  }
}

class CalyMobCompatibility {
  final IosCompatibility ios;
  final AndroidCompatibility android;

  CalyMobCompatibility({
    required this.ios,
    required this.android,
  });

  factory CalyMobCompatibility.fromMap(Map<String, dynamic> map) {
    return CalyMobCompatibility(
      ios: IosCompatibility.fromMap(map['ios'] ?? {}),
      android: AndroidCompatibility.fromMap(map['android'] ?? {}),
    );
  }
}

class IosCompatibility {
  final String minSupported;
  final String minRecommended;
  final String currentTested;

  IosCompatibility({
    required this.minSupported,
    required this.minRecommended,
    required this.currentTested,
  });

  factory IosCompatibility.fromMap(Map<String, dynamic> map) {
    return IosCompatibility(
      minSupported: map['minSupported'] as String? ?? '14.0',
      minRecommended: map['minRecommended'] as String? ?? '16.0',
      currentTested: map['currentTested'] as String? ?? '17.0',
    );
  }
}

class AndroidCompatibility {
  final int minSupported;
  final int minRecommended;
  final int currentTested;

  AndroidCompatibility({
    required this.minSupported,
    required this.minRecommended,
    required this.currentTested,
  });

  factory AndroidCompatibility.fromMap(Map<String, dynamic> map) {
    return AndroidCompatibility(
      minSupported: map['minSupported'] as int? ?? 24,
      minRecommended: map['minRecommended'] as int? ?? 30,
      currentTested: map['currentTested'] as int? ?? 34,
    );
  }
}

class CalyComptaCompatibility {
  final Map<String, BrowserCompatibility> browsers;

  CalyComptaCompatibility({
    required this.browsers,
  });

  factory CalyComptaCompatibility.fromMap(Map<String, dynamic> map) {
    final browsersMap = <String, BrowserCompatibility>{};
    final browsersData = map['browsers'] as Map<String, dynamic>? ?? {};

    browsersData.forEach((key, value) {
      browsersMap[key] = BrowserCompatibility.fromMap(value as Map<String, dynamic>);
    });

    return CalyComptaCompatibility(
      browsers: browsersMap,
    );
  }
}

class BrowserCompatibility {
  final int? minSupported;
  final int? minRecommended;
  final String status;

  BrowserCompatibility({
    this.minSupported,
    this.minRecommended,
    required this.status,
  });

  factory BrowserCompatibility.fromMap(Map<String, dynamic> map) {
    return BrowserCompatibility(
      minSupported: map['minSupported'] as int?,
      minRecommended: map['minRecommended'] as int?,
      status: map['status'] as String? ?? 'untested',
    );
  }
}

class CompatibilityMessages {
  final String unsupported;
  final String warning;
  final String browserUntested;

  CompatibilityMessages({
    required this.unsupported,
    required this.warning,
    required this.browserUntested,
  });

  factory CompatibilityMessages.fromMap(Map<String, dynamic> map) {
    return CompatibilityMessages(
      unsupported: map['unsupported'] as String? ??
        'Jouw apparaat of versie wordt niet ondersteund.',
      warning: map['warning'] as String? ??
        'Er is een nieuwere versie beschikbaar.',
      browserUntested: map['browserUntested'] as String? ??
        'Deze browser is niet officieel getest.',
    );
  }
}

class CompatibilityStatus {
  final bool isCompatible;
  final String warningLevel; // 'none', 'info', 'warning', 'error'
  final String? message;

  CompatibilityStatus({
    required this.isCompatible,
    required this.warningLevel,
    this.message,
  });

  factory CompatibilityStatus.none() {
    return CompatibilityStatus(
      isCompatible: true,
      warningLevel: 'none',
      message: null,
    );
  }

  factory CompatibilityStatus.unsupported(String message) {
    return CompatibilityStatus(
      isCompatible: false,
      warningLevel: 'error',
      message: message,
    );
  }

  factory CompatibilityStatus.warning(String message) {
    return CompatibilityStatus(
      isCompatible: true,
      warningLevel: 'warning',
      message: message,
    );
  }

  factory CompatibilityStatus.info(String message) {
    return CompatibilityStatus(
      isCompatible: true,
      warningLevel: 'info',
      message: message,
    );
  }
}

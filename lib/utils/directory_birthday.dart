import '../models/member_profile.dart';

const directoryBirthdayMonthsFr = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/// Public day/month only; never fall back to the private date or its year.
String? formatDirectoryBirthday(MemberProfile member,
    [List<String> monthNames = directoryBirthdayMonthsFr]) {
  if (!member.shareBirthday) return null;
  final day = member.birthDay;
  final month = member.birthMonth;
  if (day == null || month == null || month < 1 || month > monthNames.length) {
    return null;
  }
  return '$day ${monthNames[month - 1]}';
}

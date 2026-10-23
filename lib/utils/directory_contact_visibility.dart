import '../models/member_profile.dart';

/// Contact buttons in Who's Who may only use the reduced directory profile.
/// Missing legacy preference flags are normalized by MemberProfile; explicit
/// opt-outs remain false at this display boundary.
bool canShowDirectoryEmail(MemberProfile member) {
  return member.shareEmail && member.email.trim().isNotEmpty;
}

bool canShowDirectoryPhone(MemberProfile member) {
  return member.sharePhone && (member.phoneNumber?.trim().isNotEmpty ?? false);
}

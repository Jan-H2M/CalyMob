import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import '../../models/member_profile.dart';
import '../../providers/member_provider.dart';
import '../../providers/exercice_valide_provider.dart';
import '../../utils/live_qa_session_resume.dart';
import '../exercises/member_exercises_screen.dart';

/// Local QA only: render the actual pupil UI using monitor-authorized reads.
/// Scoped data providers do not replace Firebase authentication or the logged-in
/// member provider. No account, role, or member document is changed.
class StudentExerciseComparisonScreen extends StatefulWidget {
  final String clubId;
  final MemberProfile member;
  const StudentExerciseComparisonScreen(
      {super.key, required this.clubId, required this.member});
  @override
  State<StudentExerciseComparisonScreen> createState() =>
      _StudentExerciseComparisonScreenState();
}

class _StudentExerciseComparisonScreenState
    extends State<StudentExerciseComparisonScreen> {
  // Monitors read the deliberately limited directory projection, not another
  // person's private member document. This uses the same real profile source
  // as the monitor's student list and never broadens Firebase permissions.
  final _memberData = MemberProvider.forDirectoryReads();
  ExerciceValideProvider? _exercises;
  bool _loaded = false;
  Future<void>? _loadFuture;
  bool get _allowed => isLiveQaPreviewOrigin(
      enabled: liveQaAutostart, isWeb: kIsWeb, uri: Uri.base);

  @override
  void initState() {
    super.initState();
    if (_allowed) _loadFuture = _load();
  }

  Future<void> _load() async {
    await _memberData.loadMemberData(widget.clubId, widget.member.id);
    if (!mounted) return;
    if (_memberData.isLoadedFor(widget.clubId, widget.member.id)) {
      _exercises = ExerciceValideProvider();
    }
    setState(() => _loaded = true);
  }

  @override
  void dispose() {
    // A pending member read notifies its listeners when it finishes. Keep this
    // scoped provider alive until then if the comparison is closed early.
    if (!_loaded && _loadFuture != null) {
      unawaited(_loadFuture!.whenComplete(_memberData.dispose));
    } else {
      _memberData.dispose();
    }
    _exercises?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_allowed || !_loaded || _exercises == null) {
      return Scaffold(
          appBar: AppBar(title: const Text('Comparaison élève')),
          body: Center(
              child: !_allowed
                  ? const Text(
                      'Comparaison disponible uniquement dans la preview locale.')
                  : !_loaded
                      ? const CircularProgressIndicator()
                      : const Text(
                          'Lecture du profil impossible. Aucune identité n’a été changée.')));
    }
    return MultiProvider(
        providers: [
          ChangeNotifierProvider<MemberProvider>.value(value: _memberData),
          ChangeNotifierProvider<ExerciceValideProvider>.value(
              value: _exercises!),
        ],
        child: MemberExercisesScreen(
            memberId: widget.member.id,
            memberName: '${widget.member.prenom} ${widget.member.nom}',
            isOwnProfile: true,
            comparisonReadOnly: true));
  }
}

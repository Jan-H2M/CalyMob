import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../config/app_colors.dart';
import '../models/member_profile.dart';
import '../models/piscine_attendee.dart';
import '../models/participant_operation.dart';
import '../providers/auth_provider.dart';
import '../services/member_service.dart';
import '../services/piscine_session_service.dart';
import '../services/operation_service.dart';
import '../config/firebase_config.dart';
import '../screens/piscine/add_attendee_dialog.dart';
import 'alarm_overlay.dart';

/// Scanner modal that shows compact scanner + live attendee list
/// With validation for medical certificate and cotisation
class ScannerModalSheet extends StatefulWidget {
  final String clubId;
  final String operationId;
  final String operationTitle;
  final bool isPiscine;

  /// Fin de l'événement (ou date de la sessie piscine). Sert à déterminer
  /// jusqu'à quand un participant scanné par erreur peut être désinscrit
  /// (= jusqu'à la fin du jour de `eventEndDate`). Si null, la désinscription
  /// reste toujours possible.
  final DateTime? eventEndDate;

  const ScannerModalSheet({
    super.key,
    required this.clubId,
    required this.operationId,
    required this.operationTitle,
    this.isPiscine = false,
    this.eventEndDate,
  });

  /// Show the scanner modal as a bottom sheet
  static Future<void> show({
    required BuildContext context,
    required String clubId,
    required String operationId,
    required String operationTitle,
    bool isPiscine = false,
    DateTime? eventEndDate,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ScannerModalSheet(
        clubId: clubId,
        operationId: operationId,
        operationTitle: operationTitle,
        isPiscine: isPiscine,
        eventEndDate: eventEndDate,
      ),
    );
  }

  @override
  State<ScannerModalSheet> createState() => _ScannerModalSheetState();
}

class _ScannerModalSheetState extends State<ScannerModalSheet> {
  final MemberService _memberService = MemberService();
  final PiscineSessionService _piscineService = PiscineSessionService();
  final OperationService _operationService = OperationService();

  late final MobileScannerController _scannerController;

  bool _isProcessing = false;
  String? _lastScannedId;
  String? _successMessage;
  String? _lastAddedName;

  // Manual search state
  bool _showSearch = false;
  bool _isSearching = false;
  List<MemberProfile> _searchResults = [];
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _scannerController = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
      torchEnabled: false,
    );
  }

  @override
  void dispose() {
    _scannerController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_isProcessing) return;

    final code = capture.barcodes.firstOrNull?.rawValue;
    if (code == null || code.isEmpty) return;

    // Prevent double-scan of same QR
    if (code == _lastScannedId) return;

    setState(() {
      _isProcessing = true;
      _lastScannedId = code;
    });

    try {
      await _processScannedMember(code);
    } catch (e) {
      _showErrorToast(e.toString());
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }

      // Reset last scanned after 3 seconds to allow re-scan
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _lastScannedId = null);
      });
    }
  }

  Future<void> _processScannedMember(String memberId) async {
    final authProvider = context.read<AuthProvider>();
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName ?? 'Inconnu';

    if (currentUser == null) {
      throw Exception('Vous devez être connecté');
    }

    // 1. Get member info
    final member = await _memberService.getMemberById(widget.clubId, memberId);
    if (member == null) {
      throw Exception('Membre non trouvé');
    }

    // 2. Check if already present
    bool alreadyPresent;
    if (widget.isPiscine) {
      alreadyPresent = await _piscineService.isAttendeePresent(
        clubId: widget.clubId,
        sessionId: widget.operationId,
        memberId: memberId,
      );
    } else {
      final inscription = await _operationService.getUserInscription(
        clubId: widget.clubId,
        operationId: widget.operationId,
        userId: memberId,
      );
      alreadyPresent = inscription?.present ?? false;
    }

    if (alreadyPresent) {
      // Show "already registered" message
      _showAlreadyRegisteredToast(member.fullName);
      return;
    }

    // 3. VALIDATE: Check cotisation AND certificat médical
    //
    // Blocking states (red alarm, entry refused): expired or missing.
    // Warning state (orange overlay, operator confirms): expires within 30 days.
    bool isBlocking(ValidationStatus s) =>
        s == ValidationStatus.expired || s == ValidationStatus.missing;
    bool isWarning(ValidationStatus s) => s == ValidationStatus.warning;

    final cotisationStatus = member.cotisationStatus;
    final certificatStatus = member.certificatStatus;

    final hasBlocking =
        isBlocking(cotisationStatus) || isBlocking(certificatStatus);
    final hasWarning =
        isWarning(cotisationStatus) || isWarning(certificatStatus);

    if (hasBlocking) {
      // Red ACCÈS REFUSÉ overlay — blocks entry.
      if (mounted) {
        await AlarmOverlay.show(
          context,
          member,
          severity: AlarmSeverity.critical,
        );
      }
      return;
    }

    if (hasWarning) {
      // Orange ATTENTION overlay — operator may confirm or cancel.
      if (!mounted) return;
      final proceed = await AlarmOverlay.show(
        context,
        member,
        severity: AlarmSeverity.warning,
      );
      if (proceed != true) return;
    }

    // 4. All OK - register the member
    if (widget.isPiscine) {
      await _piscineService.addAttendee(
        clubId: widget.clubId,
        sessionId: widget.operationId,
        memberId: memberId,
        memberName: member.fullName,
        scannedBy: currentUser.uid,
      );
    } else {
      // Check if member has inscription
      final inscription = await _operationService.getUserInscription(
        clubId: widget.clubId,
        operationId: widget.operationId,
        userId: memberId,
      );

      if (inscription != null) {
        // Mark existing inscription as present
        await _operationService.markAsPresent(
          clubId: widget.clubId,
          operationId: widget.operationId,
          memberId: memberId,
          markedByUserId: currentUser.uid,
          markedByUserName: displayName,
        );
      } else {
        // Create walk-in inscription
        await _operationService.createWalkInInscription(
          clubId: widget.clubId,
          operationId: widget.operationId,
          operationTitle: widget.operationTitle,
          member: member,
          markedByUserId: currentUser.uid,
          markedByUserName: displayName,
        );
      }
    }

    // 5. Show success feedback
    _showSuccessToast(member.fullName);
  }

  void _showSuccessToast(String memberName) {
    setState(() {
      _successMessage = 'Enregistré!';
      _lastAddedName = memberName;
    });
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() {
          _successMessage = null;
          _lastAddedName = null;
        });
      }
    });
  }

  void _showAlreadyRegisteredToast(String memberName) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.info, color: Colors.white, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    memberName,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Text(
                    'Déjà enregistré',
                    style: TextStyle(fontSize: 12, color: Colors.white70),
                  ),
                ],
              ),
            ),
          ],
        ),
        backgroundColor: AppColors.middenblauw,
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (_showSearch) {
        _searchController.clear();
        _searchResults.clear();
        // Pause scanner when searching
        _scannerController.stop();
        Future.microtask(() => _searchFocusNode.requestFocus());
      } else {
        _searchFocusNode.unfocus();
        _scannerController.start();
      }
    });
  }

  Future<void> _searchMembers(String query) async {
    if (query.length < 2) {
      setState(() => _searchResults = []);
      return;
    }

    setState(() => _isSearching = true);

    try {
      final results = await _memberService.searchMembers(widget.clubId, query);
      if (mounted) {
        setState(() {
          _searchResults = results;
          _isSearching = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isSearching = false);
    }
  }

  Future<void> _selectMember(MemberProfile member) async {
    setState(() {
      _showSearch = false;
      _isProcessing = true;
    });

    try {
      await _processScannedMember(member.id);
    } catch (e) {
      _showErrorToast(e.toString());
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
        _scannerController.start();
      }
    }
  }

  /// Ouvrir le dialog pour ajouter un invité (non-membre)
  Future<void> _showAddAttendeeDialog() async {
    final authProvider = context.read<AuthProvider>();
    final currentUser = authProvider.currentUser;
    if (currentUser == null) return;

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddAttendeeDialog(clubId: widget.clubId),
    );

    if (result != null && mounted) {
      try {
        if (widget.isPiscine) {
          await _piscineService.addAttendee(
            clubId: widget.clubId,
            sessionId: widget.operationId,
            memberId: result['memberId'] as String,
            memberName: result['memberName'] as String,
            scannedBy: currentUser.uid,
            isGuest: result['isGuest'] as bool,
          );
        } else {
          final member = await _memberService.getMemberById(
            widget.clubId, result['memberId'] as String);
          if (member != null) {
            final displayName = authProvider.displayName ?? 'Inconnu';
            await _operationService.createWalkInInscription(
              clubId: widget.clubId,
              operationId: widget.operationId,
              operationTitle: widget.operationTitle,
              member: member,
              markedByUserId: currentUser.uid,
              markedByUserName: displayName,
            );
          }
        }
        _showSuccessToast(result['memberName'] as String);
      } catch (e) {
        _showErrorToast(e.toString());
      }
    }
  }

  void _showErrorToast(String error) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(error),
        backgroundColor: Colors.red,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  // ========== UITSCHRIJVEN (correction d'erreur de scan) ==========

  /// Vérifie si la désinscription est encore possible : jusqu'à la fin du jour
  /// de [widget.eventEndDate] inclus. Si `eventEndDate` est null → toujours
  /// autorisé.
  bool _canUnregister() {
    final endDate = widget.eventEndDate;
    if (endDate == null) return true;
    final endOfDay = DateTime(endDate.year, endDate.month, endDate.day, 23, 59, 59);
    return DateTime.now().isBefore(endOfDay);
  }

  /// Affiche le dialog de confirmation avant de désinscrire.
  Future<bool> _confirmUnregister(String memberName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Désinscrire ?'),
        content: Text(
          'Annuler l\'enregistrement de $memberName ? '
          'Cette action retire son scan de la liste de présence.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Désinscrire'),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  /// Désinscription d'un attendee piscine avec undo.
  /// La confirmation est déjà gérée par [Dismissible.confirmDismiss],
  /// donc on saute directement à l'action.
  Future<void> _unregisterPiscineAttendee(PiscineAttendee attendee) async {
    if (!mounted) return;

    // Snapshot pour undo
    final snapshotData = attendee.toMap();
    try {
      await _piscineService.removeAttendee(
        clubId: widget.clubId,
        sessionId: widget.operationId,
        attendeeId: attendee.id,
      );
    } catch (e) {
      if (mounted) _showErrorToast('Erreur: ${e.toString()}');
      return;
    }

    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('${attendee.memberName} désinscrit'),
          backgroundColor: Colors.orange,
          duration: const Duration(seconds: 5),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          action: SnackBarAction(
            label: 'Annuler',
            textColor: Colors.white,
            onPressed: () async {
              try {
                await _piscineService.restoreAttendee(
                  clubId: widget.clubId,
                  sessionId: widget.operationId,
                  attendeeId: attendee.id,
                  data: snapshotData,
                );
              } catch (e) {
                if (mounted) _showErrorToast('Impossible d\'annuler: $e');
              }
            },
          ),
        ),
      );
  }

  /// Désinscription d'un participant événement avec undo.
  /// La confirmation est déjà gérée par [Dismissible.confirmDismiss].
  Future<void> _unregisterOperationParticipant(ParticipantOperation participant) async {
    final name =
        '${participant.membrePrenom ?? ''} ${participant.membreNom ?? ''}'.trim();
    final displayName = name.isEmpty ? 'ce participant' : name;

    if (!mounted) return;

    UnmarkPresentResult result;
    try {
      result = await _operationService.unmarkAsPresent(
        clubId: widget.clubId,
        operationId: widget.operationId,
        memberId: participant.membreId,
      );
    } catch (e) {
      if (mounted) _showErrorToast('Erreur: ${e.toString()}');
      return;
    }

    if (!mounted) return;
    final message = result.deletedInscription
        ? '$displayName désinscrit'
        : 'Présence annulée pour $displayName';

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.orange,
          duration: const Duration(seconds: 5),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          action: SnackBarAction(
            label: 'Annuler',
            textColor: Colors.white,
            onPressed: () async {
              try {
                await _operationService.restoreFromUnmark(
                  clubId: widget.clubId,
                  operationId: widget.operationId,
                  result: result,
                );
              } catch (e) {
                if (mounted) _showErrorToast('Impossible d\'annuler: $e');
              }
            },
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.95,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Header with close button and title
          _buildHeader(),

          // Compact Scanner or Manual Search (~35%)
          Expanded(
            flex: 35,
            child: _showSearch ? _buildSearchView() : _buildCompactScanner(),
          ),

          // Divider with count
          _buildDividerWithCount(),

          // Live Attendee List (~65%)
          Expanded(
            flex: 65,
            child: _buildAttendeeList(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.middenblauw,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Row(
        children: [
          // Close button
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close, color: Colors.white, size: 28),
            tooltip: 'Fermer',
          ),

          // Title (centered)
          Expanded(
            child: Text(
              'Scanner Présence',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),

          // Manual search toggle
          IconButton(
            onPressed: _toggleSearch,
            icon: Icon(
              _showSearch ? Icons.qr_code_scanner : Icons.search,
              color: _showSearch ? AppColors.oranje : Colors.white,
              size: 28,
            ),
            tooltip: _showSearch ? 'Scanner' : 'Recherche manuelle',
          ),

          // Ajouter un participant (membre ou invité)
          IconButton(
            onPressed: _showAddAttendeeDialog,
            icon: const Icon(Icons.person_add, color: Colors.white, size: 26),
            tooltip: 'Ajouter un participant',
          ),

          // Torch toggle
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _scannerController,
            builder: (context, state, child) {
              final torchOn = state.torchState == TorchState.on;
              return IconButton(
                onPressed: () => _scannerController.toggleTorch(),
                icon: Icon(
                  torchOn ? Icons.flash_on : Icons.flash_off,
                  color: torchOn ? AppColors.oranje : Colors.white70,
                  size: 28,
                ),
                tooltip: 'Lampe',
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildCompactScanner() {
    return Stack(
      children: [
        // Camera
        ClipRRect(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: MobileScanner(
                controller: _scannerController,
                onDetect: _handleBarcode,
                errorBuilder: (context, error, child) {
                  debugPrint('📷 Scanner error: ${error.errorCode} - ${error.errorDetails?.message}');
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error, color: Colors.red, size: 48),
                        const SizedBox(height: 16),
                        Text(
                          'Camera error: ${error.errorCode.name}',
                          style: const TextStyle(color: Colors.red),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          error.errorDetails?.message ?? 'Vérifiez les permissions caméra',
                          style: const TextStyle(color: Colors.grey, fontSize: 12),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ),

        // Scan frame overlay
        Center(
          child: Container(
            width: 180,
            height: 180,
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.oranje, width: 3),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Stack(
              children: [
                // Corner indicators
                Positioned(top: 0, left: 0, child: _buildCorner(true, true)),
                Positioned(top: 0, right: 0, child: _buildCorner(true, false)),
                Positioned(bottom: 0, left: 0, child: _buildCorner(false, true)),
                Positioned(bottom: 0, right: 0, child: _buildCorner(false, false)),
              ],
            ),
          ),
        ),

        // Processing indicator
        if (_isProcessing)
          Container(
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          ),

        // Success toast overlay
        if (_successMessage != null)
          Positioned(
            top: 24,
            left: 24,
            right: 24,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.success,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.white, size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _lastAddedName ?? '',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        Text(
                          _successMessage!,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildSearchView() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Search field
          TextField(
            controller: _searchController,
            focusNode: _searchFocusNode,
            onChanged: _searchMembers,
            decoration: InputDecoration(
              hintText: 'Rechercher un membre...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _searchMembers('');
                      },
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: Colors.grey[100],
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
          const SizedBox(height: 8),

          // Results
          Expanded(
            child: _isSearching
                ? const Center(child: CircularProgressIndicator())
                : _searchResults.isEmpty
                    ? Center(
                        child: Text(
                          _searchController.text.length < 2
                              ? 'Tapez au moins 2 caractères'
                              : 'Aucun résultat',
                          style: TextStyle(color: Colors.grey[500], fontSize: 14),
                        ),
                      )
                    : ListView.builder(
                        itemCount: _searchResults.length,
                        itemBuilder: (context, index) {
                          final member = _searchResults[index];
                          final cotisationOk = member.cotisationStatus == ValidationStatus.valid;
                          final certificatOk = member.certificatStatus == ValidationStatus.valid;
                          return ListTile(
                            dense: true,
                            leading: CircleAvatar(
                              backgroundColor: AppColors.middenblauw,
                              radius: 18,
                              child: Text(
                                member.fullName.isNotEmpty
                                    ? member.fullName[0].toUpperCase()
                                    : '?',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            title: Text(
                              member.fullName,
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                            ),
                            subtitle: Row(
                              children: [
                                Icon(
                                  cotisationOk ? Icons.check_circle : Icons.cancel,
                                  size: 14,
                                  color: cotisationOk ? AppColors.success : Colors.red,
                                ),
                                const SizedBox(width: 4),
                                Text('Cotisation', style: TextStyle(fontSize: 11, color: Colors.grey[600])),
                                const SizedBox(width: 10),
                                Icon(
                                  certificatOk ? Icons.check_circle : Icons.cancel,
                                  size: 14,
                                  color: certificatOk ? AppColors.success : Colors.red,
                                ),
                                const SizedBox(width: 4),
                                Text('Certificat', style: TextStyle(fontSize: 11, color: Colors.grey[600])),
                              ],
                            ),
                            onTap: () => _selectMember(member),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCorner(bool isTop, bool isLeft) {
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        border: Border(
          top: isTop
              ? const BorderSide(color: AppColors.oranje, width: 4)
              : BorderSide.none,
          bottom: !isTop
              ? const BorderSide(color: AppColors.oranje, width: 4)
              : BorderSide.none,
          left: isLeft
              ? const BorderSide(color: AppColors.oranje, width: 4)
              : BorderSide.none,
          right: !isLeft
              ? const BorderSide(color: AppColors.oranje, width: 4)
              : BorderSide.none,
        ),
      ),
    );
  }

  Widget _buildDividerWithCount() {
    return StreamBuilder(
      stream: widget.isPiscine
          ? _piscineService.getAttendeesStream(widget.clubId, widget.operationId)
          : _operationService.getPresentParticipantsStream(
              widget.clubId, widget.operationId),
      builder: (context, snapshot) {
        final count = (snapshot.data as List?)?.length ?? 0;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            border: Border(
              top: BorderSide(color: Colors.grey[200]!),
              bottom: BorderSide(color: Colors.grey[200]!),
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.people, color: AppColors.success, size: 22),
              const SizedBox(width: 8),
              Text(
                'Présents',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.donkerblauw,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.success,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$count',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildAttendeeList() {
    if (widget.isPiscine) {
      return StreamBuilder<List<PiscineAttendee>>(
        stream: _piscineService.getAttendeesStream(
            widget.clubId, widget.operationId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final attendees = snapshot.data ?? [];
          if (attendees.isEmpty) {
            return _buildEmptyState();
          }

          // Sort by scannedAt descending (newest first)
          final sortedAttendees = List<PiscineAttendee>.from(attendees)
            ..sort((a, b) => b.scannedAt.compareTo(a.scannedAt));

          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: sortedAttendees.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final attendee = sortedAttendees[index];
              final isLatest = index == 0 && _lastAddedName == attendee.memberName;
              final card = _buildPiscineAttendeeCard(attendee, isLatest);
              if (!_canUnregister()) return card;
              return Dismissible(
                key: ValueKey('piscine-${attendee.id}'),
                direction: DismissDirection.endToStart,
                background: _buildDismissBackground(),
                confirmDismiss: (_) => _confirmUnregister(attendee.memberName),
                onDismissed: (_) => _unregisterPiscineAttendee(attendee),
                child: card,
              );
            },
          );
        },
      );
    } else {
      return StreamBuilder<List<ParticipantOperation>>(
        stream: _operationService.getPresentParticipantsStream(
            widget.clubId, widget.operationId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final participants = snapshot.data ?? [];
          if (participants.isEmpty) {
            return _buildEmptyState();
          }

          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: participants.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final participant = participants[index];
              final name =
                  '${participant.membrePrenom ?? ''} ${participant.membreNom ?? ''}'
                      .trim();
              final isLatest = index == 0 && _lastAddedName == name;
              final card = _buildOperationParticipantCard(participant, isLatest);
              if (!_canUnregister()) return card;
              final displayName = name.isEmpty ? 'ce participant' : name;
              return Dismissible(
                key: ValueKey('op-${participant.membreId}'),
                direction: DismissDirection.endToStart,
                background: _buildDismissBackground(),
                confirmDismiss: (_) => _confirmUnregister(displayName),
                onDismissed: (_) => _unregisterOperationParticipant(participant),
                child: card,
              );
            },
          );
        },
      );
    }
  }

  /// Fond rouge affiché lors du swipe pour désinscrire.
  Widget _buildDismissBackground() {
    return Container(
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.red,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Text(
            'Désinscrire',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
          SizedBox(width: 8),
          Icon(Icons.person_remove, color: Colors.white, size: 24),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.qr_code_scanner, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 12),
          Text(
            'Scannez le premier participant',
            style: TextStyle(
              color: Colors.grey[600],
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'La liste apparaîtra ici',
            style: TextStyle(
              color: Colors.grey[400],
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPiscineAttendeeCard(PiscineAttendee attendee, bool isLatest) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isLatest ? AppColors.success.withOpacity(0.1) : Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isLatest ? AppColors.success : Colors.grey[200]!,
          width: isLatest ? 2 : 1,
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor:
                isLatest ? AppColors.success : AppColors.middenblauw,
            radius: 20,
            child: Text(
              attendee.memberName.isNotEmpty
                  ? attendee.memberName[0].toUpperCase()
                  : '?',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              attendee.memberName,
              style: TextStyle(
                fontWeight: isLatest ? FontWeight.bold : FontWeight.normal,
                fontSize: 15,
              ),
            ),
          ),
          if (attendee.isGuest)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.orange.withOpacity(0.3)),
              ),
              child: const Text(
                'Invité',
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.orange,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          Text(
            _formatTime(attendee.scannedAt),
            style: TextStyle(
              color: Colors.grey[500],
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOperationParticipantCard(
      ParticipantOperation participant, bool isLatest) {
    final name =
        '${participant.membrePrenom ?? ''} ${participant.membreNom ?? ''}'.trim();

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isLatest ? AppColors.success.withOpacity(0.1) : Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isLatest ? AppColors.success : Colors.grey[200]!,
          width: isLatest ? 2 : 1,
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor:
                isLatest ? AppColors.success : AppColors.middenblauw,
            radius: 20,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              style: TextStyle(
                fontWeight: isLatest ? FontWeight.bold : FontWeight.normal,
                fontSize: 15,
              ),
            ),
          ),
          if (participant.isGuest)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.orange.withOpacity(0.3)),
              ),
              child: const Text(
                'Invité',
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.orange,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          if (participant.presentAt != null)
            Text(
              _formatTime(participant.presentAt!),
              style: TextStyle(
                color: Colors.grey[500],
                fontSize: 12,
              ),
            ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }
}

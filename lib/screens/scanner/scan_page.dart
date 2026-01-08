import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../models/member_profile.dart';
import '../../models/attendance_record.dart';
import '../../models/participant_operation.dart';
import '../../providers/auth_provider.dart';
import '../../services/member_service.dart';
import '../../services/attendance_service.dart';
import '../../services/operation_service.dart';
import '../../services/piscine_session_service.dart';
import 'member_validation_card.dart';

/// Scanner page for member check-in with QR code scanning
///
/// Three modes:
/// 1. Event with inscriptions: Mark existing inscription as "present"
/// 2. Event without required inscription: Create attendance record
/// 3. Piscine mode: Add to piscine session attendees
class ScanPage extends StatefulWidget {
  final String clubId;
  final String operationId;
  final String operationTitle;
  final bool isPiscine;

  const ScanPage({
    Key? key,
    required this.clubId,
    required this.operationId,
    required this.operationTitle,
    this.isPiscine = false,
  }) : super(key: key);

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final MemberService _memberService = MemberService();
  final AttendanceService _attendanceService = AttendanceService();
  final OperationService _operationService = OperationService();
  final PiscineSessionService _piscineService = PiscineSessionService();
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );

  // State
  bool _isScanning = true;
  bool _isLoading = false;
  bool _isCheckingIn = false;
  MemberProfile? _scannedMember;
  ParticipantOperation? _memberInscription; // Inscription for this event
  bool _alreadyPresent = false; // Already marked present
  String? _errorMessage;
  String _scanMethod = 'qr';

  // Search
  final TextEditingController _searchController = TextEditingController();
  List<MemberProfile> _searchResults = [];
  bool _isSearching = false;
  bool _showSearch = false;

  @override
  void dispose() {
    _scannerController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (!_isScanning || _isLoading) return;

    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final String? code = barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;

    setState(() {
      _isScanning = false;
      _isLoading = true;
      _errorMessage = null;
      _scanMethod = 'qr';
    });

    await _lookupMember(code);
  }

  Future<void> _lookupMember(String memberId) async {
    debugPrint('🔍 Looking up member: $memberId');
    try {
      final member = await _memberService.getMemberById(widget.clubId, memberId);

      if (member == null) {
        debugPrint('❌ Membre non trouvé: $memberId');
        setState(() {
          _isLoading = false;
          _errorMessage = 'Membre non trouvé';
          _scannedMember = null;
          _memberInscription = null;
        });
        return;
      }

      debugPrint('✅ Membre trouvé: ${member.fullName} (${member.id})');

      // PISCINE MODE: Simpler logic - just check if already present
      if (widget.isPiscine) {
        await _lookupMemberPiscine(member);
        return;
      }

      // OPERATION MODE: Check inscriptions
      // Check if member is inscribed for this event
      final inscription = await _operationService.getUserInscription(
        clubId: widget.clubId,
        operationId: widget.operationId,
        userId: memberId,
      );

      // Check if already marked present (only from inscription, not attendance)
      // We want to allow creating inscriptions for people scanned before
      bool alreadyPresent = false;
      if (inscription != null) {
        // Check the present field on the inscription
        alreadyPresent = inscription.present ?? false;
      }
      // Note: We no longer check attendance collection - if they're not inscribed,
      // we want to create an inscription for them

      debugPrint('📋 alreadyPresent: $alreadyPresent, inscription: ${inscription != null}');

      // Check if both cotisation and certificat are valid for auto-registration
      final cotisationValid = member.cotisationStatus == ValidationStatus.valid;
      final certificatValid = member.certificatStatus == ValidationStatus.valid;
      final bothValid = cotisationValid && certificatValid;

      debugPrint('🟢 Auto-register check: cotisation=$cotisationValid, certificat=$certificatValid, bothValid=$bothValid, alreadyPresent=$alreadyPresent');

      if (bothValid) {
        if (alreadyPresent) {
          // Already registered - show toast and go back to scanner
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Row(
                  children: [
                    const Icon(Icons.info, color: Colors.white, size: 32),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            member.fullName,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const Text(
                            'Déjà enregistré',
                            style: TextStyle(fontSize: 14, color: Colors.white70),
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
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            );
            _resetScanner();
          }
        } else {
          // Auto-register immediately when both are valid
          setState(() {
            _isLoading = false;
            _scannedMember = member;
            _memberInscription = inscription;
            _alreadyPresent = alreadyPresent;
          });
          // Trigger auto-registration
          await _autoRegisterMember(member, inscription);
        }
      } else {
        // Show validation card for manual review (cotisation or certificat not valid)
        setState(() {
          _isLoading = false;
          _scannedMember = member;
          _memberInscription = inscription;
          _alreadyPresent = alreadyPresent;
        });
      }
    } catch (e) {
      debugPrint('❌ Erreur lookup: $e');
      setState(() {
        _isLoading = false;
        _errorMessage = 'Erreur: ${e.toString()}';
      });
    }
  }

  /// Piscine mode: simpler lookup - just check if already present and auto-register
  Future<void> _lookupMemberPiscine(MemberProfile member) async {
    final authProvider = context.read<AuthProvider>();
    final currentUser = authProvider.currentUser;

    if (currentUser == null) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Vous devez être connecté';
      });
      return;
    }

    // Check if already present
    final alreadyPresent = await _piscineService.isAttendeePresent(
      clubId: widget.clubId,
      sessionId: widget.operationId,
      memberId: member.id,
    );

    if (alreadyPresent) {
      // Already registered - show toast and go back to scanner
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.info, color: Colors.white, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member.fullName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const Text(
                        'Déjà enregistré',
                        style: TextStyle(fontSize: 14, color: Colors.white70),
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
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        _resetScanner();
      }
      return;
    }

    // Auto-register for piscine (no validation checks needed)
    try {
      await _piscineService.addAttendee(
        clubId: widget.clubId,
        sessionId: widget.operationId,
        memberId: member.id,
        memberName: member.fullName,
        scannedBy: currentUser.uid,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member.fullName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const Text(
                        'Présence enregistrée',
                        style: TextStyle(fontSize: 14, color: Colors.white70),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            backgroundColor: AppColors.success,
            duration: const Duration(seconds: 2),
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        _resetScanner();
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Erreur: ${e.toString()}';
      });
    }
  }

  /// Auto-register member when both cotisation and certificat are valid
  Future<void> _autoRegisterMember(MemberProfile member, ParticipantOperation? inscription) async {
    final authProvider = context.read<AuthProvider>();
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName ?? 'Inconnu';

    if (currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vous devez être connecté'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      if (inscription != null) {
        // Member is inscribed - mark the inscription as present
        await _operationService.markAsPresent(
          clubId: widget.clubId,
          operationId: widget.operationId,
          memberId: member.id,
          markedByUserId: currentUser.uid,
          markedByUserName: displayName,
        );
      } else {
        // No inscription - create inscription with present=true (walk-in)
        await _operationService.createWalkInInscription(
          clubId: widget.clubId,
          operationId: widget.operationId,
          operationTitle: widget.operationTitle,
          member: member,
          markedByUserId: currentUser.uid,
          markedByUserName: displayName,
        );
      }

      if (mounted) {
        // Show big success toast
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member.fullName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const Text(
                        'Enregistré avec succès',
                        style: TextStyle(fontSize: 14, color: Colors.white70),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            backgroundColor: AppColors.success,
            duration: const Duration(seconds: 2),
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );

        // Reset to scanning mode immediately
        _resetScanner();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _recordAttendance() async {
    if (_scannedMember == null || _isCheckingIn) return;

    final authProvider = context.read<AuthProvider>();
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName ?? 'Inconnu';

    if (currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vous devez être connecté'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isCheckingIn = true;
    });

    try {
      if (_memberInscription != null) {
        // Member is inscribed - mark the inscription as present
        await _operationService.markAsPresent(
          clubId: widget.clubId,
          operationId: widget.operationId,
          memberId: _scannedMember!.id,
          markedByUserId: currentUser.uid,
          markedByUserName: displayName,
        );
      } else {
        // No inscription - create inscription with present=true (walk-in)
        await _operationService.createWalkInInscription(
          clubId: widget.clubId,
          operationId: widget.operationId,
          operationTitle: widget.operationTitle,
          member: _scannedMember!,
          markedByUserId: currentUser.uid,
          markedByUserName: displayName,
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_scannedMember!.fullName} enregistré ✓'),
            backgroundColor: AppColors.success,
          ),
        );

        // Reset to scanning mode
        _resetScanner();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isCheckingIn = false;
        });
      }
    }
  }

  void _resetScanner() {
    setState(() {
      _isScanning = true;
      _scannedMember = null;
      _memberInscription = null;
      _alreadyPresent = false;
      _errorMessage = null;
      _showSearch = false;
      _searchController.clear();
      _searchResults.clear();
    });
  }

  Future<void> _searchMembers(String query) async {
    if (query.length < 2) {
      setState(() {
        _searchResults = [];
      });
      return;
    }

    setState(() {
      _isSearching = true;
    });

    try {
      final results = await _memberService.searchMembers(widget.clubId, query);
      setState(() {
        _searchResults = results;
        _isSearching = false;
      });
    } catch (e) {
      setState(() {
        _isSearching = false;
      });
    }
  }

  void _selectMember(MemberProfile member) async {
    setState(() {
      _showSearch = false;
      _isLoading = true;
      _isScanning = false;
      _scanMethod = 'manual';
    });

    await _lookupMember(member.id);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Scanner or validation display
        Expanded(
          child: _showSearch
              ? _buildSearchView()
              : _scannedMember != null
                  ? _buildValidationView()
                  : _buildScannerView(),
        ),

        // Bottom controls
        _buildBottomControls(),
      ],
    );
  }

  Widget _buildScannerView() {
    return Stack(
      children: [
        // Camera preview
        MobileScanner(
          controller: _scannerController,
          onDetect: _handleBarcode,
        ),

        // Scan overlay
        _buildScanOverlay(),

        // Loading indicator
        if (_isLoading)
          Container(
            color: Colors.black54,
            child: const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ),
          ),

        // Error message
        if (_errorMessage != null)
          Positioned(
            bottom: 100,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red[900],
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error, color: Colors.white),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () {
                      setState(() {
                        _errorMessage = null;
                        _isScanning = true;
                      });
                    },
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildScanOverlay() {
    return Column(
      children: [
        // Top instruction
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          color: Colors.black54,
          child: const SafeArea(
            bottom: false,
            child: Text(
              'Scannez le QR code du membre',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),

        // Scan area indicator
        Expanded(
          child: Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(
                  color: Colors.white.withOpacity(0.5),
                  width: 2,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Stack(
                children: [
                  // Corner indicators
                  Positioned(
                    top: 0,
                    left: 0,
                    child: _buildCorner(true, true),
                  ),
                  Positioned(
                    top: 0,
                    right: 0,
                    child: _buildCorner(true, false),
                  ),
                  Positioned(
                    bottom: 0,
                    left: 0,
                    child: _buildCorner(false, true),
                  ),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: _buildCorner(false, false),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCorner(bool isTop, bool isLeft) {
    return Container(
      width: 30,
      height: 30,
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

  Widget _buildValidationView() {
    return Container(
      color: Colors.black87,
      padding: const EdgeInsets.all(20),
      child: Center(
        child: SingleChildScrollView(
          child: MemberValidationCard(
            member: _scannedMember!,
            onCheckIn: _alreadyPresent ? null : _recordAttendance,
            isLoading: _isCheckingIn,
            alreadyCheckedIn: _alreadyPresent,
            isInscribed: _memberInscription != null,
          ),
        ),
      ),
    );
  }

  Widget _buildSearchView() {
    return Container(
      color: AppColors.backgroundGrey,
      child: Column(
        children: [
          // Search input
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Rechercher un membre...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _searchResults = [];
                          });
                        },
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
                fillColor: AppColors.surfaceGrey,
              ),
              onChanged: _searchMembers,
            ),
          ),

          // Search results
          Expanded(
            child: _isSearching
                ? const Center(child: CircularProgressIndicator())
                : _searchResults.isEmpty
                    ? Center(
                        child: Text(
                          _searchController.text.length < 2
                              ? 'Tapez au moins 2 caractères'
                              : 'Aucun résultat',
                          style: TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 16,
                          ),
                        ),
                      )
                    : ListView.builder(
                        itemCount: _searchResults.length,
                        itemBuilder: (context, index) {
                          final member = _searchResults[index];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppColors.surfaceGrey,
                              backgroundImage: member.photoUrl != null
                                  ? NetworkImage(member.photoUrl!)
                                  : null,
                              child: member.photoUrl == null
                                  ? const Icon(Icons.person)
                                  : null,
                            ),
                            title: Text(member.fullName),
                            subtitle: Text(member.plongeurCode ?? ''),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => _selectMember(member),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomControls() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(16),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // Torch toggle (only in scanner mode)
            if (!_showSearch && _scannedMember == null)
              IconButton(
                onPressed: () => _scannerController.toggleTorch(),
                icon: ValueListenableBuilder<MobileScannerState>(
                  valueListenable: _scannerController,
                  builder: (context, state, child) {
                    final torchOn = state.torchState == TorchState.on;
                    return Icon(
                      torchOn ? Icons.flash_on : Icons.flash_off,
                      color: torchOn
                          ? AppColors.oranje
                          : AppColors.textSecondary,
                    );
                  },
                ),
                tooltip: 'Lampe',
              ),

            const Spacer(),

            // Manual search / Back to scanner button
            if (_scannedMember != null || _showSearch)
              ElevatedButton.icon(
                onPressed: _resetScanner,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.middenblauw,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                ),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scanner'),
              )
            else
              ElevatedButton.icon(
                onPressed: () {
                  setState(() {
                    _showSearch = true;
                    _isScanning = false;
                  });
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.middenblauw,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                ),
                icon: const Icon(Icons.search),
                label: const Text('Recherche manuelle'),
              ),
          ],
        ),
      ),
    );
  }
}

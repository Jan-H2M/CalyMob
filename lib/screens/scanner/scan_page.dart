import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/member_profile.dart';
import '../../models/attendance_record.dart';
import '../../providers/auth_provider.dart';
import '../../services/member_service.dart';
import '../../services/attendance_service.dart';
import 'member_validation_card.dart';

/// Scanner page for member check-in with QR code scanning
class ScanPage extends StatefulWidget {
  const ScanPage({Key? key}) : super(key: key);

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final String _clubId = FirebaseConfig.defaultClubId;
  final MemberService _memberService = MemberService();
  final AttendanceService _attendanceService = AttendanceService();
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
  bool _alreadyCheckedIn = false;
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
    try {
      final member = await _memberService.getMemberById(_clubId, memberId);

      if (member == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Membre non trouvé';
          _scannedMember = null;
        });
        return;
      }

      // Check if already checked in today
      final todayCheckIn =
          await _attendanceService.getTodayCheckIn(_clubId, memberId);

      setState(() {
        _isLoading = false;
        _scannedMember = member;
        _alreadyCheckedIn = todayCheckIn != null;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Erreur: ${e.toString()}';
      });
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
      final record = AttendanceRecord(
        id: '',
        membreId: _scannedMember!.id,
        membreNom: _scannedMember!.nom,
        membrePrenom: _scannedMember!.prenom,
        photoUrl: _scannedMember!.photoUrl,
        checkedInAt: DateTime.now(),
        checkedInBy: currentUser.uid,
        checkedInByName: displayName,
        cotisationStatus: _scannedMember!.cotisationStatus.name,
        cotisationValidite: _scannedMember!.cotisationValidite,
        certificatStatus: _scannedMember!.certificatStatus.name,
        certificatValidite: _scannedMember!.certificatMedicalValidite,
        scanMethod: _scanMethod,
      );

      await _attendanceService.recordAttendance(_clubId, record);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_scannedMember!.fullName} enregistré'),
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
      _alreadyCheckedIn = false;
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
      final results = await _memberService.searchMembers(_clubId, query);
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
            onCheckIn: _alreadyCheckedIn ? null : _recordAttendance,
            isLoading: _isCheckingIn,
            alreadyCheckedIn: _alreadyCheckedIn,
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
                icon: ValueListenableBuilder(
                  valueListenable: _scannerController,
                  builder: (context, state, child) {
                    return Icon(
                      state.torchState == TorchState.on
                          ? Icons.flash_on
                          : Icons.flash_off,
                      color: state.torchState == TorchState.on
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

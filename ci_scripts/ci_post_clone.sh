#!/bin/sh
# Runs on Apple's Xcode Cloud workers, never builds a native app locally.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/toolchain.env"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export FLUTTER_SUPPRESS_ANALYTICS=true
FLUTTER_DIR="$HOME/calymob-flutter-$FLUTTER_VERSION"
export PATH="$FLUTTER_DIR/bin:$PATH"

if [ ! -x "$FLUTTER_DIR/bin/flutter" ]; then
  git clone --depth 1 --branch "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$FLUTTER_DIR"
fi
[ "$(git -C "$FLUTTER_DIR" rev-parse HEAD)" = "$FLUTTER_REVISION" ] || {
  echo 'Unexpected Flutter revision; refusing a non-reproducible build.' >&2
  exit 1
}

cd "$REPO_ROOT"
flutter config --no-analytics
flutter --version
flutter precache --ios
flutter pub get --enforce-lockfile

# Keep the reviewed marketing version; use Apple's product-wide build counter.
BUILD_NAME="$(sed -n 's/^version: *\([^+ ]*\).*/\1/p' pubspec.yaml)"
"$REPO_ROOT/scripts/check_xcode_cloud_environment.sh" "$REPO_ROOT/pubspec.yaml"

# Flutter's config-only path also prepares Pods: pin pod before invoking it.
# Apple's system Ruby 2.6 cannot resolve current native gem dependencies.
# Install the reviewed runtime on the cloud worker, never on the local Mac.
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
if [ ! -x "$(brew --prefix)/opt/ruby@3.3/bin/ruby" ]; then
  brew install ruby@3.3
fi
export PATH="$(brew --prefix ruby@3.3)/bin:$PATH"
[ "$(ruby -e 'print RUBY_VERSION')" = "$RUBY_VERSION" ] || {
  echo 'Unexpected Ruby patch version; review the toolchain pin before release.' >&2
  exit 1
}
export GEM_HOME="$HOME/.calymob-gems/ruby-$RUBY_VERSION"
export GEM_PATH="$GEM_HOME"
export PATH="$GEM_HOME/bin:$PATH"
gem install cocoapods --version "$COCOAPODS_VERSION" --no-document
[ "$(pod --version)" = "$COCOAPODS_VERSION" ] || exit 1

# Generates configuration only. Xcode Cloud compiles, archives, signs and uploads.
flutter build ios --config-only --release --no-pub \
  --build-name "$BUILD_NAME" --build-number "$CI_BUILD_NUMBER"

(cd ios && pod install --deployment)
git diff --exit-code -- pubspec.lock ios/Podfile.lock

# Real widgets, access control, confirmations and QR parsing; no live Firebase.
flutter test --no-pub \
  test/config/firebase_options_test.dart \
  test/models/boutique_product_personalization_test.dart \
  test/models/boutique_thread_colors_test.dart \
  test/providers/boutique_cart_provider_test.dart \
  test/screens/boutique_product_detail_screen_test.dart \
  test/dev/thread_colors_dev_test.dart \
  test/screens/boutique_screen_access_test.dart \
  test/services/boutique_access_service_test.dart \
  test/widgets/boutique_access_guard_test.dart \
  test/screens/boutique_management_navigation_test.dart \
  test/screens/boutique_stock_selection_flow_test.dart \
  test/screens/boutique_qr_confirmation_lifecycle_test.dart \
  test/widgets/boutique_current_payment_panel_test.dart \
  test/widgets/event_payment_options_dialog_test.dart \
  test/services/pool_formation_overview_reader_test.dart \
  test/services/formation_task_roster_service_test.dart \
  test/models/formation_task_roster_test.dart \
  test/widgets/pool_apnee_overview_test.dart \
  test/providers/activity_provider_retry_test.dart \
  test/providers/unread_count_provider_cursor_test.dart \
  test/screens/operations_filter_bar_test.dart \
  test/screens/operations_list_filter_test.dart \
  test/utils/retained_stream_loader_test.dart \
  test/screens/communication_identity_gate_test.dart \
  test/widgets/bug_report_form_test.dart \
  test/services/bug_report_screenshot_upload_test.dart \
  test/models/participant_operation_payment_status_test.dart \
  test/models/participant_operation_untrusted_payment_aliases_test.dart \
  test/screens/operation_detail_unregister_test.dart \
  test/models/dive_environment_test.dart \
  test/screens/formation_list_attention_order_test.dart \
  test/screens/palanquee_simulation_persistence_test.dart \
  test/screens/free_guest_registration_flow_test.dart \
  test/utils/event_registration_error_test.dart \
  test/widgets/directory_contact_actions_test.dart \
  test/services/profile_service_directory_stream_test.dart \
  test/models/member_profile_contact_privacy_test.dart \
  test/services/dive_computer_import_service_test.dart \
  test/services/dive_log_import_registry_test.dart \
  test/services/suunto_dive_log_adapter_test.dart \
  test/services/suunto_share_inbox_test.dart \
  test/services/uddf_dive_log_adapter_test.dart \
  test/services/subsurface_dive_log_adapter_test.dart \
  test/models/boutique \
  test/screens/boutique_receipt_selection_test.dart \
  test/services/boutique_operations_service_test.dart \
  test/screens/boutique_qr_access_test.dart \
  test/services/notification_navigation_service_test.dart \
  test/screens/boutique_action_wizard_test.dart \
  test/screens/boutique_action_route_test.dart \
  test/services/mil_depth_cumulative_test.dart \
  test/services/mil_experience_service_test.dart \
  test/screens/compact_stats_test.dart \
  test/screens/student_360_scope_test.dart \
  test/screens/apnee_dossier_screen_test.dart \
  test/screens/apnee_formation_navigation_test.dart \
  test/screens/pool_formation_tabs_test.dart \
  test/services/piscine_session_service_test.dart \
  test/services/pool_student_history_test.dart \
  test/services/pool_group_correction_service_test.dart \
  test/services/personal_exercise_progress_service_test.dart \
  test/services/profile_service_test_visibility_test.dart \
  test/screens/formation_list_error_state_test.dart \
  test/screens/edit_my_inscription_dialog_test.dart \
  test/services/inscription_edit_refund_test.dart

echo "CalyMob $BUILD_NAME ($CI_BUILD_NUMBER): dependencies and Flutter tests ready."

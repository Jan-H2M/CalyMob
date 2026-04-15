fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios deploy

```sh
[bundle exec] fastlane ios deploy
```

Upload IPA to App Store Connect (TestFlight)

### ios release

```sh
[bundle exec] fastlane ios release
```

Upload IPA directly to App Store for review

### ios submit

```sh
[bundle exec] fastlane ios submit
```

Submit uploaded build to App Store Review (uses existing build, no binary upload)

### ios update_notes

```sh
[bundle exec] fastlane ios update_notes
```

Update What's New (release notes) on the current editable version via ASC API

### ios status

```sh
[bundle exec] fastlane ios status
```

Show App Store review status (editable + in-review + live versions)

### ios validate

```sh
[bundle exec] fastlane ios validate
```

Validate API key connection

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).

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
./scripts/run_fastlane.sh ios deploy
```

Upload IPA to App Store Connect (TestFlight)

### ios release

```sh
./scripts/run_fastlane.sh ios release
```

Upload IPA to the editable App Store version without submitting

### ios submit

```sh
./scripts/run_fastlane.sh ios submit version:<version> build:<build>
```

Submit uploaded build to App Store Review (uses existing build, no binary upload)

### ios update_notes

```sh
./scripts/run_fastlane.sh ios update_notes
```

Update What's New (release notes) on the current editable version via ASC API

### ios status

```sh
./scripts/run_fastlane.sh ios status
```

Show App Store review status (editable + in-review + live versions)

### ios validate

```sh
./scripts/run_fastlane.sh ios validate
```

Validate API key connection

----

Run these commands from the repository root. Every mutating lane requires the
external schema-v2 manifest and its Fastfile verifier. `skip_docs` keeps
Fastlane from replacing these hardened wrapper-only instructions.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).

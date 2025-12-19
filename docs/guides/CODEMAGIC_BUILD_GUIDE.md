# Flutter + Codemagic Build Guide

> **Lessons learned from CalyMob build process (November 2024)**
>
> This guide documents the working configuration after 23 build attempts.
> Use this as a reference for future Flutter projects on Codemagic.

---

## Quick Start Checklist

Before building, verify these files exist and are properly configured:

- [ ] `pubspec.yaml` - Flutter dependencies
- [ ] `android/build.gradle` - Root Gradle config
- [ ] `android/app/build.gradle` - App Gradle config
- [ ] `android/settings.gradle` - Plugin management
- [ ] `android/gradle.properties` - Gradle properties
- [ ] `android/gradle/wrapper/gradle-wrapper.properties` - Gradle version
- [ ] `android/app/src/main/AndroidManifest.xml` - App manifest
- [ ] `android/app/src/main/res/mipmap-*/ic_launcher.png` - App icons (all densities)
- [ ] `android/app/src/main/res/values/styles.xml` - Android themes
- [ ] `android/app/src/main/kotlin/.../MainActivity.kt` - Main activity
- [ ] `codemagic.yaml` - CI/CD configuration
- [ ] `lib/main.dart` - Flutter app entry point

---

## Working Version Matrix (November 2024)

| Component | Version | Notes |
|-----------|---------|-------|
| **Flutter** | 3.19.6 | Compatible with AGP 8.x |
| **Dart** | 3.3.x | Comes with Flutter 3.19.6 |
| **Android Gradle Plugin** | 8.1.0 | Required for Kotlin 1.9.0 |
| **Gradle** | 8.0 | Required for AGP 8.x |
| **Kotlin** | 1.9.0 | Required by Firebase/Google Play Services |
| **Java** | 11 | Better compatibility |
| **Google Services** | 4.4.0 | Firebase integration |
| **compileSdk** | 34 | Android 14 |
| **minSdk** | 21 | Android 5.0 |
| **targetSdk** | 34 | Android 14 |

---

## Complete Configuration Files

### 1. `android/build.gradle`

```gradle
buildscript {
    ext.kotlin_version = '1.9.0'
    repositories {
        google()
        mavenCentral()
    }

    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
        classpath 'com.google.gms:google-services:4.4.0'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.buildDir = '../build'
subprojects {
    project.buildDir = "${rootProject.buildDir}/${project.name}"
}
subprojects {
    project.evaluationDependsOn(':app')
}

tasks.register("clean", Delete) {
    delete rootProject.buildDir
}
```

### 2. `android/app/build.gradle`

```gradle
plugins {
    id "com.android.application"
    id "kotlin-android"
    id "dev.flutter.flutter-gradle-plugin"
}

def localProperties = new Properties()
def localPropertiesFile = rootProject.file('local.properties')
if (localPropertiesFile.exists()) {
    localPropertiesFile.withReader('UTF-8') { reader ->
        localProperties.load(reader)
    }
}

def flutterVersionCode = localProperties.getProperty('flutter.versionCode')
if (flutterVersionCode == null) {
    flutterVersionCode = '1'
}

def flutterVersionName = localProperties.getProperty('flutter.versionName')
if (flutterVersionName == null) {
    flutterVersionName = '1.0.0'
}

android {
    namespace 'your.package.name'  // CHANGE THIS
    compileSdk 34

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_11
        targetCompatibility JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = '11'
    }

    defaultConfig {
        applicationId "your.package.name"  // CHANGE THIS
        minSdk 21
        targetSdk 34
        versionCode flutterVersionCode.toInteger()
        versionName flutterVersionName
        multiDexEnabled true
    }

    signingConfigs {
        release {
            def keystoreProperties = new Properties()
            def keystorePropertiesFile = rootProject.file('key.properties')
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
                storePassword keystoreProperties['storePassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            shrinkResources false
        }
    }
}

flutter {
    source '../..'
}

dependencies {
    implementation 'androidx.multidex:multidex:2.0.1'
}
```

### 3. `android/settings.gradle`

```gradle
pluginManagement {
    def flutterSdkPath = {
        def properties = new Properties()
        file("local.properties").withInputStream { properties.load(it) }
        def flutterSdkPath = properties.getProperty("flutter.sdk")
        assert flutterSdkPath != null, "flutter.sdk not set in local.properties"
        return flutterSdkPath
    }()

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id "dev.flutter.flutter-plugin-loader" version "1.0.0"
    id "com.android.application" version "8.1.0" apply false
    id "org.jetbrains.kotlin.android" version "1.9.0" apply false
}

include ":app"
```

### 4. `android/gradle/wrapper/gradle-wrapper.properties`

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.0-all.zip
```

### 5. `android/gradle.properties`

```properties
org.gradle.jvmargs=-Xmx4G -XX:MaxMetaspaceSize=2G -XX:+HeapDumpOnOutOfMemoryError
android.useAndroidX=true
android.enableJetifier=true
```

### 6. `codemagic.yaml` (Minimal Android Build)

```yaml
workflows:
  android-build:
    name: Android Build
    max_build_duration: 60
    instance_type: mac_mini_m2

    environment:
      flutter: 3.19.6

    scripts:
      - name: Get Flutter packages
        script: flutter pub get

      - name: Build Android APK
        script: flutter build apk --debug

    artifacts:
      - build/app/outputs/flutter-apk/*.apk
```

---

## Required Android Resources

### App Icons

Create PNG icons for all densities in `android/app/src/main/res/`:

| Folder | Size | File |
|--------|------|------|
| `mipmap-mdpi/` | 48x48 | `ic_launcher.png` |
| `mipmap-hdpi/` | 72x72 | `ic_launcher.png` |
| `mipmap-xhdpi/` | 96x96 | `ic_launcher.png` |
| `mipmap-xxhdpi/` | 144x144 | `ic_launcher.png` |
| `mipmap-xxxhdpi/` | 192x192 | `ic_launcher.png` |

**Quick icon generation (macOS):**
```bash
# Create a base icon (replace with your actual icon)
sips -z 48 48 icon.png --out android/app/src/main/res/mipmap-mdpi/ic_launcher.png
sips -z 72 72 icon.png --out android/app/src/main/res/mipmap-hdpi/ic_launcher.png
sips -z 96 96 icon.png --out android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
sips -z 144 144 icon.png --out android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
sips -z 192 192 icon.png --out android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
```

### styles.xml

Create `android/app/src/main/res/values/styles.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">@android:color/white</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
    </style>
</resources>
```

### AndroidManifest.xml

Create `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>

    <application
        android:label="YourAppName"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <meta-data
                android:name="io.flutter.embedding.android.NormalTheme"
                android:resource="@style/NormalTheme"/>
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <meta-data
            android:name="flutterEmbedding"
            android:value="2"/>
    </application>
</manifest>
```

### MainActivity.kt

Create `android/app/src/main/kotlin/your/package/name/MainActivity.kt`:

```kotlin
package your.package.name

import io.flutter.embedding.android.FlutterActivity

class MainActivity: FlutterActivity() {
}
```

---

## Common Errors & Solutions

### 1. "Plugin dev.flutter.flutter-plugin-loader was not found"
**Cause:** Using modern plugin format with old Flutter version
**Solution:** Use Flutter 3.19+ with AGP 8.x, or use classic `apply plugin` format with older versions

### 2. "Error while dexing" / "Kotlin version mismatch"
**Cause:** Kotlin version incompatible with Google Play Services
**Solution:** Use Kotlin 1.9.0 with AGP 8.1.0 and Gradle 8.0

### 3. "Failed to compile FlutterPlugin.kt - filePermissions"
**Cause:** Gradle/Kotlin version incompatibility with Flutter tools
**Solution:** Upgrade to AGP 8.x (doesn't have this issue)

### 4. "resource mipmap/ic_launcher not found"
**Cause:** Missing app icon files
**Solution:** Create properly sized PNG icons in all mipmap folders

### 5. "unable to find directory entry in pubspec.yaml"
**Cause:** pubspec.yaml references non-existent assets/fonts
**Solution:** Remove or create the referenced files

### 6. "SigningConfig release is missing storeFile"
**Cause:** Release build without keystore configuration
**Solution:** Use `--debug` flag or configure signing in Codemagic

### 7. "namespace not specified"
**Cause:** AGP 8.x requires namespace in build.gradle
**Solution:** Add `namespace 'your.package.name'` to android block

### 8. "intl version conflict with flutter_localizations"
**Cause:** flutter_localizations pins intl to specific version
**Solution:** Match intl version to what flutter_localizations requires for your Flutter version

---

## Firebase Setup for Codemagic

### Option 1: Environment Variable (Recommended)

1. Base64 encode your `google-services.json`:
   ```bash
   base64 -i android/app/google-services.json | pbcopy
   ```

2. Add to Codemagic environment variables as `ANDROID_FIREBASE_JSON`

3. Add to codemagic.yaml scripts:
   ```yaml
   - name: Load Firebase config
     script: |
       echo "$ANDROID_FIREBASE_JSON" | base64 --decode > android/app/google-services.json
   ```

### Option 2: Fallback Config

Add a fallback in codemagic.yaml for builds without the secret:
```yaml
- name: Load Firebase config
  script: |
    if [ -z "$ANDROID_FIREBASE_JSON" ]; then
      echo '{"project_info":{"project_id":"your-project"},...}' > android/app/google-services.json
    else
      echo "$ANDROID_FIREBASE_JSON" | base64 --decode > android/app/google-services.json
    fi
```

---

## Release Build Signing

### Configure in Codemagic:

1. Go to **App Settings → Code Signing → Android**
2. Upload your keystore file
3. Enter credentials (keyAlias, keyPassword, storePassword)
4. Reference in codemagic.yaml:
   ```yaml
   environment:
     android_signing:
       - your_keystore_reference
   ```

### Build release APK:
```yaml
- name: Build Release APK
  script: flutter build apk --release
```

---

## Troubleshooting Workflow

1. **Start with debug build** - No signing required
2. **Check Flutter doctor** - Add `flutter doctor -v` to scripts
3. **Verify dependencies** - Check pubspec.yaml versions
4. **Check Gradle versions** - Must be compatible matrix
5. **Verify resources exist** - Icons, manifests, styles
6. **Check error messages** - Often tell you exactly what's wrong

---

## Useful Commands

```bash
# Check Flutter version
flutter --version

# Get dependencies
flutter pub get

# Build debug APK
flutter build apk --debug

# Build release APK
flutter build apk --release

# Build App Bundle (for Play Store)
flutter build appbundle --release

# Clean build
flutter clean && flutter pub get

# Analyze project
flutter analyze
```

---

## Resources

- [Codemagic Flutter Docs](https://docs.codemagic.io/flutter-configuration/flutter-projects/)
- [Flutter Android Deployment](https://docs.flutter.dev/deployment/android)
- [Firebase Flutter Setup](https://firebase.google.com/docs/flutter/setup)
- [Android Gradle Plugin Release Notes](https://developer.android.com/build/releases/gradle-plugin)

---

*Last updated: November 2024*
*Tested with: Flutter 3.19.6, AGP 8.1.0, Kotlin 1.9.0, Gradle 8.0*

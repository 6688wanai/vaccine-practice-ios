#!/usr/bin/env bash
set -euo pipefail

SCHEME="App"
CONFIGURATION="Release"
BUILD_ROOT="build/ios"
DERIVED_DATA="$BUILD_ROOT/DerivedData"
APP_PATH="$DERIVED_DATA/Build/Products/${CONFIGURATION}-iphoneos/App.app"
PACKAGE_DIR="$BUILD_ROOT/package"
IPA_PATH="$BUILD_ROOT/vaccine-practice.ipa"

cd "$(dirname "$0")/.."

npm run mobile:sync

rm -rf "$DERIVED_DATA" "$PACKAGE_DIR" "$IPA_PATH"

xcodebuild build \
  -project ios/App/App.xcodeproj \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO

if [ ! -d "$APP_PATH" ]; then
  echo "App bundle not found: $APP_PATH"
  exit 1
fi

codesign --force --sign - --timestamp=none "$APP_PATH"

mkdir -p "$PACKAGE_DIR/Payload"
cp -R "$APP_PATH" "$PACKAGE_DIR/Payload/App.app"

(
  cd "$PACKAGE_DIR"
  /usr/bin/zip -qry "../$(basename "$IPA_PATH")" Payload
)

echo "IPA output: $IPA_PATH"

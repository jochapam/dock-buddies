#!/bin/bash
# Builds "Dock Buddies 3D.app" next to this script.
set -e
cd "$(dirname "$0")"

APP="Dock Buddies 3D.app"
VERSION="$(cat VERSION 2>/dev/null || echo 0)"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Build for both Apple Silicon and Intel Macs, so the app can be copied to any Mac.
BIN="$APP/Contents/MacOS/DockBuddies3D"
if swiftc -O -parse-as-library -target arm64-apple-macos12 DockBuddies3D.swift -o /tmp/db3d_arm64 2>/dev/null && \
   swiftc -O -parse-as-library -target x86_64-apple-macos12 DockBuddies3D.swift -o /tmp/db3d_x86_64 2>/dev/null; then
  lipo -create /tmp/db3d_arm64 /tmp/db3d_x86_64 -output "$BIN"
  rm -f /tmp/db3d_arm64 /tmp/db3d_x86_64
else
  swiftc -O -parse-as-library DockBuddies3D.swift -o "$BIN"   # this Mac's type only
fi
cp buddies.html "$APP/Contents/Resources/"
cp AppIcon.icns "$APP/Contents/Resources/"

cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>DockBuddies3D</string>
    <key>CFBundleIdentifier</key><string>local.dockbuddies3d</string>
    <key>CFBundleName</key><string>Dock Buddies 3D</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>LSMinimumSystemVersion</key><string>12.0</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
EOF

codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "Built: $APP  — drag it to Applications, then double-click to start."

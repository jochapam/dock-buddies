#!/bin/bash
# Installs (or reinstalls) Dock Buddies 3D: downloads the latest version, puts it in Applications,
# optionally starts it at login, and opens it. After this, the app keeps itself up to date.
#
# Double-click this file, or on any Mac paste into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/jochapam/dock-buddies/main/Install%20Dock%20Buddies.command | bash

APP_NAME="Dock Buddies 3D"
REPO="jochapam/dock-buddies"
say_box() { osascript -e "display dialog \"$1\" buttons {\"OK\"} default button 1 with title \"$APP_NAME\"" >/dev/null 2>&1; }

echo "Installing $APP_NAME..."
WORK="$(mktemp -d)"
HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

# 1. Get the app: the latest release from GitHub, or (if that fails) build it here from this folder.
if curl -fsSL -o "$WORK/app.zip" "https://github.com/$REPO/releases/latest/download/Dock-Buddies-3D.zip" && \
   ditto -x -k "$WORK/app.zip" "$WORK" && [ -d "$WORK/$APP_NAME.app" ]; then
  echo "Downloaded the latest version."
elif [ -f "$HERE/build.sh" ] && command -v swiftc >/dev/null 2>&1 && (cd "$HERE" && bash build.sh); then
  cp -R "$HERE/$APP_NAME.app" "$WORK/"
else
  say_box "Couldn't download Dock Buddies. Please check the internet connection and try again."
  exit 1
fi

# 2. Quit any copy that's running, then install into Applications.
osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1
pkill -x DockBuddies3D >/dev/null 2>&1
DEST="/Applications"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
rm -rf "$DEST/$APP_NAME.app"
cp -R "$WORK/$APP_NAME.app" "$DEST/"
xattr -dr com.apple.quarantine "$DEST/$APP_NAME.app" >/dev/null 2>&1
touch "$DEST/$APP_NAME.app"   # nudge Finder to show the icon
rm -rf "$WORK"

# 3. Open it.
open "$DEST/$APP_NAME.app"
say_box "All done! Barry and Nom are on your Dock. Use the ☕ in the menu bar for Settings (including Open at login), to hide them or to quit. They'll keep themselves up to date."

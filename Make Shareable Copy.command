#!/bin/bash
# Downloads the latest "Dock Buddies 3D.dmg" to your Desktop, ready to send to another Mac.
APP_NAME="Dock Buddies 3D"
OUT="$HOME/Desktop/$APP_NAME.dmg"
if curl -fsSL -o "$OUT" "https://github.com/jochapam/dock-buddies/releases/latest/download/Dock-Buddies-3D.dmg"; then
  osascript -e "display dialog \"Done! \\\"$APP_NAME.dmg\\\" is on your Desktop. Copy it to the other Mac (AirDrop, USB or email), open it, and drag the app into Applications. Or send them the link: github.com/jochapam/dock-buddies/releases/latest\" buttons {\"OK\"} default button 1 with title \"$APP_NAME\"" >/dev/null 2>&1
else
  osascript -e "display dialog \"Couldn't download the disk image. Please check the internet connection.\" buttons {\"OK\"} default button 1 with title \"$APP_NAME\"" >/dev/null 2>&1
fi

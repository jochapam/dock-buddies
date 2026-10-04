#!/bin/bash
# Double-click to remove Dock Buddies 3D completely.
APP_NAME="Dock Buddies 3D"
osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1
pkill -x DockBuddies3D >/dev/null 2>&1
osascript -e "tell application \"System Events\" to delete (every login item whose name is \"$APP_NAME\")" >/dev/null 2>&1
rm -rf "/Applications/$APP_NAME.app" "$HOME/Applications/$APP_NAME.app"
rm -rf "$HOME/Library/Application Support/Dock Buddies"
defaults delete local.dockbuddies3d >/dev/null 2>&1
osascript -e "display dialog \"$APP_NAME has been removed.\" buttons {\"OK\"} default button 1 with title \"$APP_NAME\"" >/dev/null 2>&1

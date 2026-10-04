# Dock Buddies 3D

Barry the plush bear and Nom the alien sit on top of your Mac's Dock, drinking coffee. Now and then they sip, Nom pulls faces and follows your mouse with his eyes, and if you leave the Mac alone for a while they put their mugs down and nod off.

## Install

**Easiest:** paste this into Terminal:

```
curl -fsSL https://raw.githubusercontent.com/jochapam/dock-buddies/main/Install%20Dock%20Buddies.command | bash
```

**Or** download `Dock-Buddies-3D.dmg` from the [latest release](https://github.com/jochapam/dock-buddies/releases/latest), open it and drag the app into Applications. The first time, macOS may ask you to allow it in System Settings → Privacy & Security → **Open Anyway**.

Once installed, the app checks for new versions every few hours (or ☕ → Check for Updates…) and updates itself.

Use the ☕ in the menu bar for Settings (open at login, size, screen and position, birthday message), Move with Mouse, Hide and Quit. To remove it, run `Uninstall Dock Buddies.command`.

## How it's made

| Path | What it is |
| --- | --- |
| `DockBuddies3D.swift` | The Mac app: a transparent window over the Dock, the ☕ menu, Settings, the birthday card and the updater. |
| `buddies.html` | The 3D scene (three.js), built from `scene/`, with both characters' meshes stored inside so it opens instantly. |
| `scene/src/` | Scene source: `sculpt.js` (the characters, sculpted from signed-distance shapes) and `scene.js` (look, animation, and the director that decides when they sip, doze off or celebrate). |
| `scene/build-scene.sh` | Rebuilds `buddies.html` after a scene change, reusing the baked meshes in `scene/baked-meshes.b64`. |
| `build.sh` | Builds `Dock Buddies 3D.app` locally (needs Xcode Command Line Tools). |
| `.github/workflows/release.yml` | Builds the app on GitHub's Macs on every push. |

## Releasing a new version

1. Make the change (for scene changes, run `scene/build-scene.sh`).
2. Bump the number in `VERSION` (for example `2.8` → `2.9`).
3. Push to `main`. The workflow builds it, publishes release `v2.9` with the zip and DMG, and installed copies update themselves.

Pushes that don't change `VERSION` are still built (as a check) but not published.

The birthday message is never stored in this repo or in the app. It's set in Settings on each Mac.
